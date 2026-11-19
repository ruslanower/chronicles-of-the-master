import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id.server";
import { buildMasterPrompt, type NarrateRequest } from "@/game/prompt";
import type { GameState, MasterReply } from "@/game/engine";
import { buildEnemyAiPrompt, parseEnemyAiResponse, type EnemyDecision } from "@/game/enemyAi";
import { generateFallbackMasterReply } from "@/game/fallbackNarrator";

export const masterSchema = z.object({
  narration: z.string(),
  check: z
    .object({ stat: z.enum(["str", "agi", "int", "cha"]), dc: z.number() })
    .nullable()
    .default(null),
  hpChanges: z.array(z.object({ target: z.string(), delta: z.number() })).default([]),
  actComplete: z.boolean().default(false),
  suggestions: z.array(z.string()).default([]),
});

const JSON_FORMAT_INSTRUCTION = `
IMPORTANT: Return ONLY a valid JSON object (no markdown code fences, no extra text) with this exact structure:
{
  "narration": "string (2-4 atmospheric sentences in the requested language)",
  "check": null or { "stat": "str" | "agi" | "int" | "cha", "dc": number },
  "hpChanges": [{ "target": "exact name", "delta": number }],
  "actComplete": boolean,
  "suggestions": ["idea 1", "idea 2", "idea 3"]
}`;

let serverFreeBackoffUntil = 0;

function parseMasterJson(raw: string): MasterReply | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1));
    const parsed = masterSchema.safeParse(obj);
    if (parsed.success && parsed.data.narration.trim().length > 0) {
      return parsed.data;
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}

async function callLovableGateway(
  apiKey: string,
  instructions: string,
  prompt: string,
  signal: AbortSignal,
): Promise<MasterReply | null> {
  const gateway = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    fetch: gateway.fetch,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions,
    prompt,
    abortSignal: signal,
    maxRetries: 0,
    output: Output.object({ schema: masterSchema }),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
        store: false,
        strictJsonSchema: true,
      },
    },
  });
  const output = await result.output;
  if (!output?.narration?.trim()) return null;
  return masterSchema.parse(output);
}

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];
let preferredGeminiModel: string | null = null;
const aiRawCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 400;

function getCachedRaw(key: string): string | null {
  const val = aiRawCache.get(key);
  if (!val) return null;
  aiRawCache.delete(key);
  aiRawCache.set(key, val);
  return val;
}

function setCachedRaw(key: string, val: string): void {
  if (aiRawCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = aiRawCache.keys().next().value;
    if (oldest !== undefined) aiRawCache.delete(oldest);
  }
  aiRawCache.set(key, val);
}

async function callGeminiNativeRaw(
  apiKey: string,
  system: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string | null> {
  const ordered = preferredGeminiModel
    ? [preferredGeminiModel, ...GEMINI_MODELS.filter((m) => m !== preferredGeminiModel)]
    : GEMINI_MODELS;

  for (const model of ordered) {
    if (signal.aborted) break;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.78,
          },
        }),
        signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        preferredGeminiModel = model;
        return text;
      }
    } catch {
      // try next model in list
    }
  }
  return null;
}

