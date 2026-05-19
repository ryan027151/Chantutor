// SHSAT score estimator — difficulty-weighted, per-subcategory formula.
//
// Per subcategory:
//   earned = Σ difficulty_weight for each correct question  (easy=1, medium=1.5, hard=2)
//   max    = Σ difficulty_weight for every question in the subcategory
//   score  = (earned / max) × 500 + 200   →   range 200–700
//
// Overall SHSAT estimate = weighted average of all subcategory scores,
// weighted by each subcategory's max points. This simplifies to:
//   total = (sum_all_earned / sum_all_max) × 500 + 200   →   range 200–700
//
// Section ratios (ELA / Math) are shown as percentages — they cannot be
// added together to derive the total because they are independent ratios.
//
// Score bands (calibrated to real SHSAT cutoffs on a 200–700 scale):
//   ≥ 620  →  Top-school range (Stuyvesant tier)
//   ≥ 580  →  Competitive range (Bronx Science / Brooklyn Tech tier)
//   ≥ 500  →  Approaching competitive
//   < 500  →  Needs significant practice

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_WEIGHTS: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };

// Normalizes any DB casing ("Easy", "MEDIUM", null, etc.) to a valid Difficulty key.
function normDiff(raw: string | null | undefined): Difficulty {
  const lower = raw?.toLowerCase?.();
  if (lower === "easy") return "easy";
  if (lower === "hard") return "hard";
  return "medium";
}

export interface ScoredQuestion {
  order_index: number;
  is_correct: boolean | null;
  difficulty: Difficulty;
  sub_category?: string;
  subject?: string;
}

export interface SubcategoryScore {
  name: string;
  subject: string;
  score: number;    // 200–700
  correct: number;
  total: number;
  earned: number;
  max: number;
}

export interface SHSATScore {
  total: number;                  // 200–700
  elaRatio: number;               // 0–1, for display as %
  mathRatio: number;              // 0–1, for display as %
  subcategories: SubcategoryScore[];
}

export function computeSHSATScore(
  questions: ScoredQuestion[],
  englishCount: number,
): SHSATScore {
  const W = DIFFICULTY_WEIGHTS;

  // Per-subcategory accumulation
  const subMap: Record<string, {
    earned: number; max: number; correct: number; total: number; subject: string;
  }> = {};

  for (const q of questions) {
    const cat = q.sub_category ?? "General";
    const subj = q.subject
      ? q.subject.trim().toLowerCase()
      : (q.order_index <= englishCount ? "english" : "math");
    const w = W[normDiff(q.difficulty)];
    if (!subMap[cat]) subMap[cat] = { earned: 0, max: 0, correct: 0, total: 0, subject: subj };
    subMap[cat].max += w;
    subMap[cat].total++;
    if (q.is_correct) {
      subMap[cat].earned += w;
      subMap[cat].correct++;
    }
  }

  const subcategories: SubcategoryScore[] = Object.entries(subMap)
    .map(([name, s]) => ({
      name,
      subject: s.subject,
      score: s.max > 0 ? 200 + Math.round(500 * (s.earned / s.max)) : 200,
      correct: s.correct,
      total: s.total,
      earned: s.earned,
      max: s.max,
    }))
    .sort((a, b) => a.score - b.score); // weakest first

  // Global totals (sum over all subcategories = weighted average of sub scores)
  const totalEarned = questions.reduce((s, q) => s + (q.is_correct ? W[normDiff(q.difficulty)] : 0), 0);
  const totalMax    = questions.reduce((s, q) => s + W[normDiff(q.difficulty)], 0);
  const total = totalMax > 0 ? 200 + Math.round(500 * (totalEarned / totalMax)) : 200;

  // Section ratios
  const elaQs  = questions.filter(q => q.order_index <= englishCount);
  const mathQs = questions.filter(q => q.order_index > englishCount);
  const elaEarned  = elaQs.reduce((s, q)  => s + (q.is_correct ? W[normDiff(q.difficulty)] : 0), 0);
  const elaMax     = elaQs.reduce((s, q)  => s + W[normDiff(q.difficulty)], 0);
  const mathEarned = mathQs.reduce((s, q) => s + (q.is_correct ? W[normDiff(q.difficulty)] : 0), 0);
  const mathMax    = mathQs.reduce((s, q) => s + W[normDiff(q.difficulty)], 0);

  return {
    total,
    elaRatio:  elaMax  > 0 ? elaEarned  / elaMax  : 0,
    mathRatio: mathMax > 0 ? mathEarned / mathMax : 0,
    subcategories,
  };
}

export function scoreLabel(total: number): { text: string; color: "green" | "amber" | "red" } {
  if (total >= 620) return { text: "Top-school competitive range",                    color: "green" };
  if (total >= 580) return { text: "Competitive range for specialized schools",        color: "green" };
  if (total >= 500) return { text: "Approaching competitive — keep going!",            color: "amber" };
  return              { text: "Keep practicing — you're building real skills!",        color: "red"   };
}
