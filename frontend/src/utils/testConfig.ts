// SHSAT mock test question distribution.
// Totals: Math = 57 (18 easy, 31 medium, 8 hard), ELA = 57 (15 easy, 30 medium, 12 hard).
// Each subcategory count reflects the real SHSAT's weighted topic frequency.

export interface SubcategoryConfig {
  name: string;
  count: number;
  easy: number;
  medium: number;
  hard: number;
}

export const MATH_DISTRIBUTION: SubcategoryConfig[] = [
  { name: "Stats & Data Analysis",  count: 7, easy: 3, medium: 3, hard: 1 },
  { name: "Ratios & Proportions",   count: 7, easy: 2, medium: 4, hard: 1 },
  { name: "Algebra & Equations",    count: 6, easy: 2, medium: 3, hard: 1 },
  { name: "Probability",            count: 6, easy: 2, medium: 3, hard: 1 },
  { name: "Algebraic Expressions",  count: 5, easy: 1, medium: 3, hard: 1 },
  { name: "Geometry",               count: 5, easy: 1, medium: 3, hard: 1 },
  { name: "Rate / Unit Rate",       count: 4, easy: 2, medium: 2, hard: 0 },
  { name: "Fraction Word Problems", count: 4, easy: 1, medium: 2, hard: 1 },
  { name: "Percentage",             count: 3, easy: 1, medium: 2, hard: 0 },
  { name: "Arithmetic",             count: 3, easy: 2, medium: 1, hard: 0 },
  { name: "Linear Eq. Formula",     count: 2, easy: 0, medium: 2, hard: 0 },
  { name: "Statistics",             count: 2, easy: 1, medium: 1, hard: 0 },
  { name: "Sequence",               count: 2, easy: 0, medium: 1, hard: 1 },
  { name: "Inequalities",           count: 1, easy: 0, medium: 1, hard: 0 },
  // Total: 57 | Easy: 18 | Medium: 31 | Hard: 8
];

export const ELA_DISTRIBUTION: SubcategoryConfig[] = [
  // Revising / Editing (11 questions)
  { name: "Sentence Structure",      count: 4, easy: 1, medium: 2, hard: 1 },
  { name: "Usage & Grammar",         count: 4, easy: 2, medium: 2, hard: 0 },
  { name: "Punctuation",             count: 2, easy: 1, medium: 1, hard: 0 },
  { name: "Text Organization",       count: 1, easy: 0, medium: 1, hard: 0 },
  // Reading Comprehension (46 questions across 6 passages)
  { name: "Main Idea",               count: 8, easy: 2, medium: 4, hard: 2 },
  { name: "Supporting Details",      count: 8, easy: 3, medium: 4, hard: 1 },
  { name: "Vocabulary in Context",   count: 7, easy: 2, medium: 4, hard: 1 },
  { name: "Inference",               count: 8, easy: 1, medium: 4, hard: 3 },
  { name: "Figurative Language",     count: 6, easy: 1, medium: 3, hard: 2 },
  { name: "Author's Purpose & Tone", count: 5, easy: 1, medium: 3, hard: 1 },
  { name: "Text Structure",          count: 4, easy: 1, medium: 2, hard: 1 },
  // Total: 57 | Easy: 15 | Medium: 30 | Hard: 12
];
