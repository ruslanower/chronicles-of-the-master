import type { GameState, MasterReply } from "./engine";
import type { NarrateRequest } from "./prompt";
import { campaignFor } from "./i18n";

export function generateFallbackMasterReply(state: GameState, req: NarrateRequest): MasterReply {
  const en = state.lang === "en";
  const act = campaignFor(state.lang).acts[state.actIndex];
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const actComplete = aliveEnemies.length === 0 && state.enemies.length > 0;

  if (req.kind === "mechanic") {
    const isCrit = req.summary.includes("КРИТ") || req.summary.includes("CRIT");
    const isMiss = req.summary.includes("ПРОМАХ") || req.summary.includes("MISS");
    const isDefeated = req.summary.includes("ПЕРЕМОЖЕНИЙ") || req.summary.includes("DEFEATED");
    const isHeal = req.summary.includes("лікує") || req.summary.includes("heals") || req.summary.includes("+");

    let narration = "";
    if (isCrit) {
      narration = en
        ? "A devastating blow! The strike cuts cleanly through the gloom, shattering armor and sending enemies reeling!"
        : "Нищівний критичний удар! Клинок зі свистом пробиває морок і розколює лати ворога, змушуючи його захитатися!";
    } else if (isMiss) {
      narration = en
        ? "Steel clashes against heavy shield! Sparks fly into the dark as the enemy parries the attack with cold precision."
        : "Сталь б'є в кований щит! Сніп іскор летить у темряву — ворог відбиває випад із холодною незворушністю.";
    } else if (isHeal) {
      narration = en
        ? "A warm soothing light stitches open wounds. Breath returns, and the spirit of battle surges anew!"
        : "Тепле сяйво затягує рани побратима. Подих повертається, а в очах знову спалахує рішучість до бою!";
    } else if (isDefeated) {
      narration = en
        ? "With a dull metallic clang, the adversary collapses onto the cobblestones. One less threat in your path!"
        : "З глухим брязкотом латів ворог валиться на землю. Ще однією загрозою на вашому шляху менше!";
    } else {
      narration = en
        ? "The attack connects with force! The air reverberates with the thunder of combat in the enclosed space."
        : "Влучна атака досягає цілі! Метал скрегоче, а луна запеклого удару котиться кам'яними склепіннями.";
    }

    if (actComplete) {
      narration += en
        ? " The last enemy falls silent! The way forward is clear — catch your breath and prepare for the next challenge."
        : " Останній ворог падає без дихання! Шлях уперед розчищено — зведіть подих і готуйтеся до наступного випробування.";
    }

    const suggestions = en
      ? (isHeal ? ["Press the attack", "Take cover", "Target the leader"] : ["Strike again", "Support ally", "Use the terrain"])
      : (isHeal ? ["Йти в наступ", "Знайти укриття", "Атакувати ватажка"] : ["Вдарити знову", "Підтримати союзника", "Використати оточення"]);

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
    let narration = "";
    if (hitCount > 0) {
      narration = en
        ? "The Iron Guard retaliates relentlessly! Heavy blades cleave the air, pressing the heroes against the cold masonry."
        : "Залізна Варта безжально контратакує! Важкі клинки розтинають темряву, тіснячи героїв до холодних стін.";
    } else {
      narration = en
        ? "The enemies swing wildly with furious roars, but the heroes agilely weave through the strikes unharmed!"
        : "Вороги люто рубають повітря, проте герої вправно ухиляються, лишаючись неушкодженими в хаосі сутички!";
    }
    return {
      narration,
      check: null,
      hpChanges: [],
      actComplete: false,
      suggestions: en
        ? ["Counterattack immediately", "Shield the wounded", "Regroup"]
        : ["Миттєво контратакувати", "Прикрити пораненого", "Перегрупуватися"],
    };
  }

  if (req.kind === "free") {
    const textLower = req.text.toLowerCase();
    let stat: "str" | "agi" | "int" | "cha" = "str";
    let dc = 12;

    if (textLower.match(/біг|стриб|ухил|тін|тих|схов|паркур|швидк|dodge|jump|hide|shadow|sneak|dash/)) {
      stat = "agi";
      dc = 12;
    } else if (textLower.match(/магі|чар|заклят|руна|книг|думк|розди|знайт|знан|magic|spell|rune|inspect|scroll/)) {
      stat = "int";
      dc = 11;
    } else if (textLower.match(/крик|слово|домов|обман|збрех|перекон|відвол|голос|shout|talk|deceive|persuade|distract/)) {
      stat = "cha";
      dc = 12;
    } else {
      stat = "str";
      dc = 13;
    }

    const success = req.d20 >= dc || req.d20 === 20;
    let narration = "";
    const hpChanges: { target: string; delta: number }[] = [];

    if (success) {
      narration = en
        ? `Brilliant initiative! "${req.text}" catches everyone off guard. The momentum of the battle swings decisively in your favor!`
        : `Блискуча ініціатива! «${req.text}» спантеличує супротивників. Ініціатива в сутичці рішуче переходить на ваш бік!`;
      if (aliveEnemies.length > 0) {
        const targetEnemy = aliveEnemies[0]!;
        hpChanges.push({ target: targetEnemy.name, delta: -3 });
      }
    } else {
      narration = en
        ? `You attempt: "${req.text}", but the chaos of battle intervenes. The enemy readies for your move — you need to adjust swiftly!`
        : `Ви спробували: «${req.text}», але хаос бою вносить корективи. Ворог був напоготові — дійте обачніше!`;
    }

    return {
      narration,
      check: { stat, dc },
      hpChanges,
      actComplete: false,
      suggestions: en
        ? ["Follow up with a strike", "Change tactics", "Coordinate with team"]
        : ["Розвинути успіх атакою", "Змінити тактику", "Скоординуватися з загоном"],
    };
  }

  // req.kind === "chat"
  const narration = en
    ? `The Master's voice echoes from the shadows: "${req.from}, every stone and shadow in ${act?.locationName ?? "this place"} can be your advantage. Trust your companions and watch the enemy's flanks!"`
    : `Голос Майстра лунає з напівтемряви: «${req.from}, кожен камінь і кожна тінь у ${act?.locationName ?? "цьому місці"} можуть стати вашою зброєю. Довіряйте соратникам і шукайте слабкі місця ворога!»`;

  return {
    narration,
    check: null,
    hpChanges: [],
    actComplete: false,
    suggestions: en ? ["Take decisive action", "Survey room", "Cast protective magic"] : ["Діяти рішуче", "Оглянути залу", "Створити захисні чари"],
  };
}
