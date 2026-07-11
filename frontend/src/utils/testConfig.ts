// SHSAT mock test question distribution — new 100-question format (50 ELA + 50 Math).
//
// ELA breakdown (50):
//   Reading Comprehension  = 47  (94 %) — served across 7 adaptive passage sets
//   Revising / Editing     =  3  ( 6 %) — standalone items served at end of ELA
//
// Math breakdown (50): 14 subcategories, proportionally scaled from the old 57-question bank.
//
// Difficulty totals:
//   ELA  — Easy: 12 | Medium: 27 | Hard: 11
//   Math — Easy: 17 | Medium: 25 | Hard:  8

export interface SubcategoryConfig {
  name: string;
  count: number;
  easy: number;
  medium: number;
  hard: number;
}

export const MATH_DISTRIBUTION: SubcategoryConfig[] = [
  { name: "Stats & Data Analysis",  count: 6, easy: 2, medium: 3, hard: 1 },
  { name: "Ratios & Proportions",   count: 6, easy: 2, medium: 3, hard: 1 },
  { name: "Algebra & Equations",    count: 5, easy: 2, medium: 2, hard: 1 },
  { name: "Probability",            count: 5, easy: 2, medium: 2, hard: 1 },
  { name: "Algebraic Expressions",  count: 4, easy: 1, medium: 2, hard: 1 },
  { name: "Geometry",               count: 4, easy: 1, medium: 2, hard: 1 },
  { name: "Rate / Unit Rate",       count: 4, easy: 2, medium: 2, hard: 0 },
  { name: "Fraction Word Problems", count: 3, easy: 1, medium: 1, hard: 1 },
  { name: "Percentage",             count: 3, easy: 1, medium: 2, hard: 0 },
  { name: "Arithmetic",             count: 3, easy: 2, medium: 1, hard: 0 },
  { name: "Linear Eq. Formula",     count: 2, easy: 0, medium: 2, hard: 0 },
  { name: "Statistics",             count: 2, easy: 1, medium: 1, hard: 0 },
  { name: "Sequence",               count: 2, easy: 0, medium: 1, hard: 1 },
  { name: "Inequalities",           count: 1, easy: 0, medium: 1, hard: 0 },
  // Total: 50 | Easy: 17 | Medium: 25 | Hard: 8
];

// Reading Comprehension subcategories (47 of the 50 ELA questions).
// These are served through adaptive passage selection — not standalone items.
export const RC_DISTRIBUTION: SubcategoryConfig[] = [
  { name: "Main Idea",               count: 8, easy: 2, medium: 4, hard: 2 },
  { name: "Supporting Details",      count: 8, easy: 3, medium: 4, hard: 1 },
  { name: "Vocabulary in Context",   count: 7, easy: 2, medium: 4, hard: 1 },
  { name: "Inference",               count: 8, easy: 1, medium: 4, hard: 3 },
  { name: "Figurative Language",     count: 7, easy: 1, medium: 4, hard: 2 },
  { name: "Author's Purpose & Tone", count: 5, easy: 1, medium: 3, hard: 1 },
  { name: "Text Structure",          count: 4, easy: 1, medium: 2, hard: 1 },
  // Total: 47 | Easy: 11 | Medium: 25 | Hard: 11
];

// Revising / Editing subcategories (3 of the 50 ELA questions).
// These are standalone items served at the end of ELA — after all passage sets.
export const RE_DISTRIBUTION: SubcategoryConfig[] = [
  { name: "Sentence Structure",  count: 1, easy: 0, medium: 1, hard: 0 },
  { name: "Usage & Grammar",     count: 1, easy: 1, medium: 0, hard: 0 },
  { name: "Punctuation",         count: 1, easy: 0, medium: 1, hard: 0 },
  // Total: 3 | Easy: 1 | Medium: 2 | Hard: 0
];

// Combined ELA distribution (kept for backward-compatible callers that expect one array).
export const ELA_DISTRIBUTION: SubcategoryConfig[] = [
  ...RE_DISTRIBUTION,
  ...RC_DISTRIBUTION,
  // Grand Total: 50 | Easy: 12 | Medium: 27 | Hard: 11
];
