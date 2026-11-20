import type { Lang } from "./i18n";

export type InterludeChoiceEffect = {
  /** Bonus progress steps granted at start of the new act (0..1) */
  startProgress?: number;
  /** Party-wide HP delta at start of the new act (on top of short rest +4) */
  partyHpDelta?: number;
  /** Grant stealth (hidden = 1) to party on round 1 */
  partyHidden?: boolean;
  /** Grant shield (+3 AC) to party on round 1 */
  partyShield?: boolean;
  /** Extra narration note appended to the new act's opening log */
  logNote: Record<Lang, string>;
};

export type InterludeChoice = {
  id: string;
  icon: string;
  title: Record<Lang, string>;
  /** Clear explanation of what will happen if the party picks this option */
  consequence: Record<Lang, string>;
  badge: Record<Lang, string>;
  effect: InterludeChoiceEffect;
};

export type ActInterlude = {
  /** Index of the act we are entering (1 = Act II .. 7 = Act VIII) */
  targetActIndex: number;
  title: Record<Lang, string>;
  narration: Record<Lang, string>;
  bgType: string;
  choices: InterludeChoice[];
};

export const ACT_INTERLUDES: ActInterlude[] = [
  {
    targetActIndex: 1,
    bgType: "scene_alley_manhole",
    title: {
      uk: "Перехід до Акту II: Нічний Провулок",
      en: "Entering Act II: The Night Alley",
    },
    narration: {
      uk: "Ви вириваєтесь із задимленої таверни під холодну нічну зливу. Позаду брязкає Залізна Варта, а попереду — темний провулок із чавунним люком у каналізацію та дахами будинків. Зараз вирішується, як загін уникне погоні!",
      en: "You burst out of the smoky tavern into a freezing night downpour. Behind you, the Iron Guard clanks in pursuit; ahead lies a dark alley with a cast-iron sewer manhole and shadowed rooftops. Now you must choose how to evade the hunt!",
    },
    choices: [
      {
        id: "sewer_hatch",
        icon: "🕳️",
        title: {
          uk: "Піти в каналізацію через люк",
          en: "Drop into the sewers via manhole",
        },
        consequence: {
          uk: "Ви обійдете вуличні патрулі Залізної Варти без бою, отримаєте +1 крок прогресу сцени одразу, але забруднитесь у сирих тунелях, де чекають підземні тварюки.",
          en: "You bypass street Iron Guard patrols completely and gain +1 scene progress immediately, though damp tunnels ahead hide subterranean beasts.",
        },
        badge: { uk: "+1 крок прогресу • Без варти", en: "+1 progress • No guards" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: спуск у каналізацію через чавунний люк — патрулі нагорі залишились ні з чим (+1 крок прогресу).",
            en: "Party choice: dropped into the sewers via the manhole — street patrols lost your trail (+1 progress).",
          },
        },
      },
      {
        id: "shadow_rooftops",
        icon: "🥷",
        title: {
          uk: "Прокрастися дахами й тінями",
          en: "Sneak across rooftops and shadows",
        },
        consequence: {
          uk: "Усі герої починають наступну сцену в НЕВИДИМОСТІ на 1-й раунд і бачать пересування патрулів згори, проте якщо вас помітять — доведеться пробиватись крізь арбалетників.",
          en: "Every hero starts the next scene HIDDEN for Round 1 with a clear view of patrol routes, though getting spotted means fighting crossbowmen.",
        },
        badge: { uk: "🥷 Невидимість на 1-й раунд", en: "🥷 Hidden on Round 1" },
        effect: {
          partyHidden: true,
          logNote: {
            uk: "Вибір загону: потаємний шлях дахами — загін розчиняється в дощовій темряві (Невидимість на 1-й раунд).",
            en: "Party choice: stealthy rooftop route — the party melts into the rainy darkness (Hidden for Round 1).",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 2,
    bgType: "scene_sewer_outpost",
    title: {
      uk: "Перехід до Акту III: Сирі Тунелі",
      en: "Entering Act III: Dank Sewer Tunnels",
    },
    narration: {
      uk: "Люк зачиняється над головами, і ви опиняєтесь у зеленуватих підземних склепіннях. Попереду лунає важкий хітиновий скрегіт — вхід до підземного царства охороняють два велетенські Таргани-Стражі. Оберіть, як підготуватися до сутички!",
      en: "The manhole clangs shut overhead, leaving you in eerie green-lit vaults. Ahead echoes the heavy scraping of chitin — two giant Cockroach Sentinels guard the threshold. Choose how to prepare for the clash!",
    },
    choices: [
      {
        id: "shield_formation",
        icon: "🛡️",
        title: {
          uk: "Щільний стрій зі щитами",
          en: "Tight shield-wall formation",
        },
        consequence: {
          uk: "Усі герої отримують +3 до захисту (Щит) на перший раунд бою — це врятує від перших ударів жвалами та кислоти.",
          en: "All heroes gain +3 defence (Shield) for Round 1 — protecting the squad from opening mandible strikes.",
        },
        badge: { uk: "🛡 +3 Захисту на 1-й раунд", en: "🛡 +3 AC on Round 1" },
        effect: {
          partyShield: true,
          logNote: {
            uk: "Вибір загону: щільний бойовий стрій — герої підняли щити перед атакою стражів (+3 AC на 1-й раунд).",
            en: "Party choice: tight shield formation — heroes brace against the sentinels (+3 AC on Round 1).",
          },
        },
      },
      {
        id: "amber_rest",
        icon: "💚",
        title: {
          uk: "Перев'язати рани біля факела",
          en: "Bandage wounds by torchlight",
        },
        consequence: {
          uk: "Загін витрачає хвилину на перев'язку перед проривом і додатково відновлює +3 HP кожному герою (разом із привалом +7 HP).",
          en: "The squad takes a moment to tend wounds before pushing forward, recovering an extra +3 HP per hero (+7 HP total with rest).",
        },
        badge: { uk: "♥ Додатково +3 HP усім", en: "♥ Extra +3 HP to all" },
        effect: {
          partyHpDelta: 3,
          logNote: {
            uk: "Вибір загону: коротке лікування в тунелі — усі герої відновили додаткові +3 HP перед боєм.",
            en: "Party choice: quick triage in the tunnel — all heroes recover an extra +3 HP before combat.",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 3,
    bgType: "scene_cockroach_pit",
    title: {
      uk: "Перехід до Акту IV: Яма Тарганячого Короля",
      en: "Entering Act IV: The Cockroach King's Pit",
    },
    narration: {
      uk: "Плити під ногами раптово провалюються, і загін летить у величезну підземну залу! Навколо тисячі блискучих очей у темряві, а на троні з шестерень сидить сам Тарганячий Король. Битися тут — самогубство, тож доведеться домовлятися!",
      en: "The flagstones suddenly give way, dropping your party into a cavernous hall! Thousands of eyes glint in the dark around a clockwork throne where the Cockroach King sits. Fighting here is suicide — you must negotiate!",
    },
    choices: [
      {
        id: "honor_pact",
        icon: "🤝",
        title: {
          uk: "Запропонувати союз рівних проти тирана",
          en: "Offer an equal pact against the tyrant",
        },
        consequence: {
          uk: "Король поважає сміливість і одразу вислухає вас (+1 крок прогресу переговорів), залишиться зробити лише 2 вдалі кроки, щоб отримати колбу «Подих Безодні».",
          en: "The King respects bold diplomacy (+1 negotiation progress immediately), leaving just 2 steps to secure the 'Abyssal Breath' flask.",
        },
        badge: { uk: "+1 крок переговорів", en: "+1 diplomacy step" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: дипломатичний уклін і пропозиція союзу вразили Тарганячого Короля (+1 крок прогресу).",
            en: "Party choice: a bold offer of alliance impressed the Cockroach King (+1 progress).",
          },
        },
      },
      {
        id: "observe_throne",
        icon: "👁️",
        title: {
          uk: "Вийти з тіні й оцінити його слабкість",
          en: "Approach quietly and read his court",
        },
        consequence: {
          uk: "Ви обережно наближаєтесь до трону в прихованій позиції (Невидимість на 1-й раунд), що вбереже від раптової реакції варти.",
          en: "You approach the throne cautiously under cover (Hidden on Round 1), keeping the guard swarm calm.",
        },
        badge: { uk: "🥷 Безпечний підхід", en: "🥷 Safe approach" },
        effect: {
          partyHidden: true,
          logNote: {
            uk: "Вибір загону: обережний підхід у тінях — варта ями не сприймає вас як загрозу.",
            en: "Party choice: cautious shadowed approach — the pit guards hold their fire.",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 4,
    bgType: "scene_stablemaster_yard",
    title: {
      uk: "Перехід до Акту V: Постій Конюха",
      en: "Entering Act V: The Stablemaster's Yard",
    },
    narration: {
      uk: "Колба зі смертоносним «Подихом Безодні» вже у вас! Вибравшись на свіже повітря, ви виходите до старого постою, де Конюх готує чистокровних білих коней із чорною зіркою для королівської армії. У нього теж є причина ненавидіти тирана — поговоріть з ним мудро!",
      en: "The deadly 'Abyssal Breath' flask is yours! Emerging into fresh air, you reach an old waystation where the Stablemaster tends white steeds marked with black stars for the royal army. He has his own score to settle with the tyrant — choose your approach!",
    },
    choices: [
      {
        id: "empathy_wife",
        icon: "🕊️",
        title: {
          uk: "Звернутися до його серця та пам'яті дружини",
          en: "Appeal to his heart & his wife's memory",
        },
        consequence: {
          uk: "Чесна розмова про помсту тирану за його страчену дружину миттєво розтопить лід (+1 крок прогресу до отримання випраних лат і коней).",
          en: "Speaking honestly of avenging his executed sorceress wife wins his trust fast (+1 progress toward armor and steeds).",
        },
        badge: { uk: "+1 крок довіри Конюха", en: "+1 trust progress" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: щирі слова про свободу й помсту торкнулися серця Конюха (+1 крок прогресу).",
            en: "Party choice: heartfelt words about justice moved the Stablemaster (+1 progress).",
          },
        },
      },
      {
        id: "inspect_armor",
        icon: "🛡️",
        title: {
          uk: "Приміряти випрані лати та перевірити спорядження",
          en: "Inspect the washed plate & gear up",
        },
        consequence: {
          uk: "Герої одразу зміцнюють оборону (+3 AC Щит) і відновлюють +2 HP перед розмовою з Конюхом.",
          en: "Heroes bolster their defences (+3 AC Shield) and recover +2 HP while preparing their disguise.",
        },
        badge: { uk: "🛡 +3 Захисту • +2 HP", en: "🛡 +3 AC • +2 HP" },
        effect: {
          partyShield: true,
          partyHpDelta: 2,
          logNote: {
            uk: "Вибір загону: перевірка спорядження й обладунків дала +3 AC та +2 HP.",
            en: "Party choice: checking gear and washed armor granted +3 AC and +2 HP.",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 5,
    bgType: "scene_castle_feast",
    title: {
      uk: "Перехід до Акту VI: Брама Замку та Бенкет",
      en: "Entering Act VI: The Citadel Feast",
    },
    narration: {
      uk: "У випраних лицарських латах і на білосніжних конях із чорною зіркою ви наближаєтесь до головної брами замку. Всередині гримить музика — тиран святкує День народження середнього сина! Треба справити враження на іменинника, щоб вас пустили в тил.",
      en: "Clad in washed plate atop star-marked white steeds, you ride up to the Citadel gates. Music roars inside — the tyrant is celebrating his middle son's birthday! Impress the prince so you are ordered into the rear stables.",
    },
    choices: [
      {
        id: "royal_parade",
        icon: "🐎",
        title: {
          uk: "Урочисто виїхати з парадом коней",
          en: "Ride in with a grand horse parade",
        },
        consequence: {
          uk: "Придворні й варта одразу розступаються перед видовищем білих коней (+1 крок прогресу на бенкеті).",
          en: "Courtiers and guards part immediately before the dazzling white steeds (+1 feast progress).",
        },
        badge: { uk: "+1 крок враження", en: "+1 progress" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: ефектний виїзд білих коней одразу привернув увагу двору (+1 крок прогресу).",
            en: "Party choice: a grand parade of the white steeds captivated the court (+1 progress).",
          },
        },
      },
      {
        id: "low_profile",
        icon: "🎭",
        title: {
          uk: "Триматися в тіні під прикриттям шоломів",
          en: "Keep a low profile beneath visors",
        },
        consequence: {
          uk: "Ніхто не впізнає ваших облич у натовпі гостей — ви отримуєте Невидимість (прикриття) на 1-й раунд сцени.",
          en: "No guard recognizes your faces in the crowd — gain Hidden cover for Round 1.",
        },
        badge: { uk: "🥷 Надійне маскування", en: "🥷 Strong disguise" },
        effect: {
          partyHidden: true,
          logNote: {
            uk: "Вибір загону: забрала опущені, варта навіть не дивиться у ваш бік.",
            en: "Party choice: visors down, the gate guards pay you no mind.",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 6,
    bgType: "scene_castle_kitchen_hood",
    title: {
      uk: "Перехід до Акту VII: Замкова Кухня та Витяжка",
      en: "Entering Act VII: The Castle Kitchens",
    },
    narration: {
      uk: "Хитрощі спрацювали — вас відправили в стайні на задньому дворі! Поруч парує величезна Замкова Кухня з Головною Витяжкою, труби якої ведуть у кожну залу замку. Але всередині повно невинних кухарів і слуг: ви мусите вивести їх усіх до того, як відкриєте отруту!",
      en: "The ruse worked — you've been sent to the rear stables! Right beside them steams the Castle Kitchen with its Grand Flue reaching every hall. But innocent cooks and servants work inside: you must evacuate all of them before releasing the toxin!",
    },
    choices: [
      {
        id: "feast_ruse",
        icon: "🎭",
        title: {
          uk: "Підготувати фальшиве свято на площі",
          en: "Stage a fake celebration outside",
        },
        consequence: {
          uk: "Ви заздалегідь запускаєте чутку про безкоштовне вино й подарунки за брамою (+1 крок прогресу евакуації).",
          en: "You spread word of free wine and royal gifts beyond the gate (+1 evacuation progress).",
        },
        badge: { uk: "+1 крок евакуації", en: "+1 evacuation step" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: чутка про щедру роздачу на площі вже збирає слуг до виходу (+1 крок прогресу).",
            en: "Party choice: rumors of royal gifts outside already draw staff toward the gates (+1 progress).",
          },
        },
      },
      {
        id: "kitchen_prep",
        icon: "🍲",
        title: {
          uk: "Перевести дух і підкріпитися на кухні",
          en: "Catch breath & grab provisions",
        },
        consequence: {
          uk: "Перед вирішальним фіналом кожен герой відновлює додатково +4 HP!",
          en: "Before the grand finale, every hero recovers an extra +4 HP!",
        },
        badge: { uk: "♥ +4 HP усім героям", en: "♥ +4 HP to all heroes" },
        effect: {
          partyHpDelta: 4,
          logNote: {
            uk: "Вибір загону: ковток гарячого бульйону й перепочинок відновили +4 HP кожному герою.",
            en: "Party choice: warm broth and a breather restored +4 HP to every hero.",
          },
        },
      },
    ],
  },
  {
    targetActIndex: 7,
    bgType: "scene_castle_plaza_evac",
    title: {
      uk: "Перехід до Фіналу (Акт VIII): Дві Години до Свободи",
      en: "Entering Finale (Act VIII): Two Hours to Freedom",
    },
    narration: {
      uk: "Усі невинні люди в безпеці за мурами! Залишився останній, вирішальний крок: відкрити «Подих Безодні» у головній витяжці, підсилити тягу астральним попелом і заблокувати браму на дві години, щоб тиран Малґор і Залізна Варта впали назавжди!",
      en: "Every innocent worker is safely outside the walls! One final step remains: uncork 'Abyssal Breath' into the grand flue, stoke the draft with astral ash, and hold the citadel gates shut for two hours until tyrant Malgor falls forever!",
    },
    choices: [
      {
        id: "astral_draft",
        icon: "🔥",
        title: {
          uk: "Розпалити астральний попіл у тязі",
          en: "Stoke the flue with astral ash",
        },
        consequence: {
          uk: "Потужний потік миттєво понесе зелений туман по всіх залах (+1 крок фінального прогресу одразу).",
          en: "A surging draft blasts the green mist through every hall (+1 final progress immediately).",
        },
        badge: { uk: "+1 крок до перемоги", en: "+1 step to victory" },
        effect: {
          startProgress: 1,
          logNote: {
            uk: "Вибір загону: астральний попіл розганяє тягу в димарях замку (+1 крок фінального прогресу).",
            en: "Party choice: astral ash supercharges the chimney draft (+1 final progress).",
          },
        },
      },
      {
        id: "bar_gates",
        icon: "⚔️",
        title: {
          uk: "Приготувати клини й тримати оборону брами",
          en: "Prepare wedges & brace the gates",
        },
        consequence: {
          uk: "Усі герої отримують +3 до захисту (Щит) на перший раунд фінальної оборони брами.",
          en: "All heroes gain +3 defence (Shield) for Round 1 of holding the outer gates.",
        },
        badge: { uk: "🛡 +3 Захисту у фіналі", en: "🛡 +3 AC in finale" },
        effect: {
          partyShield: true,
          logNote: {
            uk: "Вибір загону: сталеві клини й щити напоготові біля головної брами (+3 AC).",
            en: "Party choice: iron wedges and shields braced at the main gates (+3 AC).",
          },
        },
      },
    ],
  },
];

export function getInterludeForAct(targetActIndex: number): ActInterlude | undefined {
  return ACT_INTERLUDES.find((item) => item.targetActIndex === targetActIndex);
}

export function interludeAudioSrc(lang: Lang, targetActIndex: number): string {
  return `/game/interlude/${lang}-${targetActIndex}.m4a`;
}
