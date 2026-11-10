import { ACT_PROGRESS_GOAL, currentActor, type GameState, type MasterReply } from "./engine";
import type { NarrateRequest } from "./prompt";
import { campaignFor } from "./i18n";

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickDistinct<T>(arr: readonly T[], seed: number, lastMasterText: string): T {
  const startIdx = Math.abs(seed) % arr.length;
  for (let offset = 0; offset < arr.length; offset++) {
    const candidate = arr[(startIdx + offset) % arr.length]!;
    if (typeof candidate === "string" && lastMasterText && lastMasterText.includes(candidate.slice(0, 28))) {
      continue;
    }
    return candidate;
  }
  return arr[startIdx]!;
}

function extractMechanicDetails(summary: string, state: GameState) {
  const heroPart = summary.split("\n---\n")[0] ?? summary;
  const enemyPart = summary.split("\n---\n")[1] ?? "";

  // Format from engine.ts:
  // "${hero.name} → ${ab.name} (${foe.name}): D20 14+3=17 • -8 HP!"
  // or "${hero.name} лікує ${ally.name} (+6 HP)."
  // or "${hero.name} використовує ${item.name} → ${ally.name} (+8 HP)."
  const arrowMatch = heroPart.match(/^([^→•:]+?)\s*→\s*([^(:•]+?)(?:\s*\(([^)]+)\))?\s*:/);
  const healVerbMatch = heroPart.match(/^(.+?)\s+(?:лікує|heals)\s+([^(]+?)\s*\(\+(\d+)\s*HP\)/);
  const itemUseMatch = heroPart.match(/^(.+?)\s+(?:використовує|uses)\s+([^→(]+?)(?:\s*→\s*([^(]+?))?\s*\(/);

  const actor = currentActor(state);
  const fallbackHero = actor?.type === "hero" ? actor.hero.name : state.party[0]?.name ?? "Герой";
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const fallbackEnemy = aliveEnemies[0]?.name ?? state.enemies[0]?.name ?? (state.lang === "en" ? "the enemy" : "ворога");

  const heroName = (
    arrowMatch?.[1] ??
    healVerbMatch?.[1] ??
    itemUseMatch?.[1] ??
    heroPart.split(/\s+/)[0] ??
    fallbackHero
  ).trim();

  const abilityName = (arrowMatch?.[2] ?? itemUseMatch?.[2] ?? "").trim();
  const targetName = (arrowMatch?.[3] ?? healVerbMatch?.[2] ?? itemUseMatch?.[3] ?? fallbackEnemy).trim();

  const dmgMatch = heroPart.match(/-(\d+)\s*HP/);
  const healMatch = heroPart.match(/\+(\d+)\s*HP/);
  const dmg = dmgMatch ? Number(dmgMatch[1]) : 0;
  const heal = healMatch ? Number(healMatch[1]) : 0;

  return {
    heroPart,
    enemyPart,
    heroName,
    abilityName,
    targetName,
    dmg,
    heal,
  };
}

export function generateFallbackMasterReply(state: GameState, req: NarrateRequest): MasterReply {
  const en = state.lang === "en";
  const act = campaignFor(state.lang).acts[state.actIndex];
  const loc = act?.locationName ?? (en ? "the chamber" : "залі");
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const lastMasterText = state.log.filter((e) => e.kind === "master").at(-1)?.text ?? "";
  const rawKey =
    req.kind === "mechanic"
      ? req.summary
      : req.kind === "free"
        ? `${req.text}-${req.d20}`
        : req.kind === "chat"
          ? `${req.from}-${req.text}`
          : req.summary.join("|");
  const seed = hashText(rawKey) + state.log.length * 13 + state.round * 7 + state.pos * 5;

  if (req.kind === "mechanic") {
    const { heroPart, enemyPart, heroName, abilityName, targetName, dmg, heal } = extractMechanicDetails(req.summary, state);
    const isCrit = heroPart.includes("КРИТ") || heroPart.includes("CRIT");
    const isMiss = heroPart.includes("ПРОМАХ") || heroPart.includes("MISS");
    const isDefeated = heroPart.includes("ПЕРЕМОЖЕНИЙ") || heroPart.includes("DEFEATED");
    const isHeal =
      heroPart.includes("лікує") ||
      heroPart.includes("heals") ||
      heroPart.includes("використовує") ||
      heroPart.includes("uses ");
    const isStun = heroPart.includes("пропустить хід") || heroPart.includes("skip a turn");
    const isHide = heroPart.includes("невидимим") || heroPart.includes("invisible");
    const isShield = heroPart.includes("захисту на раунд") || heroPart.includes("defence for the round");

    const moveLabel = abilityName ? (en ? `"${abilityName}"` : `«${abilityName}»`) : en ? "a swift strike" : "стрімкий випад";
    const dmgLabel = dmg > 0 ? ` (-${dmg} HP)` : "";
    const healLabel = heal > 0 ? ` (+${heal} HP)` : "";

    let narration = "";
    if (isDefeated && isCrit) {
      narration = pickDistinct(
        en
          ? [
              `A legendary critical blow! ${heroName} unleashes ${moveLabel}${dmgLabel}, shattering ${targetName}'s guard and sending them crashing to the floor of ${loc}!`,
              `Pure mastery! ${heroName}'s critical ${moveLabel}${dmgLabel} cleaves straight through ${targetName}'s defense — the adversary collapses in defeat!`,
              `Sparks and thunder fill ${loc}! ${heroName} lands a devastating critical strike with ${moveLabel}${dmgLabel}, finishing ${targetName} on the spot!`,
              `An unstoppable critical finisher! ${heroName} strikes true with ${moveLabel}${dmgLabel}, and ${targetName} crumples to the flagstones!`,
            ]
          : [
              `Легендарний критичний удар! ${heroName} проводить ${moveLabel}${dmgLabel}, вщент трощить захист, і ${targetName} без дихання падає на підлогу у локації «${loc}»!`,
              `Справжній тріумф майстерності! Критичне влучання ${heroName} прийомом ${moveLabel}${dmgLabel} не залишає шансів — ${targetName} повалений!`,
              `Сніп іскор злітає під склепіння «${loc}»! ${heroName} вкладає всю силу у критичний ${moveLabel}${dmgLabel}, і ${targetName} з гуркотом валиться додолу!`,
              `Бездоганний фінальний випад! ${heroName} блискавично виконує ${moveLabel}${dmgLabel}, ставлячи крапку в бою проти супротивника (${targetName})!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isDefeated) {
      narration = pickDistinct(
        en
          ? [
              `A decisive finishing blow! ${heroName} strikes with ${moveLabel}${dmgLabel}, and ${targetName} drops their weapon, collapsing onto the stones of ${loc}.`,
              `${heroName} presses the advantage with ${moveLabel}${dmgLabel}! ${targetName} staggers back and falls silent — one less threat in your way!`,
              `With ruthless precision, ${heroName} lands ${moveLabel}${dmgLabel}. ${targetName}'s armor gives way, and the foe crashes to the ground!`,
              `Victory in this duel! ${heroName}'s ${moveLabel}${dmgLabel} overwhelms ${targetName}, clearing a path through ${loc}!`,
              `The final clash echoes through ${loc}: ${heroName} finishes ${targetName} with ${moveLabel}${dmgLabel}!`,
            ]
          : [
              `Вирішальний удар! ${heroName} майстерно виконує ${moveLabel}${dmgLabel} — ${targetName} випускає зброю з рук і падає переможений на каміння!`,
              `${heroName} дотискає ворога прийомом ${moveLabel}${dmgLabel}! ${targetName} поточився і з глухим брязкотом латів рухнув на підлогу «${loc}»!`,
              `Холоднокровна точність: ${heroName} пробиває останній рубіж оборони прийомом ${moveLabel}${dmgLabel}, і ${targetName} вибуває з бою!`,
              `Блискуче завершення атаки! ${heroName} проводить ${moveLabel}${dmgLabel} — ${targetName} переможений, і загін перехоплює ініціативу!`,
              `Фінальний розчерк сталі у «${loc}»: ${heroName} влучає прийомом ${moveLabel}${dmgLabel}, остаточно долаючи супротивника (${targetName})!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isCrit) {
      narration = pickDistinct(
        en
          ? [
              `Critical hit! ${heroName} finds a vital gap in ${targetName}'s armor with ${moveLabel}${dmgLabel}, sending a shower of sparks across ${loc}!`,
              `Devastating precision! ${heroName}'s ${moveLabel}${dmgLabel} lands with double force, leaving ${targetName} reeling in pain!`,
              `A thunderous critical strike! ${heroName} channels full momentum into ${moveLabel}${dmgLabel} — ${targetName} barely stays on their feet!`,
              `The dice favor the bold! ${heroName} executes a flawless ${moveLabel}${dmgLabel}, carving deep into ${targetName}'s guard!`,
              `A blinding flash of steel and magic! ${heroName} scores a critical blow on ${targetName} with ${moveLabel}${dmgLabel}!`,
            ]
          : [
              `Нищівний критичний удар! ${heroName} знаходить вразливу шпарину в броні прийомом ${moveLabel}${dmgLabel} — ${targetName} ледве втримується на ногах!`,
              `Критичне влучання! Від потужного прийому ${moveLabel}${dmgLabel} у виконанні ${heroName} під склепінням «${loc}» котиться луна, а ${targetName} відступає!`,
              `Кубик долі дарує максимум! ${heroName} вкладає подвійну міць у ${moveLabel}${dmgLabel}, пробиваючи захист супротивника (${targetName})!`,
              `Блискавичний критичний випад! ${heroName} проводить ${moveLabel}${dmgLabel} з такою силою, що ${targetName} втрачає рівновагу!`,
              `Сніп яскравих іскор! ${heroName} бездоганно виконує ${moveLabel}${dmgLabel}, наносячи болючу рану ворогу (${targetName})!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isHeal) {
      narration = pickDistinct(
        en
          ? [
              `Restorative light flows from ${heroName} to ${targetName}${healLabel}, knitting wounds and reigniting the party's resolve!`,
              `Right on time! ${heroName} aids ${targetName}${healLabel} — fresh strength surges through battered armor in the midst of ${loc}!`,
              `${heroName} channels soothing energy toward ${targetName}${healLabel}, washing away pain and fatigue for the clashes ahead!`,
              `With steady hands, ${heroName} restores ${targetName}${healLabel}. Your companion takes a deep breath and raises their weapon anew!`,
              `A warm emerald glow surrounds ${targetName}${healLabel} thanks to ${heroName} — the party's front line holds firm!`,
            ]
          : [
              `Тепле цілюще сяйво від ${heroName} огортає побратима (${targetName})${healLabel}, затягуючи рани та повертаючи бойовий запал!`,
              `Саме вчасно! ${heroName} підтримує союзника (${targetName})${healLabel} — свіжі сили дозволяють впевнено тримати стрій у «${loc}»!`,
              `Живильна енергія, яку спрямовує ${heroName}, знімає біль і втому: ${targetName}${healLabel} знову готовий до бою!`,
              `${heroName} майстерно відновлює здоров'я соратника (${targetName})${healLabel}. Загін зміцнює позиції перед обличчям небезпеки!`,
              `Смарагдовий спалах лікування! Завдяки дії ${heroName}, ${targetName}${healLabel} розправляє плечі й міцніше стискає зброю!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isStun) {
      narration = pickDistinct(
        en
          ? [
              `Brilliant tactical control! ${heroName} strikes ${targetName} with ${moveLabel}${dmgLabel}, leaving the foe dazed and unable to act next turn!`,
              `${heroName} catches ${targetName} off-balance with ${moveLabel}${dmgLabel}! Stunned and disoriented, the enemy will miss their next move!`,
              `A ringing impact! ${heroName}'s ${moveLabel}${dmgLabel} rattles ${targetName}'s helm — the adversary freezes in place, stunned!`,
            ]
          : [
              `Блискучий тактичний маневр! ${heroName} приголомшує ціль (${targetName}) прийомом ${moveLabel}${dmgLabel} — ворог дезорієнтований і пропустить хід!`,
              `${heroName} б'є точно на випередження прийомом ${moveLabel}${dmgLabel}! ${targetName} оглушений і втрачає здатність атакувати у відповідь!`,
              `Майстерний контроль поля бою! Після прийому ${moveLabel}${dmgLabel} від ${heroName} супротивник (${targetName}) застигає в замішанні!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isHide) {
      narration = pickDistinct(
        en
          ? [
              `Cloaked in shifting shadows, ${heroName} melts into the gloom of ${loc}, vanishing completely from enemy sight!`,
              `A whisper of cloth and shadow — ${heroName} uses ${moveLabel} and disappears behind the pillars, waiting for the perfect ambush!`,
              `The enemies scan ${loc} in confusion as ${heroName} slips into stealth, untouchable and ready to strike from the dark!`,
            ]
          : [
              `Зливаючись із напівтемрявою «${loc}», ${heroName} виконує ${moveLabel} і безслідно розчиняється у тінях прямо перед очима ворогів!`,
              `Ледь чутний шерех плаща — ${heroName} зникає з поля зору супротивників, готуючи несподіваний удар із засідки!`,
              `Вороги розгублено озираються довкола, але ${heroName} вже прихований маревом і недосяжний для їхніх атак!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isShield) {
      narration = pickDistinct(
        en
          ? [
              `Runic wards flare to life as ${heroName} invokes ${moveLabel}, wrapping the party in an unbreakable bastion of defense!`,
              `Shimmering plates of arcane light interlock around the heroes! ${heroName}'s ${moveLabel} fortifies everyone against incoming blows!`,
              `${heroName} raises a resonant barrier across ${loc} — enemy blades will struggle to pierce your formation this round!`,
            ]
          : [
              `Рунічні щити спалахують у повітрі! ${heroName} активує ${moveLabel}, огортаючи загін незламним бастіоном захисту на весь раунд!`,
              `Сяючий купол оберегів змикається над героями завдяки ${heroName} — тепер ворожим клинкам буде значно важче пробити вашу оборону!`,
              `${heroName} зводить могутній захисний бар'єр посеред «${loc}», надійно прикриваючи побратимів від контратак!`,
            ],
        seed,
        lastMasterText,
      );
    } else if (isMiss) {
      narration = pickDistinct(
        en
          ? [
              `Steel clashes against heavy shield! ${heroName} lunges with ${moveLabel}, but ${targetName} parries at the last split second.`,
              `${heroName}'s ${moveLabel} whistles through the air of ${loc} — ${targetName} twists aside, and the strike carves sparks from the stone.`,
              `A tense exchange! ${targetName} anticipates ${heroName}'s ${moveLabel} and deflects the blow off thick armor plating.`,
              `Close, but no hit! ${heroName} presses ${targetName} with ${moveLabel}, forcing the foe back a step even as the blade glances off.`,
              `Shadows shift in ${loc}: ${heroName} aims ${moveLabel} at ${targetName}, but the adversary slips out of reach just in time.`,
              `A sharp metallic ring echoes out — ${targetName} braces behind their guard and turns aside ${heroName}'s ${moveLabel}.`,
            ]
          : [
              `Сталь викрешує іскри об важкий щит! ${heroName} проводить ${moveLabel}, але ${targetName} в останню частку секунди перехоплює удар.`,
              `Лезо зі свистом розтинає повітря у «${loc}» — ${targetName} різко ухиляється від прийому ${moveLabel} у виконанні ${heroName}.`,
              `Напружений обмін випадами! ${targetName} встигає закритися бронею, і ${moveLabel} від ${heroName} проходить по дотичній.`,
              `Було зовсім близько! ${heroName} тисне на супротивника (${targetName}) прийомом ${moveLabel}, проте удар висікає лише кам'яний пил.`,
              `Дзвінкий рикошет лунає під склепінням «${loc}»: ${targetName} витримує натиск і відбиває ${moveLabel} від ${heroName}.`,
              `${heroName} стрімко кидається вперед із прийомом ${moveLabel}, та ${targetName} відскакує на крок назад, уникаючи прямого влучання.`,
            ],
        seed,
        lastMasterText,
      );
    } else {
      narration = pickDistinct(
        en
          ? [
              `Direct hit! ${heroName} unleashes ${moveLabel}${dmgLabel}, breaking through ${targetName}'s guard and forcing them back a step!`,
              `A clean, calculated strike! ${heroName}'s ${moveLabel}${dmgLabel} connects squarely with ${targetName} beneath the vaults of ${loc}!`,
              `${heroName} seizes the opening and lands ${moveLabel}${dmgLabel} — ${targetName} grunts from the impact as sparks fly!`,
              `Relentless momentum! ${heroName} drives ${moveLabel}${dmgLabel} into ${targetName}, weakening the enemy's stance!`,
              `Precision and power! ${heroName} strikes ${targetName} with ${moveLabel}${dmgLabel}, shifting the rhythm of the battle in your favor!`,
              `The clash of arms rings through ${loc} as ${heroName} catches ${targetName} with a solid ${moveLabel}${dmgLabel}!`,
              `No hesitation — ${heroName} steps in and delivers ${moveLabel}${dmgLabel}, leaving a scorching mark on ${targetName}'s armor!`,
            ]
          : [
              `Влучна атака! ${heroName} проводить ${moveLabel}${dmgLabel}, пробиваючи захист — ${targetName} глухо гарчить і відступає на крок!`,
              `Чіткий і вивірений випад! Прийом ${moveLabel}${dmgLabel} від ${heroName} досягає цілі (${targetName}) посеред «${loc}»!`,
              `${heroName} миттєво ловить супротивника на помилці й виконує ${moveLabel}${dmgLabel} — ${targetName} відчутно втрачає сили!`,
              `Стрімкий натиск! ${heroName} вкладає силу в ${moveLabel}${dmgLabel}, залишаючи глибокий слід на броні ворога (${targetName})!`,
              `Дзвін зброї котиться залою «${loc}»: ${heroName} точно проводить ${moveLabel}${dmgLabel} проти супротивника (${targetName})!`,
              `Без жодного зволікання ${heroName} прориває дистанцію і проводить ${moveLabel}${dmgLabel}, похитнувши стійку ворога (${targetName})!`,
              `Холодний розрахунок і влучність: ${heroName} дістає ціль (${targetName}) прийомом ${moveLabel}${dmgLabel}, наближаючи перемогу загону!`,
            ],
        seed,
        lastMasterText,
      );
    }

    // Enemy counterattack summary appended after "\n---\n"
    if (enemyPart.trim()) {
      const enemyHit = enemyPart.includes("влучання") || enemyPart.includes("hit");
      const enraged = enemyPart.includes("ЛЮТЬ") || enemyPart.includes("ENRAGE");
      const counterDmgMatch = enemyPart.match(/-(\d+)\s*HP/);
      const counterDmg = counterDmgMatch ? ` (-${counterDmgMatch[1]} HP)` : "";

      if (enemyHit && enraged) {
        narration += pickDistinct(
          en
            ? [
                ` Wounded and enraged, the enemy retaliates with a ferocious counter-strike${counterDmg}!`,
                ` Eyes blazing with fury, the cornered foe lashes back desperately${counterDmg}!`,
              ]
            : [
                ` Поранений ворог впадає в лють і наносить шалений удар у відповідь${counterDmg}!`,
                ` Очі супротивника спалахують люттю — у відчаї він контратакує з подвоєною силою${counterDmg}!`,
              ],
          seed + 3,
          lastMasterText,
        );
      } else if (enemyHit) {
        narration += pickDistinct(
          en
            ? [
                ` In response, the enemies lunge forward with a sharp counterattack${counterDmg}, testing your line!`,
                ` The adversaries immediately strike back from the shadows${counterDmg} — watch your party's health!`,
                ` Before the dust settles, a retaliatory blow lands on your vanguard${counterDmg}!`,
              ]
            : [
                ` У відповідь вороги миттєво переходять у контратаку${counterDmg}, випробовуючи вашу оборону!`,
                ` Супротивники не баряться і завдають зустрічного удару${counterDmg} — бережіть здоров'я соратників!`,
                ` Щойно стихає брязкіт вашої атаки, ворожий клинок знаходить шпарину у відповідь${counterDmg}!`,
              ],
          seed + 5,
          lastMasterText,
        );
      } else {
        narration += pickDistinct(
          en
            ? [
                " The enemies attempt a fierce counter-strike, but your heroes deftly weave out of harm's way!",
                " Retaliatory blades whistle through the air, yet every enemy counterattack misses its mark!",
                " Your vanguard holds firm — the enemy's counter-assault bounces harmlessly off your guard!",
              ]
            : [
                " Вороги намагаються відповісти зустрічним випадом, але загін майстерно ухиляється!",
                " У відповідь летять ворожі клинки, проте жодна контратака не досягає цілі!",
                " Ваша оборона тримається непохитно — зустрічний натиск супротивників захлинається вхолосту!",
              ],
          seed + 7,
          lastMasterText,
        );
      }
    }

    const actComplete = aliveEnemies.length === 0 && state.enemies.length > 0;
    if (actComplete) {
      narration += en
        ? ` The last adversary in ${loc} falls! The area is secure — your party can now advance to the next stage.`
        : ` Останній супротивник у локації «${loc}» падає! Шлях вільний — загін може рушати до наступного акту.`;
    }

    const suggestions = act?.sandboxHints?.length
      ? act.sandboxHints.slice(0, 3)
      : en
        ? ["Press the attack", "Protect wounded ally", "Use the surroundings"]
        : ["Розвинути атаку", "Прикрити пораненого", "Використати оточення"];

    return {
      narration,
      check: null,
      hpChanges: [],
      actComplete,
      suggestions,
    };
  }

  if (req.kind === "enemies") {
    const hitCount = req.summary.filter((s) => s.includes("влучання") || s.includes("hit")).length;
    const narration =
      hitCount > 0
        ? pickDistinct(
            en
              ? [
                  `The enemies seize the initiative in ${loc}! Heavy blades cleave the air, forcing the party to brace and hold the line.`,
                  `Fierce blows rain down from the adversaries in ${loc} — stay sharp and support your wounded companions!`,
                  `From the shadows of ${loc}, the foes coordinate a ruthless assault against your vanguard!`,
                  `Steel clashes loudly as the enemies press forward with aggressive strikes!`,
                ]
              : [
                  `Вороги перехоплюють ініціативу в локації «${loc}»! Важкі клинки розтинають повітря, змушуючи загін тримати стрій.`,
                  `Супротивники наносять серію прицільних ударів — прикрийте поранених побратимів і готуйте відповідь!`,
                  `Із напівтемряви «${loc}» вороги кидаються у злагоджений штурм на ваші позиції!`,
                  `Гуркіт заліза лунає залою: супротивники намагаються прорвати ваш передній край!`,
                ],
            seed,
            lastMasterText,
          )
        : pickDistinct(
            en
              ? [
                  `The enemies lunge forward in ${loc} with heavy swings, but the heroes weave through every strike unharmed!`,
                  `Steel whistles past your ears — every enemy attack misses its mark in the swirling shadows!`,
                  `Your party anticipates the ambush! The foes strike only stone and empty air.`,
                  `Impeccable footwork! Not a single enemy blow manages to pierce your heroes' defense this round.`,
                ]
              : [
                  `Вороги кидаються в атаку посеред «${loc}», проте герої вправно ухиляються від кожного випаду!`,
                  `Сталь свистить над головою — жоден удар супротивника не досягає цілі у тінях!`,
                  `Загін діє на випередження: ворожі леза висікають лише іскри з холодного каменю!`,
                  `Бездоганна реакція! Жодна ворожа атака в цьому раунді не змогла пробити ваш захист.`,
                ],
            seed,
            lastMasterText,
          );

    return {
      narration,
      check: null,
      hpChanges: [],
      actComplete: false,
      suggestions:
        act?.sandboxHints?.slice(0, 3) ??
        (en ? ["Counterattack", "Heal ally", "Stun the threat"] : ["Контратакувати", "Зцілити союзника", "Оглушити ворога"]),
    };
  }

  if (req.kind === "free") {
    const textLower = req.text.toLowerCase();
    let stat: "str" | "agi" | "int" | "cha" = "str";
    let dc = 11;

    if (
      textLower.match(
        /біг|стриб|ухил|тін|тих|схов|паркур|швидк|лаз|верх|крук|мотуз|прокра|перекат|dodge|jump|hide|shadow|sneak|dash|climb|rope|stealth/,
      )
    ) {
      stat = "agi";
      dc = 11;
    } else if (
      textLower.match(
        /магі|чар|заклят|руна|книг|думк|розди|знайт|знан|зілл|отрут|алхім|трав|оглян|дослід|пастк|механізм|magic|spell|rune|inspect|scroll|potion|herb|search|trap/,
      )
    ) {
      stat = "int";
      dc = 11;
    } else if (
      textLower.match(
        /крик|слово|домов|обман|збрех|перекон|відвол|голос|пісн|жарт|коро|принц|кухар|конюх|тарган|заляк|наказ|підкуп|shout|talk|deceive|persuade|distract|sing|king|chef|intimidate/,
      )
    ) {
      stat = "cha";
      dc = 11;
    } else {
      stat = "str";
      dc = 12;
    }

    const actor = currentActor(state);
    const heroName = actor?.type === "hero" ? actor.hero.name : state.party[0]?.name ?? (en ? "Hero" : "Герой");
    const bonus = actor?.type === "hero" ? (actor.hero.stats[stat] ?? 0) : 0;
    const total = req.d20 + bonus;
    const ok = req.d20 === 20 || (req.d20 !== 1 && total >= dc);
    const isNonCombatAct = state.enemies.length === 0;
    const nextProgress = (state.actProgress ?? 0) + (ok ? 1 : 0);
    const actComplete = isNonCombatAct && nextProgress >= ACT_PROGRESS_GOAL;

    let narration = "";
    const hpChanges: { target: string; delta: number }[] = [];

    if (ok) {
      if (isNonCombatAct) {
        if (actComplete) {
          narration = pickDistinct(
            en
              ? [
                  `Masterful execution by ${heroName}! "${req.text}" (D20: ${total} vs DC ${dc}) completes the final step of your plan in ${loc}. The way forward is open!`,
                  `Triumph in ${loc}! ${heroName} pulls off "${req.text}" flawlessly, fulfilling the act's objective (${ACT_PROGRESS_GOAL}/${ACT_PROGRESS_GOAL})!`,
                  `Everything clicks into place! With "${req.text}", ${heroName} secures the final piece of the puzzle in ${loc}. You may advance to the next act!`,
                ]
              : [
                  `Блискуче виконання від ${heroName}! Дія «${req.text}» (кидок ${total} проти ${dc}) завершує ваш задум у локації «${loc}». Мету акту досягнуто — шлях далі відкритий!`,
                  `Справжній успіх у «${loc}»! ${heroName} бездоганно втілює «${req.text}», виконуючи фінальний крок плану (${ACT_PROGRESS_GOAL}/${ACT_PROGRESS_GOAL})!`,
                  `Усі деталі плану сходяться воєдино! Завдяки дії «${req.text}» ${heroName} ставить переможну крапку в цьому епізоді. Можна переходити до наступного акту!`,
                ],
            seed,
            lastMasterText,
          );
        } else {
          narration = pickDistinct(
            en
              ? [
                  `Clever move! ${heroName} succeeds at "${req.text}" in ${loc} (${nextProgress}/${ACT_PROGRESS_GOAL} toward the goal). The atmosphere shifts in your favor!`,
                  `Impressive ingenuity! ${heroName}'s action — "${req.text}" — yields tangible progress (${nextProgress}/${ACT_PROGRESS_GOAL}). One more bold step will seal the objective!`,
                  `Fate smiles on ${heroName}! "${req.text}" works smoothly beneath the lights of ${loc} (progress: ${nextProgress}/${ACT_PROGRESS_GOAL}). Keep pressing your plan!`,
                  `Sharp instincts! ${heroName} executes "${req.text}" with finesse (${nextProgress}/${ACT_PROGRESS_GOAL}), bringing the party closer to success in ${loc}!`,
                ]
              : [
                  `Винахідливий хід! ${heroName} успішно реалізує «${req.text}» у локації «${loc}» (прогрес сцени: ${nextProgress}/${ACT_PROGRESS_GOAL}). Ситуація складається на вашу користь!`,
                  `Чудова кмітливість! Дія ${heroName} — «${req.text}» — дає відчутний результат (${nextProgress}/${ACT_PROGRESS_GOAL}). Продовжуйте розвивати задум!`,
                  `Фортуна на боці ${heroName}! Маневр «${req.text}» вдається як по нотах (${nextProgress}/${ACT_PROGRESS_GOAL}), наближаючи загін до головної мети акту!`,
                  `Тонкий розрахунок! ${heroName} майстерно виконує «${req.text}» посеред «${loc}» (${nextProgress}/${ACT_PROGRESS_GOAL}) — ще трохи, і завдання буде виконано!`,
                ],
            seed,
            lastMasterText,
          );
        }
      } else {
        const targetEnemy = aliveEnemies[0];
        const dmg = req.d20 === 20 ? -6 : -4;
        if (targetEnemy) {
          hpChanges.push({ target: targetEnemy.name, delta: dmg });
        }
        narration = pickDistinct(
          en
            ? [
                `Bold improvisation! ${heroName} pulls off "${req.text}" in ${loc}, catching ${targetEnemy?.name ?? "the enemy"} off-guard (${dmg} HP)!`,
                `Cunning tactics! ${heroName} uses the environment of ${loc} — "${req.text}" — dealing ${Math.abs(dmg)} damage to ${targetEnemy?.name ?? "the foe"}!`,
                `An unexpected maneuver! ${heroName}'s "${req.text}" succeeds brilliantly, rattling ${targetEnemy?.name ?? "the adversary"} (${dmg} HP)!`,
                `Heroic flair! ${heroName} executes "${req.text}" right on target, turning the chaos of ${loc} against ${targetEnemy?.name ?? "the enemy"} (${dmg} HP)!`,
              ]
            : [
                `Смілива імпровізація! ${heroName} втілює «${req.text}» посеред «${loc}», застаючи ворога (${targetEnemy?.name ?? "супротивника"}) зненацька (${dmg} HP)!`,
                `Нестандартна тактика! ${heroName} використовує оточення «${loc}» через дію «${req.text}» і завдає ${Math.abs(dmg)} шкоди цілі (${targetEnemy?.name ?? "ворогу"})!`,
                `Неочікуваний фінт від ${heroName}! Маневр «${req.text}» проходить успішно й боляче б'є по позиціях ворога (${targetEnemy?.name ?? "супротивника"}, ${dmg} HP)!`,
                `Блискуча ініціатива! ${heroName} проводить «${req.text}», перетворюючи деталі сцени «${loc}» на перевагу для загону (${dmg} HP ворогу)!`,
              ],
          seed,
          lastMasterText,
        );
      }
    } else {
      narration = pickDistinct(
        en
          ? [
              `${heroName} attempts "${req.text}" in ${loc}, but the dice fall short (${total} vs DC ${dc}). The tension rises — try a different angle or rely on a companion's strongest stat!`,
              `A risky gambit by ${heroName}! "${req.text}" almost works, yet a sudden obstacle in ${loc} blocks the attempt. Regroup and strike from another side!`,
              `Not quite enough! ${heroName} tries "${req.text}", but the situation in ${loc} resists. Consider using an ability or another hero's specialty!`,
              `Close call! ${heroName}'s attempt at "${req.text}" falters at the last moment (${total} vs DC ${dc}). Keep your guard up!`,
            ]
          : [
              `${heroName} пробує виконати «${req.text}» у «${loc}», але цього разу кубик не дотягує до складності (${total} проти ${dc}). Спробуйте інший підхід або сильнішу рису героя!`,
              `Ризикований задум від ${heroName}! Дія «${req.text}» була близькою до успіху, та несподівана перешкода у «${loc}» завадила маневру.`,
              `Обставини чинять опір: спроба ${heroName} («${req.text}») не дає бажаного ефекту. Можливо, варто задіяти здібність соратника або змінити тактику!`,
              `Ледь не вийшло! ${heroName} береться за «${req.text}», проте в останню мить ситуація у «${loc}» ускладнюється (${total} проти ${dc}). Тримайте стрій!`,
            ],
        seed,
        lastMasterText,
      );
    }

    return {
      narration,
      check: { stat, dc },
      hpChanges,
      actComplete,
      suggestions:
        act?.sandboxHints?.slice(0, 3) ??
        (en
          ? ["Try a different approach", "Inspect surroundings", "Coordinate with party"]
          : ["Спробувати інший підхід", "Оглянути оточення", "Діяти разом із загоном"]),
    };
  }

  // req.kind === "chat": Interactive, context-aware Game Master responses!
  const q = req.text.toLowerCase();
  const actor = currentActor(state);
  const activeHero = actor?.type === "hero" ? actor.hero : state.party[0];
  const woundedHero = [...state.party].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const hints = act?.sandboxHints ?? [];
  const pickedHint = hints[seed % (hints.length || 1)] ?? "";

  let narration = "";
  const hpChanges: { target: string; delta: number }[] = [];

  if (q.match(/привіт|вітаю|алло|хто ти|ти ші|штучний|живий|тут\?|hello|hi\b|who are you|are you ai/)) {
    narration = en
      ? `The Game Master smiles from behind the screen: "Greetings, ${req.from}! I am watching every roll of the D20 in ${loc}. Right now it is ${activeHero?.name ?? "your hero"}'s move, and your goal is: ${act?.objective ?? "prevail"}."`
      : `Майстер усміхається з-за ширми хронік: «Вітаю, ${req.from}! Я уважно стежу за кожним кроком загону у локації "${loc}". Зараз хід тримає ${activeHero?.name ?? "ваш герой"}, а головна мета — ${act?.objective ?? "вистояти й перемогти"}!»`;
  } else if (q.match(/ворог|супротивник|хто проти|скільки хп|слабк|бос|страж|охорон|enemy|enemies|boss|weakness|guard/)) {
    if (aliveEnemies.length > 0) {
      const enemyStatus = aliveEnemies.map((e) => `${e.name} (${e.hp}/${e.maxHp} HP, AC ${e.ac})`).join(", ");
      narration = en
        ? `The Master taps the tactical map of ${loc}: "Facing you right now: ${enemyStatus}. Focus your party's attacks on one target at a time, or use control abilities to stun the strongest threat!"`
        : `Майстер вказує на фігурки посеред «${loc}»: «Перед вами зараз: ${enemyStatus}. Раджу сфокусувати вогонь на одній цілі або приголомшити найнебезпечнішого ворога здібністю контролю!»`;
    } else {
      narration = en
        ? `The Master glances around ${loc}: "There are no active combat foes in sight right now (${state.actProgress ?? 0}/${ACT_PROGRESS_GOAL} scene progress). Use free actions in the 'Own action' tab to complete the objective: ${act?.objective ?? ""}!"`
        : `Майстер оглядає «${loc}»: «Прямих ворогів у бою зараз немає (прогрес сцени: ${state.actProgress ?? 0}/${ACT_PROGRESS_GOAL}). Перейдіть на вкладку "Власний хід" і опишіть хитрий маневр, щоб виконати мету: ${act?.objective ?? ""}!»`;
    }
  } else if (q.match(/лікув|здоров|хп|hp|поранен|вмира|зілл|heal|health|potion|dying|hurt/)) {
    if (woundedHero && woundedHero.hp < woundedHero.maxHp) {
      narration = en
        ? `The Master nods toward ${woundedHero.name} (${woundedHero.hp}/${woundedHero.maxHp} HP): "Keep an eye on ${woundedHero.name}! Use a healing ability, drink a potion from the Items tab, or activate a defensive shield before the enemies strike again."`
        : `Майстер киває у бік ${woundedHero.name} (${woundedHero.hp}/${woundedHero.maxHp} HP): «Зверніть увагу на рани ${woundedHero.name}! Використайте цілющу здібність, зілля з вкладки "Предмети" або захисний щит, щоб втримати стрій.»`;
    } else {
      narration = en
        ? `The Master checks the party sheets: "Your heroes are in great shape right now! Save your healing potions for tighter moments and press the offensive in ${loc}."`
        : `Майстер звіряє листи персонажів: «Усі герої зараз у чудовій формі! Прибережіть цілющі зілля для важчої хвилини й сміливо розвивайте наступ у "${loc}".»`;
    }
  } else if (q.match(/допомож|благослов|дай хп|підлікуй|дар|прошу|благаю|please|bless|help us|gift/)) {
    if (woundedHero) {
      hpChanges.push({ target: woundedHero.name, delta: 2 });
    }
    narration = en
      ? `Moved by ${req.from}'s plea, the Master flicks a golden token across the table: "A spark of astral grace touches ${woundedHero?.name ?? "your party"} (+2 HP)! Now show me a worthy move in ${loc}!"`
      : `Почувши звернення ${req.from}, Майстер підкидає золоту монету долі: «Нехай іскра астральної благодаті підтримає ${woundedHero?.name ?? "ваш загін"} (+2 HP)! А тепер покажіть красивий хід у "${loc}"!»`;
  } else if (q.match(/що робити|куди|як пройти|підказк|план|мета|завдан|hint|what to do|where|goal|objective|how to/)) {
    narration = en
      ? `The Master leans over the chronicle of ${loc}: "${req.from}, your current objective is: ${act?.objective ?? "advance the story"}. ${pickedHint ? `Try an action like "${pickedHint}"` : "Combine your heroes' abilities"} — or improvise via 'Own action'!"`
      : `Майстер розгортає сувій «${loc}»: «${req.from}, ваше ключове завдання зараз: ${act?.objective ?? "просуватися вперед"}. ${pickedHint ? `Спробуйте, наприклад, ідею: «${pickedHint}»` : "Поєднайте сильні сторони героїв"} — або опишіть свій маневр у вкладці "Власний хід"!»`;
  } else if (q.match(/король|тінь|отрут|зрад|сюжет|історі|лор|хронік|king|shadow|poison|story|lore/)) {
    narration = en
      ? `The Master's voice drops to a dramatic whisper: "Since the night of the poisoned banquet, the usurper's shadow guards patrol every corridor. What you do here in ${loc} will decide whether the rightful crown is avenged!"`
      : `Голос Майстра стає урочисто-тихим: «Від тієї ночі, коли на бенкеті отруїли короля, тіньова сторожа узурпатора чатує на кожному кроці. Ваші дії тут, у "${loc}", визначать долю всього королівства!»`;
  } else {
    narration = pickDistinct(
      en
        ? [
            `The Master listens to ${req.from} ("${req.text}") and gestures toward ${loc}: "An intriguing thought! Put it into action on ${activeHero?.name ?? "your hero"}'s turn — ${pickedHint ? `or consider "${pickedHint}".` : "the dice are ready!"}"`,
            `Eyes gleaming behind the lantern light, the Master replies to ${req.from}: "In ${loc}, bold ideas shape the chronicle. Remember your objective: ${act?.objective ?? "victory"}!"`,
            `The Master rolls a twenty-sided die across the map: "Well said, ${req.from}! If you want to turn "${req.text}" into a real maneuver, type it in the 'Own action' tab for ${activeHero?.name ?? "your hero"}!"`,
          ]
        : [
            `Майстер уважно вислуховує ${req.from} («${req.text}») і вказує на «${loc}»: «Цікавий задум! Втілюйте його просто зараз під час ходу героя ${activeHero?.name ?? ""}${pickedHint ? `, або спробуйте «${pickedHint}»` : ""}!»`,
            `Примружившись у світлі ліхтаря, Майстер відповідає ${req.from}: «У стінах "${loc}" сміливі слова важать чимало. Пам'ятайте про головну ціль: ${act?.objective ?? "перемога"} — і нехай D20 буде прихильним!»`,
            `Майстер перекочує гранчастий кубик D20 по карті: «Прийнято, ${req.from}! Якщо хочете перетворити "${req.text}" на дію в сцені — впишіть це у вкладці "Власний хід" для героя ${activeHero?.name ?? ""}!»`,
          ],
      seed,
      lastMasterText,
    );
  }

  return {
    narration,
    check: null,
    hpChanges,
    actComplete: false,
    suggestions: act?.sandboxHints?.slice(0, 3) ?? [],
  };
}
