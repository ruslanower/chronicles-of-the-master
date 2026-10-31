import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  worldRules: z.string(),
  act: z.object({
    title: z.string(),
    locationName: z.string(),
    objective: z.string(),
    entities: z.array(z.string()),
    isFinal: z.boolean(),
  }),
  party: z.array(
    z.object({
      name: z.string(),
      hp: z.number(),
      maxHp: z.number(),
      stats: z.object({ str: z.number(), agi: z.number(), int: z.number(), cha: z.number() }),
      gear: z.array(z.string()),
      skills: z.array(z.string()),
    }),
  ),
  activeHero: z.string(),
  mode: z.enum(["say", "action"]),
  text: z.string().max(600),
  d20: z.number().int().min(1).max(20).nullable(),
  history: z.array(z.string()).max(16),
});

export const masterTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const { callMaster } = await import("./master.server");
    const instructions = `${data.worldRules}

ТИ — ЖИВИЙ МАЙСТЕР ГРИ (D&D). Відповідай ВИКЛЮЧНО українською.
Стиль: атмосферно, кінематографічно, 2–4 короткі речення, з конкретними деталями сцени (звуки, світло, запахи). Звертайся до героїв на ім'я. Без markdown.
ПРАВИЛА:
- Режим "say" (мова/діалог/огляд): кубик не кидається, check = null. Відіграй NPC живими репліками.
- Режим "action": гравець уже кинув D20 (значення дано). Обери характеристику (str/agi/int/cha) і складність dc (8 легко … 18 дуже важко). success = (d20 + бонус характеристики героя) >= dc. d20=20 — завжди блискучий успіх, d20=1 — завжди провал з комічно-драматичними наслідками. Опиши наслідок відповідно.
- hpChanges: зміни HP героїв (від'ємні — шкода, додатні — лікування). target = точне ім'я героя. Шкода помірна (1–6). Можна порожній масив.
- actComplete = true лише коли загін справді виконав мету акту (зазвичай після 3–6 вдалих ходів). Тоді в narration — драматичний перехід до наступної сцени${data.act.isFinal ? " (це ФІНАЛ кампанії — епічна розв'язка, корона падає)" : ""}.
- suggestions: 3 короткі (до 8 слів) ідеї наступних дій для загону.
- Поважай свободу гравців, але м'яко спрямовуй до мети акту.`;

    const p = data.party
      .map(
        (h) =>
          `${h.name} HP ${h.hp}/${h.maxHp}; СИЛ ${h.stats.str} СПР ${h.stats.agi} РОЗ ${h.stats.int} ХАР ${h.stats.cha}; спорядження: ${h.gear.join(", ")}; уміння: ${h.skills.join(", ")}`,
      )
      .join("\n");
    const prompt = `СЦЕНА: ${data.act.title} — ${data.act.locationName}
МЕТА АКТУ: ${data.act.objective}
ПРИСУТНІ: ${data.act.entities.join(", ")}
ЗАГІН:
${p}
ОСТАННІ ПОДІЇ:
${data.history.join("\n") || "(початок акту)"}

ХІД: ${data.activeHero} — ${data.mode === "say" ? "КАЖЕ" : "ДІЄ"}: «${data.text}»${data.d20 ? `\nКИДОК D20: ${data.d20}` : ""}`;

    try {
      return { ok: true as const, reply: await callMaster(instructions, prompt, process.env["LOVABLE_API_KEY"]) };
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("402")) return { ok: false as const, error: "Закінчились ШІ-кредити. Поповніть баланс у налаштуваннях." };
      if (msg.includes("429")) return { ok: false as const, error: "Майстер перевантажений. Спробуйте за хвилину." };
      return { ok: false as const, error: "Майстер задумався і загубив думку. Спробуйте ще раз." };
    }
  });
