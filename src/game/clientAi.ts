import type { GameState, MasterReply } from "./engine";
import { buildEnemyAiPrompt, parseEnemyAiResponse, type EnemyDecision } from "./enemyAi";
import { buildMasterPrompt, type NarrateRequest } from "./prompt";

const AI_KEY_STORAGE = "chronicles-ai-key";

const JSON_FORMAT_INSTRUCTION = `
IMPORTANT: Return ONLY a valid JSON object (no markdown code fences, no extra text) with this exact structure:
{
  "narration": "string (2-4 atmospheric, varied sentences in the requested language, using concrete hero/enemy names)",
  "check": null or { "stat": "str" | "agi" | "int" | "cha", "dc": number },
  "hpChanges": [{ "target": "exact name", "delta": number }],
  "actComplete": boolean,
  "suggestions": ["idea 1", "idea 2", "idea 3"]
}`;

let freeEndpointBackoffUntil = 0;

export function getStoredAiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(AI_KEY_STORAGE) ?? "").trim();
  } catch {
    return "";
  }
}

export function setStoredAiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(AI_KEY_STORAGE, trimmed);
    else localStorage.removeItem(AI_KEY_STORAGE);
    freeEndpointBackoffUntil = 0;
  } catch {
    // ignore storage errors
  }
}

export function isFreeClientAiBackedOff(): boolean {
  return Date.now() < freeEndpointBackoffUntil;
}

function parseClientMasterJson(raw: string): MasterReply | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj["narration"] !== "string" || !obj["narration"].trim()) return null;

    let check: MasterReply["check"] = null;
    if (obj["check"] && typeof obj["check"] === "object") {
      const c = obj["check"] as Record<string, unknown>;
      const stat = c["stat"];
      const dc = Number(c["dc"]);
      if (
        (stat === "str" || stat === "agi" || stat === "int" || stat === "cha") &&
        Number.isFinite(dc)
      ) {
        check = { stat, dc };
      }
    }

    const hpChanges: MasterReply["hpChanges"] = Array.isArray(obj["hpChanges"])
      ? obj["hpChanges"]
          .filter((item): item is { target: string; delta: number } => {
            if (!item || typeof item !== "object") return false;
            const rec = item as Record<string, unknown>;
            return typeof rec["target"] === "string" && Number.isFinite(Number(rec["delta"]));
          })
          .map((item) => ({ target: item.target, delta: Number(item.delta) }))
      : [];

    const suggestions = Array.isArray(obj["suggestions"])
      ? obj["suggestions"]
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, 3)
      : [];

    return {
      narration: obj["narration"].trim(),
      check,
      hpChanges,
      actComplete: Boolean(obj["actComplete"]),
      suggestions,
    };
  } catch {
    return null;
  }
}

async function fetchOpenAiContent(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const CLIENT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];
let preferredClientGeminiModel: string | null = null;

async function fetchGeminiNativeContent(
  apiKey: string,
  systemPrompt: string,
  prompt: string,
  temperature: number,
  timeoutMs: number,
): Promise<string | null> {
  const ordered = preferredClientGeminiModel
    ? [
        preferredClientGeminiModel,
        ...CLIENT_GEMINI_MODELS.filter((m) => m !== preferredClientGeminiModel),
      ]
    : CLIENT_GEMINI_MODELS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const model of ordered) {
      if (controller.signal.aborted) break;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature,
            },
          }),
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          preferredClientGeminiModel = model;
          return text;
        }
      } catch {
        // try next model
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callConfiguredOrFreeClientAi(
  systemPrompt: string,
  prompt: string,
  temperature = 0.85,
  freeTimeoutMs = 3600,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const customKey =
    getStoredAiKey() || (import.meta.env["VITE_GEMINI_API_KEY"] as string | undefined) || "";

  if (customKey) {
    if (customKey.startsWith("AIza") || customKey.startsWith("AQ.")) {
      const content = await fetchGeminiNativeContent(
        customKey,
        systemPrompt,
        prompt,
        temperature,
        6000,
      );
      if (content) return content;
    } else if (customKey.startsWith("gsk_")) {
      const content = await fetchOpenAiContent(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${customKey}` },
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature,
          response_format: { type: "json_object" },
        },
        6000,
      );
      if (content) return content;
    } else {
      const content = await fetchOpenAiContent(
        "https://api.openai.com/v1/chat/completions",
        { Authorization: `Bearer ${customKey}` },
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature,
          response_format: { type: "json_object" },
        },
        6000,
      );
      if (content) return content;
    }
  }

  if (Date.now() < freeEndpointBackoffUntil) {
    return null;
  }

  const freeContent = await fetchOpenAiContent(
    "https://text.pollinations.ai/openai/chat/completions",
    {},
    {
      model: "openai-fast",
      seed: Math.floor(Math.random() * 1_000_000),
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    },
    freeTimeoutMs,
  );

  if (!freeContent) {
    freeEndpointBackoffUntil = Date.now() + 45_000;
  }

  return freeContent;
}

export async function narrateClientAi(
  state: GameState,
  req: NarrateRequest,
): Promise<MasterReply | null> {
  const { instructions, prompt } = buildMasterPrompt(state, req);
  const systemPrompt = `${instructions}\n${JSON_FORMAT_INSTRUCTION}`;
  const raw = await callConfiguredOrFreeClientAi(systemPrompt, prompt, 0.85, 3600);
  return raw ? parseClientMasterJson(raw) : null;
}

export async function decideEnemiesClientAi(
  state: GameState,
  enemyIds: string[],
): Promise<Record<string, EnemyDecision>> {
  if (!enemyIds.length) return {};
  const { instructions, prompt } = buildEnemyAiPrompt(state, enemyIds);
  const raw = await callConfiguredOrFreeClientAi(instructions, prompt, 0.65, 1600);
  return parseEnemyAiResponse(raw ?? "", state, enemyIds);
}