async function callChatProviderRaw(
  baseURL: string | undefined,
  apiKey: string,
  modelId: string,
  system: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string | null> {
  const provider = createOpenAI({
    ...(baseURL ? { baseURL } : {}),
    apiKey,
  });
  const { text } = await generateText({
    model: provider.chat(modelId),
    system,
    prompt,
    abortSignal: signal,
    maxRetries: 0,
  });
  return text || null;
}

async function callLocalOllamaRaw(
  system: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string | null> {
  const ollamaUrl = process.env["OLLAMA_URL"] || "http://127.0.0.1:11434/api/chat";
  const ollamaModel = process.env["OLLAMA_MODEL"];
  if (!ollamaModel) return null;
  try {
    const res = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function callDirectPollinationsRaw(
  system: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string | null> {
  if (Date.now() < serverFreeBackoffUntil) return null;
  try {
    const res = await fetch("https://text.pollinations.ai/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai-fast",
        seed: Math.floor(Math.random() * 1_000_000),
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal,
    });
    if (!res.ok) {
      serverFreeBackoffUntil = Date.now() + 60_000;
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    serverFreeBackoffUntil = Date.now() + 60_000;
    return null;
  }
}

function getServerKeys() {
  const viteGemini =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env["VITE_GEMINI_API_KEY"] as string | undefined)
      : undefined;
  return {
    lovableKey: process.env["LOVABLE_API_KEY"],
    geminiKey:
      process.env["GEMINI_API_KEY"] ||
      process.env["GOOGLE_API_KEY"] ||
      process.env["VITE_GEMINI_API_KEY"] ||
      viteGemini,
    openaiKey: process.env["OPENAI_API_KEY"],
    groqKey: process.env["GROQ_API_KEY"],
  };
}

export function hasDedicatedServerAi(): boolean {
  const { lovableKey, geminiKey, openaiKey, groqKey } = getServerKeys();
  return Boolean(lovableKey || geminiKey || openaiKey || groqKey || process.env["OLLAMA_MODEL"]);
}

async function callRawTextWithTimeout(
  system: string,
  prompt: string,
  freeTimeoutMs = 3200,
): Promise<string | null> {
  const cacheKey = `${system.slice(0, 120)}::${prompt}`;
  const cached = getCachedRaw(cacheKey);
  if (cached) return cached;

  const { geminiKey, openaiKey, groqKey } = getServerKeys();
  const hasDedicatedKey = Boolean(geminiKey || openaiKey || groqKey || process.env["OLLAMA_MODEL"]);
  const timeoutMs = hasDedicatedKey ? 6500 : freeTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (geminiKey) {
      try {
        const text = await callGeminiNativeRaw(geminiKey, system, prompt, controller.signal);
        if (text) {
          setCachedRaw(cacheKey, text);
          return text;
        }
      } catch {
        // fall through to next provider
      }
    }
    if (groqKey) {
      try {
        const text = await callChatProviderRaw(
          "https://api.groq.com/openai/v1",
          groqKey,
          "llama-3.3-70b-versatile",
          system,
          prompt,
          controller.signal,
        );
        if (text) {
          setCachedRaw(cacheKey, text);
          return text;
        }
      } catch {
        // fall through to next provider
      }
    }
    if (openaiKey) {
      try {
        const text = await callChatProviderRaw(
          undefined,
          openaiKey,
          "gpt-4o-mini",
          system,
          prompt,
          controller.signal,
        );
        if (text) {
          setCachedRaw(cacheKey, text);
          return text;
        }
      } catch {
        // fall through to next provider
      }
    }
    if (process.env["OLLAMA_MODEL"]) {
      const ollamaText = await callLocalOllamaRaw(system, prompt, controller.signal);
      if (ollamaText) {
        setCachedRaw(cacheKey, ollamaText);
        return ollamaText;
      }
    }

    const freeText = await callDirectPollinationsRaw(system, prompt, controller.signal);
    if (freeText) setCachedRaw(cacheKey, freeText);
    return freeText;
  } finally {
    clearTimeout(timer);
  }
}

export async function callMasterWithTimeout(
  instructions: string,
  prompt: string,
): Promise<MasterReply | null> {
  const { lovableKey, geminiKey, openaiKey, groqKey } = getServerKeys();
  const hasDedicatedKey = Boolean(lovableKey || geminiKey || openaiKey || groqKey);
  const timeoutMs = hasDedicatedKey ? 8000 : 3200;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (lovableKey) {
      try {
        const res = await callLovableGateway(lovableKey, instructions, prompt, controller.signal);
        if (res) return res;
      } catch (err) {
        console.warn(
          "Lovable AI gateway error, trying fallback provider:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    const raw = await callRawTextWithTimeout(
      `${instructions}\n${JSON_FORMAT_INSTRUCTION}`,
      prompt,
      3200,
    );
    return raw ? parseMasterJson(raw) : null;
  } catch (err) {
    console.warn(
      "AI master provider error or timeout, switching to local narrator:",
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function narrateServerWithMeta(
  state: GameState,
  req: NarrateRequest,
): Promise<{ reply: MasterReply; fromAi: boolean }> {
  const { instructions, prompt } = buildMasterPrompt(state, req);
  try {
    const aiReply = await callMasterWithTimeout(instructions, prompt);
    if (aiReply) return { reply: aiReply, fromAi: true };
  } catch {
    // ignore and fall back to local procedural narrator
  }
  return { reply: generateFallbackMasterReply(state, req), fromAi: false };
}

export async function narrateServer(state: GameState, req: NarrateRequest): Promise<MasterReply> {
  const res = await narrateServerWithMeta(state, req);
  return res.reply;
}

/** Server-side Tactical AI Enemy Controller with automatic tactical-utility fallback. */
export async function decideEnemiesServer(
  state: GameState,
  enemyIds: string[],
): Promise<Record<string, EnemyDecision>> {
  if (!enemyIds.length) return {};
  const { instructions, prompt } = buildEnemyAiPrompt(state, enemyIds);
  try {
    const raw = await callRawTextWithTimeout(instructions, prompt, 1800);
    return parseEnemyAiResponse(raw ?? "", state, enemyIds);
  } catch {
    return parseEnemyAiResponse("", state, enemyIds);
  }
}

export function masterErrorMessage(e: unknown, lang: "uk" | "en") {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("402"))
    return lang === "en"
      ? "AI credits have run out. Using built-in Game Master."
      : "Закінчились ШІ-кредити. Грає вбудований ШІ-Майстер.";
  if (msg.includes("429"))
    return lang === "en"
      ? "The Master is overloaded. Try again in a minute."
      : "Майстер перевантажений. Спробуйте за хвилину.";
  return lang === "en"
    ? "The Master lost his train of thought. Try again."
    : "Майстер задумався і загубив думку. Спробуйте ще раз.";
}
