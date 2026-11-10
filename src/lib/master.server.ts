import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id.server";
import { buildMasterPrompt, type NarrateRequest } from "@/game/prompt";
import type { GameState, MasterReply } from "@/game/engine";
import { generateFallbackMasterReply } from "@/game/fallbackNarrator";

export const masterSchema = z.object({
  narration: z.string(),
  check: z.object({ stat: z.enum(["str", "agi", "int", "cha"]), dc: z.number() }).nullable(),
  hpChanges: z.array(z.object({ target: z.string(), delta: z.number() })),
  actComplete: z.boolean(),
  suggestions: z.array(z.string()),
});

type ProviderConfig = {
  provider: ReturnType<typeof createOpenAI>;
  model: string;
  supportsReasoning?: boolean;
};

function resolveAIProvider(): ProviderConfig | null {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    const gateway = createLovableAiGatewayRunIdFetch();
    return {
      provider: createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1",
        apiKey: lovableKey,
        fetch: gateway.fetch,
        headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      }),
      model: "openai/gpt-6-astra",
      supportsReasoning: true,
    };
  }

  const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
  if (geminiKey) {
    return {
      provider: createOpenAI({
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: geminiKey,
      }),
      model: "gemini-2.0-flash",
    };
  }

  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    return {
      provider: createOpenAI({
        apiKey: openaiKey,
      }),
      model: "gpt-4o-mini",
    };
  }

  const groqKey = process.env["GROQ_API_KEY"];
  if (groqKey) {
    return {
      provider: createOpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: groqKey,
      }),
      model: "llama-3.3-70b-versatile",
    };
  }

  // Free default AI service (Pollinations OpenAI-compatible endpoint, requires no API key)
  try {
    return {
      provider: createOpenAI({
        baseURL: "https://text.pollinations.ai/openai",
        apiKey: "free-tier",
      }),
      model: "openai",
    };
  } catch {
    return null;
  }
}

export async function callMasterWithTimeout(instructions: string, prompt: string, timeoutMs = 4500): Promise<MasterReply | null> {
  const cfg = resolveAIProvider();
  if (!cfg) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = streamText({
      model: cfg.provider.responses ? cfg.provider.responses(cfg.model) : cfg.provider.chat(cfg.model),
      instructions,
      prompt,
      abortSignal: controller.signal,
      output: Output.object({ schema: masterSchema }),
      ...(cfg.supportsReasoning
        ? {
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
          }
        : {}),
    });

    const output = await result.output;
    clearTimeout(timer);
    if (!output?.narration?.trim()) return null;
    return masterSchema.parse(output);
  } catch (err) {
    clearTimeout(timer);
    console.warn("AI master provider error or timeout, switching to local narrator:", err);
    return null;
  }
}

export async function narrateServer(state: GameState, req: NarrateRequest): Promise<MasterReply> {
  const { instructions, prompt } = buildMasterPrompt(state, req);
  try {
    const aiReply = await callMasterWithTimeout(instructions, prompt, 4500);
    if (aiReply) return aiReply;
  } catch {
    // ignore and fall back
  }
  return generateFallbackMasterReply(state, req);
}

export function masterErrorMessage(e: unknown, lang: "uk" | "en") {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("402")) return lang === "en" ? "AI credits have run out. Using built-in Game Master." : "Закінчились ШІ-кредити. Грає вбудований ШІ-Майстер.";
  if (msg.includes("429")) return lang === "en" ? "The Master is overloaded. Try again in a minute." : "Майстер перевантажений. Спробуйте за хвилину.";
  return lang === "en" ? "The Master lost his train of thought. Try again." : "Майстер задумався і загубив думку. Спробуйте ще раз.";
}
