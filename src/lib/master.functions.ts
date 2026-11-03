import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GameState } from "@/game/engine";
import type { NarrateRequest } from "@/game/prompt";

const req = z.union([
  z.object({ kind: z.literal("mechanic"), summary: z.string().max(800) }),
  z.object({ kind: z.literal("free"), text: z.string().max(600), d20: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("enemies"), summary: z.array(z.string().max(400)).max(12) }),
  z.object({ kind: z.literal("chat"), from: z.string().max(40), text: z.string().max(400) }),
]);

/** Solo-mode narration: the browser owns its own game state and asks the Master to narrate. */
export const masterNarrate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const parsed = z.object({ state: z.record(z.string(), z.unknown()), req }).parse(d);
    if (JSON.stringify(parsed.state).length > 120_000) throw new Error("state too large");
    return parsed as unknown as { state: GameState; req: NarrateRequest };
  })
  .handler(async ({ data }) => {
    const { narrateServer, masterErrorMessage } = await import("./master.server");
    try {
      return { ok: true as const, reply: await narrateServer(data.state, data.req) };
    } catch (e) {
      console.error(e);
      return { ok: false as const, error: masterErrorMessage(e, data.state.lang === "en" ? "en" : "uk") };
    }
  });
