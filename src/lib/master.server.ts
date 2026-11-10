import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id.server";
import { buildMasterPrompt, type NarrateRequest } from "@/game/prompt";
import type { GameState, MasterReply } from "@/game/engine";
import { generateFallbackMasterReply } from "@/game/fallbackNarrator";

export const masterSchema = z.object({
  narration: z.string(),
  check: z.object({ stat: z.enum(["str", "agi", "int", "cha"]), dc: z.number() }).nullable().default(null),
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

async function callLovableGateway(apiKey: string, instructions: string, prompt: string, signal: AbortSignal): Promise<MasterReply | null> {
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

async function callChatProvider(
  baseURL: string | undefined,
  apiKey: string,
  modelId: string,
  instructions: string,
  prompt: string,
  signal: AbortSignal,
): Promise<MasterReply | null> {
  const provider = createOpenAI({
    ...(baseURL ? { baseURL } : {}),
    apiKey,
  });
  const { text } = await generateText({
    model: provider.chat(modelId),
    system: `${instructions}\n${JSON_FORMAT_INSTRUCTION}`,
    prompt,
    abortSignal: signal,
  });
  return parseMasterJson(text);
}

export async function callMasterWithTimeout(instructions: string, prompt: string): Promise<MasterReply | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];

  const timeoutMs = lovableKey || geminiKey || openaiKey || groqKey ? 12000 : 7500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (lovableKey) {
      const res = await callLovableGateway(lovableKey, instructions, prompt, controller.signal);
      if (res) return res;
    }
    if (geminiKey) {
      const res = await callChatProvider(
        "https://generativelanguage.googleapis.com/v1beta/openai/",
        geminiKey,
        "gemini-2.0-flash",
        instructions,
        prompt,
        controller.signal,
      );
      if (res) return res;
    }
    if (openaiKey) {
      const res = await callChatProvider(undefined, openaiKey, "gpt-4o-mini", instructions, prompt, controller.signal);
      if (res) return res;
    }
    if (groqKey) {
      const res = await callChatProvider(
        "https://api.groq.com/openai/v1",
        groqKey,
        "llama-3.3-70b-versatile",
        instructions,
        prompt,
        controller.signal,
      );
      if (res) return res;
    }

    // Free public chat completion fallback (Pollinations OpenAI-compatible endpoint)
    const freeRes = await callChatProvider(
      "https://text.pollinations.ai/openai",
      "free-tier",
      "openai",
      instructions,
      prompt,
      controller.signal,
    );
    return freeRes;
  } catch (err) {
    console.warn("AI master provider error or timeout, switching to local narrator:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function narrateServer(state: GameState, req: NarrateRequest): Promise<MasterReply> {
  const { instructions, prompt } = buildMasterPrompt(state, req);
  try {
    const aiReply = await callMasterWithTimeout(instructions, prompt);
    if (aiReply) return aiReply;
  } catch {
    // ignore and fall back to local procedural narrator
  }
  return generateFallbackMasterReply(state, req);
}

export function masterErrorMessage(e: unknown, lang: "uk" | "en") {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("402")) return lang === "en" ? "AI credits have run out. Using built-in Game Master." : "Закінчились ШІ-кредити. Грає вбудований ШІ-Майстер.";
  if (msg.includes("429")) return lang === "en" ? "The Master is overloaded. Try again in a minute." : "Майстер перевантажений. Спробуйте за хвилину.";
  return lang === "en" ? "The Master lost his train of thought. Try again." : "Майстер задумався і загубив думку. Спробуйте ще раз.";
}
