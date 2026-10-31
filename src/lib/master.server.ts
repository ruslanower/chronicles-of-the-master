import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./gateway-run-id.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export const masterSchema = z.object({
  narration: z.string(),
  check: z
    .object({
      stat: z.enum(["str", "agi", "int", "cha"]),
      dc: z.number(),
      success: z.boolean(),
    })
    .nullable(),
  hpChanges: z.array(z.object({ target: z.string(), delta: z.number() })),
  actComplete: z.boolean(),
  suggestions: z.array(z.string()),
});

export type MasterReply = z.infer<typeof masterSchema>;

export async function callMaster(instructions: string, prompt: string, apiKey: string | undefined): Promise<MasterReply> {
  if (!apiKey) throw new Error("ШІ-Майстер не налаштований");
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
  if (!output?.narration.trim()) throw new Error("Майстер не повернув розповідь");
  return masterSchema.parse(output);
}
