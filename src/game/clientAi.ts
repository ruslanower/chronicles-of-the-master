import type { GameState, MasterReply } from "./engine";
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
      if ((stat === "str" || stat === "agi" || stat === "int" || stat === "cha") && Number.isFinite(dc)) {
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
      ? obj["suggestions"].filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3)
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

async function callOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<MasterReply | null> {
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseClientMasterJson(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function narrateClientAi(state: GameState, req: NarrateRequest): Promise<MasterReply | null> {
  if (typeof window === "undefined") return null;

  const { instructions, prompt } = buildMasterPrompt(state, req);
  const systemPrompt = `${instructions}\n${JSON_FORMAT_INSTRUCTION}`;
  const customKey = getStoredAiKey() || (import.meta.env["VITE_GEMINI_API_KEY"] as string | undefined) || "";

  // 1. User-supplied or env Gemini / Groq / OpenAI key (super fast < 1s)
  if (customKey) {
    if (customKey.startsWith("AIza")) {
      const reply = await callOpenAiCompatible(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        { Authorization: `Bearer ${customKey}` },
        {
          model: "gemini-2.0-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.85,
          response_format: { type: "json_object" },
        },
        6000,
      );
      if (reply) return reply;
    } else if (customKey.startsWith("gsk_")) {
      const reply = await callOpenAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${customKey}` },
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.85,
          response_format: { type: "json_object" },
        },
        6000,
      );
      if (reply) return reply;
    } else {
      const reply = await callOpenAiCompatible(
        "https://api.openai.com/v1/chat/completions",
        { Authorization: `Bearer ${customKey}` },
        {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.85,
          response_format: { type: "json_object" },
        },
        6000,
      );
      if (reply) return reply;
    }
  }

  // 2. Built-in free browser AI (Pollinations OpenAI endpoint) with circuit breaker so it never lags the game
  if (Date.now() < freeEndpointBackoffUntil) {
    return null;
  }

  const freeReply = await callOpenAiCompatible(
    "https://text.pollinations.ai/openai/chat/completions",
    {},
    {
      model: "openai-fast",
      seed: Math.floor(Math.random() * 1_000_000),
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    },
    3600,
  );

  if (!freeReply) {
    // Back off for 45s if the public free endpoint is slow or unreachable so turns stay snappy
    freeEndpointBackoffUntil = Date.now() + 45_000;
  }

  return freeReply;
}
