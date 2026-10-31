import raw from "./campaign.json";

export type Stats = { str: number; agi: number; int: number; cha: number };
export type Item = { id: string; name: string; bonus?: string; lore?: string; artKey?: string; qty?: number; equipped?: boolean };
export type HeroDef = {
  id: string;
  classKey: string;
  name: string;
  role: string;
  color: string;
  hp: number;
  maxHp: number;
  stats: Stats;
  skills: { name: string; desc: string }[];
  inventory: Item[];
};
export type Entity = { name: string; role: string; hp: number; maxHp: number; type: string };
export type Act = {
  actNumber: number;
  title: string;
  locationName: string;
  bgType: string;
  rightEntities: Entity[];
  objective: string;
  sandboxHints: string[];
};

export const campaign = raw as unknown as {
  title: string;
  subtitle: string;
  duration: string;
  worldRulesForAI: string;
  acts: Act[];
  heroes: HeroDef[];
};

export const STAT_LABEL: Record<keyof Stats, string> = { str: "СИЛ", agi: "СПР", int: "РОЗ", cha: "ХАР" };

const LOC: Record<string, string> = {
  scene_tavern_cellar: "loc_01_secret_tavern.jpg",
  scene_alley_manhole: "loc_02_alley_manhole.jpg",
  scene_sewer_outpost: "loc_05_sewer_outpost.jpg",
  scene_cockroach_pit: "loc_06_cockroach_pit.jpg",
  scene_stablemaster_yard: "loc_07_stablemaster_yard.jpg",
  scene_castle_feast: "loc_09_castle_feast.jpg",
  scene_castle_kitchen_hood: "loc_11_castle_kitchen_hood.jpg",
  scene_castle_plaza_evac: "loc_12_castle_plaza_evac.jpg",
};
export const locationSrc = (bg: string) => `/game/locations/${LOC[bg] ?? LOC["scene_tavern_cellar"]}`;

/** sprite per act entity (index-aligned with rightEntities); null = no sprite */
const ACT_SPRITES: Record<number, (string | null)[]> = {
  1: ["iron_knight_1", "tavern_mages_1"],
  2: [null, "crossbow_patrol_1"],
  3: ["cockroach_guard_1", null],
  4: ["cockroach_king_boss", "cockroach_guard_2"],
  5: ["stablemaster_rodan_1", "white_horse_1"],
  6: ["usurper_king_1", "birthday_prince_1"],
  7: [null, "castle_chef_1"],
  8: [null, "castle_chef_2"],
};
export const entitySprite = (act: number, i: number) => {
  const s = ACT_SPRITES[act]?.[i];
  return s ? `/game/npcs/${s}.png` : null;
};

export const heroSprite = (classKey: string, pose: "idle" | "action" | "front" = "idle") =>
  `/game/heroes/${classKey}_${pose}.png`;
export const itemSrc = (artKey?: string) => (artKey ? `/game/items/${artKey}.png` : "/game/items/item_potion_red.png");

/** Rain / ember / spores particles per scene mood */
export const sceneMood = (bg: string): "rain" | "embers" | "spores" | "none" =>
  bg.includes("alley") || bg.includes("tavern")
    ? "rain"
    : bg.includes("sewer") || bg.includes("cockroach")
      ? "spores"
      : bg.includes("kitchen") || bg.includes("feast") || bg.includes("plaza")
        ? "embers"
        : "none";

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
