import uk from "./campaign.json";
import en from "./campaign.en.json";
import type { Lang } from "./prologue";
import type { Act, HeroDef } from "./data";

export type { Lang };

type Campaign = { title: string; subtitle: string; duration: string; worldRulesForAI: string; acts: Act[]; heroes: HeroDef[] };
const CAMPAIGNS: Record<Lang, Campaign> = { uk: uk as unknown as Campaign, en: en as unknown as Campaign };
export const campaignFor = (lang: Lang) => CAMPAIGNS[lang];

export const heroName = (id: string, lang: Lang) => CAMPAIGNS[lang].heroes.find((h) => h.id === id)?.name ?? id;

const STRINGS = {
  newAdventure: { uk: "▶ Нова пригода", en: "▶ New adventure" },
  continue: { uk: "Продовжити", en: "Continue" },
  online: { uk: "Грати з друзями онлайн", en: "Play online with friends" },
  solo: { uk: "Гра наодинці", en: "Solo game" },
  language: { uk: "Мова", en: "Language" },
  acts8: { uk: "8 АКТІВ", en: "8 ACTS" },
  heroes14: { uk: "1–4 ГЕРОЇ", en: "1–4 HEROES" },
  tagline: { uk: "ВАШ ВИБІР — ВАША ІСТОРІЯ", en: "YOUR CHOICE — YOUR STORY" },
  chapter: { uk: "ТІНЬОВИЙ ЗАКОЛОТ • РОЗДІЛ ПЕРШИЙ", en: "SHADOW REBELLION • CHAPTER ONE" },
  gameTitle: { uk: "Хроніки Майстра", en: "Chronicles of the Master" },
  gameSubtitle: { uk: "Корона Чорної Зірки", en: "Crown of the Black Star" },
  skip: { uk: "Пропустити", en: "Skip" },
  next: { uk: "Далі", en: "Next" },
  begin: { uk: "Почати", en: "Begin" },
  sound: { uk: "Звук", en: "Sound" },
  back: { uk: "◀ Назад", en: "◀ Back" },
  gatherParty: { uk: "Зберіть загін повстанців", en: "Gather your rebel party" },
  party: { uk: "ЗАГІН", en: "PARTY" },
  startAct1: { uk: "Почати Акт I", en: "Start Act I" },
  pick14: { uk: "Оберіть 1–4 героїв", en: "Pick 1–4 heroes" },
  yourTurn: { uk: "Ваш хід", en: "Your turn" },
  turnOf: { uk: "Хід", en: "Turn" },
  waitingFor: { uk: "Чекаємо на хід", en: "Waiting for" },
  enemiesAct: { uk: "Вороги діють…", en: "Enemies are acting…" },
  abilities: { uk: "Уміння", en: "Abilities" },
  freeAction: { uk: "Своя дія", en: "Own action" },
  items: { uk: "Предмети", en: "Items" },
  chat: { uk: "Чат", en: "Chat" },
  story: { uk: "Історія", en: "Story" },
  chooseTarget: { uk: "Оберіть ціль", en: "Choose a target" },
  cancel: { uk: "Скасувати", en: "Cancel" },
  freeHint: { uk: "Опишіть будь-яку ідею. Майстер сам вирішить, чи потрібен кидок кубика.", en: "Describe any idea. The Master decides whether a dice roll is needed." },
  freePlaceholder: { uk: "Я перевертаю стіл і прикриваю чорний хід…", en: "I flip the table and cover the back door…" },
  doIt: { uk: "Діяти", en: "Act" },
  ideas: { uk: "Ідеї від Майстра", en: "Ideas from the Master" },
  chatHint: { uk: "Розмова не витрачає хід і не кидає кубик.", en: "Talking doesn't use your turn or roll dice." },
  toMaster: { uk: "Майстру", en: "To Master" },
  toParty: { uk: "Загону", en: "To party" },
  chatPlaceholder: { uk: "Напишіть повідомлення…", en: "Write a message…" },
  send: { uk: "Надіслати", en: "Send" },
  masterThinking: { uk: "Майстер вплітає ваш вибір в історію…", en: "The Master weaves your choice into the story…" },
  masterTells: { uk: "✦ МАЙСТЕР РОЗПОВІДАЄ", en: "✦ THE MASTER SPEAKS" },
  actGoal: { uk: "Мета акту", en: "Act goal" },
  actDone: { uk: "✦ Мету акту виконано", en: "✦ Act goal complete" },
  continueAct: { uk: "Продовжити • Акт", en: "Continue • Act" },
  victory: { uk: "Королівство вільне!", en: "The kingdom is free!" },
  victoryText: { uk: "Корона впала. Та історія вашого загону житиме у літописі.", en: "The crown has fallen. Your party's story will live on in the chronicle." },
  defeat: { uk: "Згаслий ліхтар", en: "The lantern goes out" },
  defeatText: { uk: "Загін упав, але легенди народжуються з нової спроби.", en: "The party has fallen, but legends are born from a new attempt." },
  retryAct: { uk: "Спробувати акт знову", en: "Try the act again" },
  mainMenu: { uk: "До головного меню", en: "Main menu" },
  journal: { uk: "Літопис", en: "Chronicle" },
  inventory: { uk: "Інвентар", en: "Inventory" },
  close: { uk: "Закрити", en: "Close" },
  round: { uk: "Раунд", en: "Round" },
  initiative: { uk: "Черговість", en: "Turn order" },
  cooldown: { uk: "перезарядка", en: "cooldown" },
  noTargets: { uk: "Тут немає ворогів", en: "No enemies here" },
  seconds: { uk: "с", en: "s" },
  unconscious: { uk: "Без свідомості", en: "Unconscious" },
  hidden: { uk: "Невидимий", en: "Hidden" },
  stunned: { uk: "Оглушений", en: "Stunned" },
  shielded: { uk: "Під захистом", en: "Shielded" },
  saveError: { uk: "Браузер не дозволяє зберегти пригоду. Не закривайте цю вкладку.", en: "Your browser won't save the adventure. Keep this tab open." },
  masterError: { uk: "Не вдалося почути Майстра. Ваш хід не втрачено — спробуйте ще раз.", en: "Couldn't reach the Master. Your turn isn't lost — try again." },
  createRoom: { uk: "Створити кімнату", en: "Create a room" },
  joinRoom: { uk: "Приєднатися за кодом", en: "Join with a code" },
  yourName: { uk: "Ваше ім'я", en: "Your name" },
  roomCode: { uk: "Код кімнати", en: "Room code" },
  join: { uk: "Увійти", en: "Join" },
  lobby: { uk: "Лобі кімнати", en: "Room lobby" },
  invite: { uk: "Запросіть друзів: надішліть посилання або код", en: "Invite friends: send the link or code" },
  copyLink: { uk: "Скопіювати посилання", en: "Copy link" },
  copied: { uk: "Скопійовано!", en: "Copied!" },
  pickOneHero: { uk: "Оберіть свого героя (лише одного)", en: "Pick your hero (only one)" },
  taken: { uk: "Зайнято", en: "Taken" },
  you: { uk: "Ви", en: "You" },
  host: { uk: "Ведучий", en: "Host" },
  players: { uk: "Гравці", en: "Players" },
  startGame: { uk: "Почати гру", en: "Start the game" },
  waitHost: { uk: "Чекаємо, поки ведучий почне гру…", en: "Waiting for the host to start…" },
  needHero: { uk: "Кожен гравець має обрати героя", en: "Every player must pick a hero" },
  roomNotFound: { uk: "Кімнату не знайдено. Перевірте код.", en: "Room not found. Check the code." },
  roomFull: { uk: "Кімната заповнена або гра вже почалася.", en: "The room is full or the game has started." },
  noHeroPicked: { uk: "Без героя", en: "No hero" },
  timeLeft: { uk: "Залишилось", en: "Time left" },
  skipTurn: { uk: "Пропустив хід", en: "Skipped the turn" },
  spectator: { uk: "Ви спостерігаєте", en: "You are watching" },
} as const;

export type StringKey = keyof typeof STRINGS;
export const t = (key: StringKey, lang: Lang) => STRINGS[key][lang];

export const STAT_LABELS: Record<Lang, Record<"str" | "agi" | "int" | "cha", string>> = {
  uk: { str: "СИЛ", agi: "СПР", int: "РОЗ", cha: "ХАР" },
  en: { str: "STR", agi: "AGI", int: "INT", cha: "CHA" },
};

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
