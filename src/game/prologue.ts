export type Lang = "uk" | "en";

export type PrologueSlide = { image: string; text: Record<Lang, string> };

/** ~1 minute intro shown before a new adventure. Audio lives at /game/prologue/{lang}-{index}.mp3 */
export const PROLOGUE: PrologueSlide[] = [
  {
    image: "/game/prologue/keyart.webp",
    text: {
      uk: "Колись королівство Чорної Зірки жило в мирі. Старий добрий король шанував і людей, і чарівний народ — ілюзіоністів, друїдів, духів лісу та рунічних велетів.",
      en: "Once, the Kingdom of the Black Star lived in peace. The old, kind king honoured both ordinary folk and the magical people — illusionists, druids, forest spirits and runic giants.",
    },
  },
  {
    image: "/game/locations/loc_09_castle_feast.webp",
    text: {
      uk: "Та однієї ночі на бенкеті короля отруїли. Його трон захопив жорстокий узурпатор, а разом із ним до влади прийшла Залізна Варта — лицарі без облич і без жалю.",
      en: "But one night, at a royal feast, the king was poisoned. A cruel usurper seized the throne, and with him came the Iron Guard — faceless knights without mercy.",
    },
  },
  {
    image: "/game/locations/loc_12_castle_plaza_evac.webp",
    text: {
      uk: "Новий тиран оголосив полювання на всіх, хто володіє магією. Щоночі на площах горять вогнища, а сусіди бояться навіть пошепки сказати правду.",
      en: "The new tyrant declared a hunt on everyone who wields magic. Every night bonfires burn in the squares, and neighbours are afraid to whisper the truth.",
    },
  },
  {
    image: "/game/locations/loc_05_sewer_outpost.webp",
    text: {
      uk: "Ті, хто вижив, пішли в підпілля — у сирі тунелі, на дахи, у старі підвали. Тепер вони вигнанці у власному домі.",
      en: "Those who survived went underground — into damp tunnels, onto the rooftops, into old cellars. Now they are exiles in their own home.",
    },
  },
  {
    image: "/game/locations/loc_01_secret_tavern.webp",
    text: {
      uk: "Таємна таверна «Під Згаслим Ліхтарем» стала їхнім останнім притулком. Тут, при свічках, народився план повалити узурпатора і повернути королівству свободу.",
      en: "The secret tavern «The Snuffed Lantern» became their last refuge. Here, by candlelight, a plan was born to overthrow the usurper and set the kingdom free.",
    },
  },
  {
    image: "/game/locations/loc_02_alley_manhole.webp",
    text: {
      uk: "Але цієї ночі хтось вас зрадив. Важкі кроки гримлять сходами, брязкають кайдани. Залізна Варта вже біля дверей… Ваша історія починається зараз.",
      en: "But tonight, someone betrayed you. Heavy boots thunder on the stairs, chains rattle. The Iron Guard is already at the door… Your story begins now.",
    },
  },
];

export const prologueAudio = (lang: Lang, i: number) => `/game/prologue/${lang}-${i}.mp3`;
