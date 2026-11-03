import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id.server";
import { buildMasterPrompt, type NarrateRequest } from "@/game/prompt";
import type { GameState, MasterReply } from "@/game/engine";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export const masterSchema = z.object({
  narration: z.string(),
  check: z.object({ stat: z.enum(["str", "agi", "int", "cha"]), dc: z.number() }).nullable(),
  hpChanges: z.array(z.object({ target: z.string(), delta: z.number() })),
  actComplete: z.boolean(),
  suggestions: z.array(z.string()),
});

export async function callMaster(instructions: string, prompt: string): Promise<MasterReply> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI master is not configured");
  const gateway = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    fetch: gateway.fetch,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses(MODEL),
    instructions,
    prompt,
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
  if (!output?.narration.trim()) throw new Error("The Master returned no narration");
  return masterSchema.parse(output);
}

export const narrateServer = (state: GameState, req: NarrateRequest) => {
  const { instructions, prompt } = buildMasterPrompt(state, req);
  return callMaster(instructions, prompt);
};

export function masterErrorMessage(e: unknown, lang: "uk" | "en") {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("402")) return lang === "en" ? "AI credits have run out. Top up in settings." : "Закінчились ШІ-кредити. Поповніть баланс у налаштуваннях.";
  if (msg.includes("429")) return lang === "en" ? "The Master is overloaded. Try again in a minute." : "Майстер перевантажений. Спробуйте за хвилину.";
  return lang === "en" ? "The Master lost his train of thought. Try again." : "Майстер задумався і загубив думку. Спробуйте ще раз.";
}
