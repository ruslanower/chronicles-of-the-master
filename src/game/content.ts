import type { Stats } from "./data";
import type { Lang } from "./prologue";

export type AbilityKind = "attack" | "aoe" | "stun" | "heal" | "hide" | "shield";
export type Ability = {
  id: string;
  kind: AbilityKind;
  dice?: string | undefined; // e.g. "1d8"
  stat: keyof Stats;
  cooldown: number; // rounds before reuse (0 = always)
  name: Record<Lang, string>;
  desc: Record<Lang, string>;
};

const A = (id: string, kind: AbilityKind, stat: keyof Stats, dice: string | undefined, cooldown: number, nameUk: string, nameEn: string, descUk: string, descEn: string): Ability => ({ id, kind, stat, dice, cooldown, name: { uk: nameUk, en: nameEn }, desc: { uk: descUk, en: descEn } });

/** Combat abilities per hero id. Signature skills follow the campaign skill names. */
export const ABILITIES: Record<string, Ability[]> = {
  hero_illusionist: [
    A("blade", "attack", "cha", "1d6", 0, "Клинок ілюзій", "Illusory Blade", "Удар уявним лезом", "Strike with a phantom blade"),
    A("whisper", "stun", "cha", undefined, 2, "Гіпнотичний Шепіт", "Hypnotic Whisper", "Ворог пропускає наступний хід", "The enemy skips its next turn"),
    A("mirage", "hide", "cha", undefined, 2, "Міраж Блазня", "Jester's Mirage", "Союзник стає невидимим на 1 раунд", "An ally turns invisible for 1 round"),
  ],
  hero_shadow_elf: [
    A("fangs", "attack", "agi", "1d8", 0, "Ікла Ночі", "Fangs of Night", "Парні клинки", "Twin blades"),
    A("roof", "attack", "agi", "2d6", 2, "Удар з даху", "Rooftop Strike", "Сильний удар зненацька", "A heavy surprise strike"),
    A("smoke", "hide", "agi", undefined, 2, "Димова Завіса", "Smoke Screen", "Зникнути з очей ворогів на 1 раунд", "Vanish from enemies' sight for 1 round"),
  ],
  hero_forest_druid: [
    A("sting", "attack", "int", "1d6", 0, "Жало Рою", "Swarm Sting", "Хмара комах жалить ворога", "A cloud of insects stings the foe"),
    A("swarm", "stun", "int", undefined, 2, "Голос Підземного Рою", "Voice of the Swarm", "Ворог пропускає наступний хід", "The enemy skips its next turn"),
    A("calm", "heal", "int", "1d8", 1, "Дотик Спокою", "Touch of Calm", "Лікує союзника", "Heals an ally"),
  ],
  hero_astral_warlock: [
    A("flare", "attack", "int", "1d10", 0, "Астральний спалах", "Astral Flare", "Удар холодним полум'ям", "A bolt of cold flame"),
    A("storm", "aoe", "int", "1d6", 2, "Подих Вентиляційної Бурі", "Breath of the Storm", "Шкода всім ворогам", "Damages every enemy"),
    A("silence", "hide", "int", undefined, 2, "Покрив Тиші", "Veil of Silence", "Союзник стає невидимим на 1 раунд", "An ally turns invisible for 1 round"),
  ],
  hero_kharakternyk: [
    A("saber", "attack", "str", "1d8", 0, "Шабля «Вовча Зоря»", "Wolf Dawn Saber", "Удар срібною шаблею", "A silver saber strike"),
    A("whirl", "aoe", "agi", "1d6", 2, "Вихор Срібної Сталі", "Whirl of Silver Steel", "Шкода всім ворогам", "Damages every enemy"),
    A("tame", "stun", "cha", undefined, 2, "Приборкувач", "Beast Tamer", "Ворог пропускає наступний хід", "The enemy skips its next turn"),
  ],
  hero_runic_guardian: [
    A("hammer", "attack", "str", "1d10", 0, "Молот «Громовержець»", "Thunder Hammer", "Важкий удар молотом", "A heavy hammer blow"),
    A("bastion", "shield", "str", undefined, 2, "Незламний Бастіон", "Unbreakable Bastion", "+3 до захисту всього загону на 1 раунд", "+3 defence for the whole party for 1 round"),
    A("seal", "stun", "str", undefined, 2, "Печатка Брами", "Gate Seal", "Ворог пропускає наступний хід", "The enemy skips its next turn"),
  ],
};

export type EnemyDef = { key: string; name: Record<Lang, string>; hp: number; ac: number; attack: string; bonus: number; sprite: string };
export type NpcDef = { name: Record<Lang, string>; sprite: string };

const knight = (n: number): EnemyDef => ({ key: `knight${n}`, name: { uk: `Лицар Варти ${["I", "II", "III"][n - 1]}`, en: `Guard Knight ${["I", "II", "III"][n - 1]}` }, hp: 12, ac: 12, attack: "1d6", bonus: 3, sprite: `/game/npcs/iron_knight_${n}.png` });

/** Enemies that actually fight in each act (decorative crowds are background only). */
export const ENCOUNTERS: Record<number, { enemies: EnemyDef[]; npcs: NpcDef[] }> = {
  1: { enemies: [knight(1), knight(2), knight(3)], npcs: [] },
  2: {
    enemies: [1, 2].map((n) => ({ key: `xbow${n}`, name: { uk: `Арбалетник ${n === 1 ? "I" : "II"}`, en: `Crossbowman ${n === 1 ? "I" : "II"}` }, hp: 10, ac: 11, attack: "1d8", bonus: 3, sprite: `/game/npcs/crossbow_patrol_${n}.png` })),
    npcs: [],
  },
  3: {
    enemies: [1, 2].map((n) => ({ key: `roach${n}`, name: { uk: `Тарган-Страж ${n === 1 ? "I" : "II"}`, en: `Roach Guard ${n === 1 ? "I" : "II"}` }, hp: 14, ac: 12, attack: "1d6", bonus: 2, sprite: `/game/npcs/cockroach_guard_${n}.png` })),
    npcs: [],
  },
  4: { enemies: [], npcs: [{ name: { uk: "Тарганячий Король", en: "The Roach King" }, sprite: "/game/npcs/cockroach_king_boss.png" }] },
  5: { enemies: [], npcs: [{ name: { uk: "Конюх Родан", en: "Rodan the Stablemaster" }, sprite: "/game/npcs/stablemaster_rodan_1.png" }, { name: { uk: "Білий кінь", en: "White horse" }, sprite: "/game/npcs/white_horse_1.png" }] },
  6: { enemies: [], npcs: [{ name: { uk: "Король-Узурпатор", en: "The Usurper King" }, sprite: "/game/npcs/usurper_king_1.png" }, { name: { uk: "Середній син короля", en: "The king's middle son" }, sprite: "/game/npcs/birthday_prince_1.png" }] },
  7: { enemies: [], npcs: [{ name: { uk: "Головний кухар", en: "The head chef" }, sprite: "/game/npcs/castle_chef_1.png" }] },
  8: { enemies: [{ ...knight(2), hp: 14 }, { ...knight(3), hp: 14 }], npcs: [] },
};

/** Healing amount from an item bonus like "+12 HP" (null if not a healing item). */
export const itemHeal = (bonus?: string) => {
  const m = bonus?.match(/\+(\d+)\s*HP/i);
  return m ? Number(m[1]) : null;
};
