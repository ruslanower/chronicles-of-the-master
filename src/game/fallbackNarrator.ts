import { ACT_PROGRESS_GOAL, currentActor, type GameState, type MasterReply } from "./engine";
import type { NarrateRequest } from "./prompt";
import { campaignFor } from "./i18n";

function pickVariant<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

export function generateFallbackMasterReply(state: GameState, req: NarrateRequest): MasterReply {
  const en = state.lang === "en";
  const act = campaignFor(state.lang).acts[state.actIndex];
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const seed = state.log.length + state.round * 7 + state.pos * 3;

  if (req.kind === "mechanic") {
    const isCrit = req.summary.includes("КРИТ") || req.summary.includes("CRIT");
    const isMiss = req.summary.includes("ПРОМАХ") || req.summary.includes("MISS");
    const isDefeated = req.summary.includes("ПЕРЕМОЖЕНИЙ") || req.summary.includes("DEFEATED");
    const isHeal =
      req.summary.includes("лікує") ||
      req.summary.includes("heals") ||
      req.summary.includes("використовує") ||
      req.summary.includes("uses ");
    const isStun = req.summary.includes("пропустить хід") || req.summary.includes("skip a turn");
    const isHide = req.summary.includes("невидимим") || req.summary.includes("invisible");
    const isShield = req.summary.includes("захисту на раунд") || req.summary.includes("defence for the round");

    let narration = "";
    if (isDefeated && isCrit) {
      narration = en
        ? "A legendary critical strike! The blow shatters the enemy's guard completely, sending them crashing to the ground!"
        : "Легендарний критичний удар! Атака вщент трощить захист супротивника і валить його без дихання на кам'яну підлогу!";
    } else if (isDefeated) {
      narration = pickVariant(
        en
          ? [
              "With a final metallic crash, the enemy collapses onto the flagstones. One less obstacle in your path!",
              "A decisive finishing blow! Your adversary drops their weapon and falls silent.",
              "The strike lands true — the foe staggers back and crumples to the ground, defeated!",
            ]
          : [
              "З глухим брязкотом латів супротивник валиться на каміння. Ще однією перешкодою на вашому шляху менше!",
              "Вирішальний удар! Ворог випускає зброю з рук і падає переможений.",
              "Влучний фінальний випад — супротивник поточився і з гуркотом рухнув додолу!",
            ],
        seed,
      );
    } else if (isCrit) {
      narration = pickVariant(
        en
          ? [
              "A devastating critical hit! Sparks erupt as the weapon finds a vital gap in the enemy's armor!",
              "Critical strike! The sheer force of the blow echoes through the hall, leaving the foe reeling!",
            ]
          : [
              "Нищівний критичний удар! Сніп іскор злітає у повітря — зброя знаходить вразливу шпарину в броні!",
              "Критичне влучання! Від потужного удару ворог заточився, ледве втримавшись на ногах!",
            ],
        seed,
      );
    } else if (isHeal) {
      narration = pickVariant(
        en
          ? [
              "Warm restorative energy courses through the wounds, restoring strength and resolve for the fight ahead!",
              "A soothing glow mends the battered armor and flesh — your companion stands ready once more!",
            ]
          : [
              "Тепле цілюще сяйво затягує рани побратима, повертаючи сили та бойовий дух!",
              "Живильна сила знімає біль і втому — союзник знову готовий тримати удар!",
            ],
        seed,
      );
    } else if (isStun) {
      narration = en
        ? "A masterwork control maneuver! The enemy is dazed and disoriented, unable to act on their next turn!"
        : "Блискучий тактичний прийом! Ворог приголомшений і дезорієнтований — він пропустить свій наступний хід!";
    } else if (isHide) {
      narration = en
        ? "Cloaked in shadow and illusion, the hero vanishes from the enemy's sight!"
        : "Огорнутий тінню та маревом, герой розчиняється у напівтемряві прямо перед очима ворогів!";
    } else if (isShield) {
      narration = en
        ? "Runic wards flare to life around the party, forming an unbreakable bastion of defense!"
        : "Рунічний щит спалахує навколо загону, утворюючи незламний бастіон захисту!";
    } else if (isMiss) {
      narration = pickVariant(
        en
          ? [
              "Steel clashes against heavy shield! Sparks fly into the dark as the enemy parries the attack.",
              "The foe twists aside at the last split second — the strike grazes only stone and shadow.",
              "A sharp clang rings out as the attack is deflected off thick armor plating.",
            ]
          : [
              "Сталь викрешує іскри об важкий щит! Ворог устигає перехопити та відбити удар.",
              "Супротивник різко відсахнувся в останню мить — лезо лише черкнуло по холодному каменю.",
              "Дзвінкий удар відлітає рикошетом від товстих пластин ворожої броні.",
            ],
        seed,
      );
    } else {
      narration = pickVariant(
        en
          ? [
              "The attack connects with solid force! The enemy grunts, pushed back a step by the impact.",
              "A clean, calculated strike pierces through the guard, drawing a hiss of pain from the foe!",
              "Your weapon strikes home! The clash of combat reverberates beneath the vaulted ceiling.",
            ]
          : [
              "Влучна атака досягає цілі! Ворог глухо гарчить, відступаючи на крок під натиском удару.",
              "Чіткий і вивірений випад пробиває захист, залишаючи глибокий слід на броні супротивника!",
              "Удар лягає точно в ціль! Гул запеклої сутички котиться під склепінням.",
            ],
        seed,
      );
    }

    // Check if enemy counterattack summary is appended after "\n---\n"
    if (req.summary.includes("\n---\n")) {
      const enemyPart = req.summary.split("\n---\n")[1] ?? "";
      const enemyHit = enemyPart.includes("влучання") || enemyPart.includes("hit");
      if (enemyHit) {
        narration += en
          ? " In response, the enemies lunge forward with fierce counterattacks, testing your defenses!"
          : " У відповідь вороги люто кидаються в контратаку, випробовуючи ваш захист на міцність!";
      } else if (enemyPart.trim()) {
        narration += en
          ? " The enemies attempt to retaliate, but you deftly evade their counter-strikes!"
          : " Вороги намагаються відповісти ударом, але загін майстерно ухиляється від їхнього натиску!";
      }
    }

    const actComplete = aliveEnemies.length === 0 && state.enemies.length > 0;
    if (actComplete) {
      narration += en
        ? " The last adversary falls! The area is secure — your party can advance to the next stage of the plan."
        : " Останній ворог падає! Шлях вільний — ваш загін може переходити до наступного етапу плану.";
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
        ? pickVariant(
            en
              ? [
                  "The enemies press their assault! Heavy blades cleave the air, forcing the party to hold the line.",
                  "Fierce blows rain down from the adversaries — stay sharp and watch your companions' HP!",
                ]
              : [
                  "Вороги тиснуть з усіх боків! Важкі клинки розтинають повітря, змушуючи загін тримати стрій.",
                  "Супротивники наносять люті удари у відповідь — слідкуйте за здоров'ям побратимів!",
                ],
            seed,
          )
        : pickVariant(
            en
              ? [
                  "The enemies lunge forward with heavy swings, but the heroes weave through the strikes unharmed!",
                  "Steel whistles past your ears — every enemy attack misses its mark in the swirling shadows!",
                ]
              : [
                  "Вороги кидаються в атаку, проте герої вправно ухиляються від кожного випаду!",
                  "Сталь свистить над головою — жоден удар супротивника не досягає цілі у тінях!",
                ],
            seed,
          );

    return {
      narration,
      check: null,
      hpChanges: [],
      actComplete: false,
      suggestions: act?.sandboxHints?.slice(0, 3) ?? (en ? ["Counterattack", "Heal ally", "Stun the threat"] : ["Контратакувати", "Зцілити союзника", "Оглушити ворога"]),
    };
  }

  if (req.kind === "free") {
    const textLower = req.text.toLowerCase();
    let stat: "str" | "agi" | "int" | "cha" = "str";
    let dc = 11;

    if (textLower.match(/біг|стриб|ухил|тін|тих|схов|паркур|швидк|лаз|верх|крук|мотуз|dodge|jump|hide|shadow|sneak|dash|climb|rope/)) {
      stat = "agi";
      dc = 11;
    } else if (textLower.match(/магі|чар|заклят|руна|книг|думк|розди|знайт|знан|зілл|отрут|алхім|трав|magic|spell|rune|inspect|scroll|potion|herb/)) {
      stat = "int";
      dc = 11;
    } else if (textLower.match(/крик|слово|домов|обман|збрех|перекон|відвол|голос|пісн|жарт|коро|принц|кухар|конюх|тарган|shout|talk|deceive|persuade|distract|sing|king|chef/)) {
      stat = "cha";
      dc = 11;
    } else {
      stat = "str";
      dc = 12;
    }

    const actor = currentActor(state);
    const bonus = actor?.type === "hero" ? (actor.hero.stats[stat] ?? 0) : 0;
    const ok = req.d20 === 20 || (req.d20 !== 1 && req.d20 + bonus >= dc);
    const isNonCombatAct = state.enemies.length === 0;
    const nextProgress = (state.actProgress ?? 0) + (ok ? 1 : 0);
    const actComplete = isNonCombatAct && nextProgress >= ACT_PROGRESS_GOAL;

    let narration = "";
    const hpChanges: { target: string; delta: number }[] = [];

    if (ok) {
      if (isNonCombatAct) {
        if (actComplete) {
          narration = en
            ? `Brilliant execution! "${req.text}" achieves the final part of your objective in ${act?.locationName ?? "this scene"}. The path to the next act is now open!`
            : `Блискуче виконання! «${req.text}» завершує ваш задум у локації «${act?.locationName ?? "Сцена"}». Мету акту повністю досягнуто — шлях далі відкритий!`;
        } else {
          narration = en
            ? `Clever move! "${req.text}" works in your favor (${nextProgress}/${ACT_PROGRESS_GOAL} towards the act goal). Keep pressing your plan!`
            : `Вдалий хід! «${req.text}» наближає загін до мети (${nextProgress}/${ACT_PROGRESS_GOAL}). Продовжуйте розвивати успіх!`;
        }
      } else {
        narration = en
          ? `Bold improvisation! "${req.text}" catches the enemy off guard and swings the momentum in your party's favor!`
          : `Смілива імпровізація! «${req.text}» застає супротивників зненацька і повертає ситуацію на користь вашого загону!`;
        if (aliveEnemies.length > 0) {
          const targetEnemy = aliveEnemies[0]!;
          hpChanges.push({ target: targetEnemy.name, delta: req.d20 === 20 ? -6 : -4 });
        }
      }
    } else {
      narration = en
        ? `You attempt "${req.text}", but luck isn't on your side this moment. Try another angle or call on a companion's strength!`
        : `Ви пробуєте «${req.text}», але обставини складаються непросто — маневр не дає бажаного ефекту. Спробуйте інший підхід або передайте ініціативу соратнику!`;
    }

    return {
      narration,
      check: { stat, dc },
      hpChanges,
      actComplete,
      suggestions: act?.sandboxHints?.slice(0, 3) ?? (en ? ["Try a different approach", "Inspect surroundings", "Coordinate with party"] : ["Спробувати інший підхід", "Оглянути оточення", "Діяти разом із загоном"]),
    };
  }

  // req.kind === "chat"
  const hint = act?.sandboxHints?.[seed % (act?.sandboxHints?.length || 1)] ?? "";
  const narration = en
    ? `The Master leans over the table: "${req.from}, remember your goal: ${act?.objective ?? "survive and prevail"}. ${hint ? `Hint: try "${hint}".` : "Use your heroes' strengths!"}"`
    : `Майстер схиляється над картою: «${req.from}, пам'ятайте про головну мету: ${act?.objective ?? "вистояти й перемогти"}. ${hint ? `Підказка: спробуйте «${hint}».` : "Використайте сильні сторони ваших героїв!"}»`;

  return {
    narration,
    check: null,
    hpChanges: [],
    actComplete: false,
    suggestions: act?.sandboxHints?.slice(0, 3) ?? [],
  };
}
