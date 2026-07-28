// supabase/functions/generate-questions/index.ts
// POST { type, count, difficulties?: string[], categories?: string[], choice_count?: number }
// Calls Claude to generate SHSAT-style math questions and inserts them into all_questions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MATH_SUBCATS = [
  "Arithmetic",
  "Algebra_and_Equations",
  "Algebraic_Expressions",
  "Geometry",
  "Fraction_Word_Problems",
  "Percentage",
  "Ratios_and_Proportions",
  "Probability",
  "Stats_and_Data_Analysis",
  "Sequence",
  "Inequalities",
  "Linear_Eq._Formula",
];

const ELA_SUBCATS = ["Vocabulary_in_Context", "Grammar_and_Usage"];

interface GeneratedQuestion {
  text: string;
  choice_1?: string;
  choice_2?: string;
  choice_3?: string;
  choice_4?: string;
  choice_5?: string;
  choice_6?: string;
  select_count?: number;
  variables?: string[];
  // number_line_click fields
  nl_min?: number;
  nl_max?: number;
  nl_step?: number;
  // table_row_radio fields
  col_headers?: string[];
  rows?: string[];
  // drag_fill_multiple: blank count inferred from text [BLANK_N] markers
  // drag_to_bin / drag_to_categorize fields
  items?: string[];
  bins?: string[];
  // inline_text_span_click field
  passage?: string;
  answer: string;
  sub_category: string;
  explanation?: string;
  valid?: boolean;
  valid_note?: string;
}

// ── Sequential UID helper ────────────────────────────────────────────────────────

async function getNextUidStart(supabase: ReturnType<typeof createClient>): Promise<number> {
  // Fetch all ai_Q UIDs and find the max numerically — lexicographic ordering
  // is unreliable for un-padded numbers ("ai_Q9" > "ai_Q20" as a string).
  const { data } = await supabase
    .from("all_questions")
    .select("uid")
    .like("uid", "ai_Q%");

  if (!data || data.length === 0) return 1;

  let max = 0;
  for (const row of data) {
    const match = (row.uid as string).match(/^ai_Q(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function makeUid(n: number): string {
  return `ai_Q${n}`;
}

// ── Prompt builders ────────────────────────────────────────────────────────────

const VALIDATION_KEYS = `- "valid": true if you have verified the question is solvable, unambiguous, and the answer is definitely correct. false if you have any doubt.
- "valid_note": empty string "" if valid. If invalid, one sentence describing the issue.`;

function buildPrompt(type: string, count: number, difficulty: string, choiceCount = 5, categories: string[] = MATH_SUBCATS, subject = "math"): string {
  const cats = categories.length > 0 ? categories : MATH_SUBCATS;
  const diffDesc: Record<string, string> = {
    easy: "single-step computation, basic concepts, direct application of one rule",
    medium: "multi-step problems requiring 2-3 operations, moderate algebra or geometry",
    hard: "complex multi-step reasoning, non-obvious algebraic manipulation, challenging word problems",
    mixed: "one-third easy (basic), one-third medium (multi-step), one-third hard (complex)",
    "easy-medium": "half easy (basic single-step) and half medium (multi-step), no hard questions",
    "easy-hard": "half easy (basic single-step) and half hard (complex reasoning), no medium questions",
    "medium-hard": "half medium (multi-step) and half hard (complex reasoning), no easy questions",
  };
  const diff = diffDesc[difficulty] ?? diffDesc.mixed;

  // ── ELA branches (standalone vocab/grammar, no passage) ─────────────────────

  if (subject === "english" && type === "mcq") {
    const elaDiff: Record<string, string> = {
      easy: "common, grade-level vocabulary and straightforward grammar rules most 7th-graders know",
      medium: "moderately advanced academic vocabulary and multi-rule grammar situations",
      hard: "sophisticated vocabulary (SAT-level) and subtle grammar distinctions requiring careful analysis",
      mixed: "mix: one-third easy (common words/basic grammar), one-third medium, one-third hard (sophisticated)",
      "easy-medium": "half easy and half medium difficulty",
      "easy-hard": "half easy and half hard difficulty",
      "medium-hard": "half medium and half hard difficulty",
    };
    const elaCats = categories.filter(c => ELA_SUBCATS.includes(c));
    const elaSubcats = elaCats.length > 0 ? elaCats : ELA_SUBCATS;
    return `Generate exactly ${count} SHSAT-style ELA vocabulary and grammar multiple-choice questions for 7th–8th grade students. These are standalone questions — no reading passage is required.

Difficulty: ${elaDiff[difficulty] ?? elaDiff.mixed}
Topics to use: ${elaSubcats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": the complete question. For vocabulary: embed the word in a sentence that gives context, then ask about its meaning, synonym, or connotation. For grammar: present one or more sentences and ask which is correct or which revision is best. All context needed must be inside the question itself.
- "choice_1": the CORRECT answer (plain text, no letter prefix)
- "choice_2": plausible distractor
- "choice_3": plausible distractor
- "choice_4": plausible distractor
- "answer": exactly "A" (choice_1 is always correct — choices are shuffled before display)
- "sub_category": one of: Vocabulary_in_Context, Grammar_and_Usage
- "explanation": 1–2 sentences explaining why the correct answer is right and each distractor is wrong
${VALIDATION_KEYS}

VOCABULARY QUESTION FORMATS (sub_category: Vocabulary_in_Context):
1. Synonym in context — "The explorer was tenacious in her quest, refusing to give up despite countless setbacks. Which word is CLOSEST in meaning to 'tenacious'?"
2. Word choice — "Which word best completes the sentence: 'The speaker's ______ tone immediately put the nervous audience at ease.'"
3. Antonym — "Which word is most OPPOSITE in meaning to 'benevolent'?"
4. Connotation — "Which word has the most NEGATIVE connotation?" (with 4 semantically related but tonally different words)

GRAMMAR QUESTION FORMATS (sub_category: Grammar_and_Usage):
1. Subject-verb agreement — "Which sentence uses the verb form correctly?"
2. Pronoun-antecedent agreement — "Which sentence correctly uses a pronoun to refer to its antecedent?"
3. Verb tense consistency — "Which sentence uses verb tense correctly throughout?"
4. Parallel structure — "Which revision best improves the sentence's parallel structure?"
5. Modifier placement — "Which sentence correctly places the modifier?"

RULES:
- All 4 choices must be the same part of speech
- Distractors must be plausible — near-synonyms, common mistakes, or words that almost fit
- Vocabulary uses academic words appropriate for 7th–8th grade (e.g. meticulous, benevolent, tenacious, ambiguous, concise, lucid)
- Grammar tests one specific rule per question; do not combine multiple errors
- No reading passage needed — all context is in the question text itself
- Self-check: confirm only choice_1 is clearly correct; all distractors are clearly wrong

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example vocabulary: {"text":"The scientist was meticulous in recording her observations, noting every detail no matter how small. Which word is CLOSEST in meaning to 'meticulous' as used here?","choice_1":"precise","choice_2":"hasty","choice_3":"casual","choice_4":"uncertain","answer":"A","sub_category":"Vocabulary_in_Context","explanation":"'Meticulous' means extremely careful and precise. 'Hasty', 'casual', and 'uncertain' all contradict the idea of careful attention to detail.","valid":true,"valid_note":""}
Example grammar: {"text":"Which sentence uses subject-verb agreement correctly?","choice_1":"Each of the students has submitted the assignment.","choice_2":"Each of the students have submitted the assignment.","choice_3":"Each of the student has submitted the assignment.","choice_4":"Each of the students submitting the assignment.","answer":"A","sub_category":"Grammar_and_Usage","explanation":"'Each' is singular and takes the singular verb 'has'. Options B, C, and D use incorrect verb forms or sentence fragments.","valid":true,"valid_note":""}`;
  }

  if (subject === "english" && type === "multi-select") {
    const elaDiff: Record<string, string> = {
      easy: "common vocabulary and straightforward grammar that most 7th-graders know",
      medium: "moderately advanced vocabulary and multi-rule grammar",
      hard: "sophisticated vocabulary and nuanced grammar requiring careful analysis",
      mixed: "mix of easy, medium, and hard",
      "easy-medium": "half easy and half medium",
      "easy-hard": "half easy and half hard",
      "medium-hard": "half medium and half hard",
    };
    const elaCats = categories.filter(c => ELA_SUBCATS.includes(c));
    const elaSubcats = elaCats.length > 0 ? elaCats : ELA_SUBCATS;
    const selectCount = choiceCount <= 4 ? 2 : choiceCount === 5 ? 2 : 3;
    return `Generate exactly ${count} SHSAT-style ELA multi-select vocabulary and grammar questions for 7th–8th grade students. These are standalone questions — no reading passage is required.

In this format students select exactly ${selectCount} correct answers from ${choiceCount} choices using square checkboxes.

Difficulty: ${elaDiff[difficulty] ?? elaDiff.mixed}
Topics to use: ${elaSubcats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": the complete question. Must explicitly state how many to select: "Select the ${selectCount === 2 ? "TWO" : "THREE"} ..." All context needed must be in the question itself — no passage.
- "choice_1" through "choice_${choiceCount}": answer options (plain text, no letter prefix)
- "select_count": ${selectCount}
- "answer": comma-separated correct letters sorted alphabetically, e.g. "A,C" or "A,B,D"
- "sub_category": one of: Vocabulary_in_Context, Grammar_and_Usage
- "explanation": explain why each correct choice is right and each wrong choice is wrong
${VALIDATION_KEYS}

QUESTION TYPES:
1. Synonyms — "Select the ${selectCount === 2 ? "TWO" : "THREE"} words CLOSEST in meaning to 'diligent'." (options span synonyms, near-synonyms, unrelated, and antonyms)
2. Antonyms — "Select the ${selectCount === 2 ? "TWO" : "THREE"} words most OPPOSITE in meaning to 'generous'."
3. Correct grammar — "Select the ${selectCount === 2 ? "TWO" : "THREE"} sentences that are grammatically correct." (wrong ones have clear rule violations)
4. Word fit — "Select the ${selectCount === 2 ? "TWO" : "THREE"} words that could appropriately replace 'said' in formal academic writing."
5. Connotation — "Select the ${selectCount === 2 ? "TWO" : "THREE"} words with a POSITIVE connotation."
6. Same part of speech — "Select the ${selectCount === 2 ? "TWO" : "THREE"} words that function as adjectives."

RULES:
- Exactly ${selectCount} choices must be correct — no borderline cases
- Wrong choices must be clearly wrong, not just slightly weaker
- All choices for vocabulary questions must be the same part of speech
- For grammar questions, wrong sentences must each violate a specific, identifiable rule
- Academic vocabulary appropriate for 7th–8th grade
- Self-check: confirm exactly ${selectCount} choices are correct

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Select the TWO words that are closest in meaning to 'meticulous'.","choice_1":"precise","choice_2":"thorough","choice_3":"reckless","choice_4":"hasty","choice_5":"confident","select_count":2,"answer":"A,B","sub_category":"Vocabulary_in_Context","explanation":"'Meticulous' means very careful and thorough. 'Precise' (A) and 'thorough' (B) share this meaning. 'Reckless' and 'hasty' are opposites in spirit; 'confident' is unrelated.","valid":true,"valid_note":""}`;
  }

  if (subject === "english" && type === "table_row_radio") {
    const elaDiff: Record<string, string> = {
      easy: "common words and basic grammar concepts that most 7th-graders know",
      medium: "moderately advanced vocabulary and grammar requiring some analysis",
      hard: "sophisticated vocabulary and nuanced grammar distinctions",
      mixed: "mix of easy, medium, and hard classification items",
      "easy-medium": "half easy and half medium difficulty",
      "easy-hard": "half easy and half hard difficulty",
      "medium-hard": "half medium and half hard difficulty",
    };
    const elaCats = categories.filter(c => ELA_SUBCATS.includes(c));
    const elaSubcats = elaCats.length > 0 ? elaCats : ELA_SUBCATS;
    return `Generate exactly ${count} SHSAT-style ELA classification table questions for 7th–8th grade students. These are standalone questions — no reading passage is required.

In this format a table is shown with items to classify (rows) and 2–4 category columns. Students select exactly one column radio button per row.

Difficulty: ${elaDiff[difficulty] ?? elaDiff.mixed}
Topics to use: ${elaSubcats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": 1–2 sentence prompt setting up the classification task. Do NOT list the row items in the text.
- "col_headers": array of 2–4 category labels (e.g. ["Noun", "Verb", "Adjective"])
- "rows": array of 3–5 items to classify (words, short phrases, or short sentences)
- "answer": comma-separated column letters (A/B/C/D), one per row in order, e.g. "A,C,B,A,B"
- "sub_category": one of: Vocabulary_in_Context, Grammar_and_Usage
- "explanation": brief reason for each row's classification
${VALIDATION_KEYS}

CLASSIFICATION TYPES (pick variety, no passages needed):
1. Part of speech — col_headers: ["Noun","Verb","Adjective"] rows: individual words like "justice", "clarify", "enormous"
2. Connotation — col_headers: ["Positive","Negative","Neutral"] rows: words like "courageous", "reckless", "proceed"
3. Grammar correctness — col_headers: ["Correct","Incorrect"] rows: short sentences, some violating a clear grammar rule
4. Formality — col_headers: ["Formal","Informal"] rows: word pairs like "demonstrate"/"show", "purchase"/"buy"
5. Verb tense — col_headers: ["Past","Present","Future"] rows: short sentences with clear tense markers
6. Synonym / Antonym of a given word — col_headers: ["Synonym","Antonym"] rows: related words
7. Adjective vs. Adverb — col_headers: ["Adjective","Adverb"] rows: words like "quick", "quickly", "careful", "carefully"

RULES:
- Every row must have exactly ONE unambiguously correct column — no borderline cases
- Use words and sentences appropriate for 7th–8th grade
- Ensure the column headers are mutually exclusive and exhaustive for the items given
- For grammar: wrong sentences must each violate exactly one identifiable rule
- Self-check: verify each row item belongs to exactly one column

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Classify each word according to its part of speech. Complete the table.","col_headers":["Noun","Verb","Adjective"],"rows":["justice","clarify","enormous","wisdom","transform"],"answer":"A,B,C,A,B","sub_category":"Grammar_and_Usage","explanation":"'Justice' (A) and 'wisdom' (A) are nouns. 'Clarify' (B) and 'transform' (B) are verbs. 'Enormous' (C) is an adjective.","valid":true,"valid_note":""}`;
  }

  if (type === "linear_graphing") {
    return `Generate exactly ${count} SHSAT-style linear graphing questions for 7th-8th grade students preparing for a specialized high school entrance exam.

Difficulty distribution: ${diff}
- Easy: state the equation in slope-intercept form (y = mx + b) with small integers
- Medium: give standard form (ax + by = c) or a two-point scenario the student must graph
- Hard: a real-world word problem where the student writes and graphs a linear equation

For each question return an object with EXACTLY these keys:
- "text": the full question prompt. End easy/medium questions with "Graph the line on the coordinate plane." For hard questions, include a word-problem setup.
- "answer": a JSON-encoded string describing the correct line. Format: {"m":2,"b":3} for y=2x+3, or {"vertical":true,"x":4} for x=4. Only use integer slopes and intercepts in the range [-8, 8]. The plane ranges from -10 to 10 on both axes.
- "sub_category": "Linear_Graphing"
- "explanation": 1-2 sentences explaining how to find the correct slope and y-intercept
${VALIDATION_KEYS}

IMPORTANT RULES:
- Every question must have a unique, clearly defined correct answer
- Easy: use slopes like 1, 2, -1, -2 and intercepts in [-5, 5]
- Medium: use slopes like 1/2 (→ 0.5), 3, -3 and intercepts in [-8, 8] — keep integer or simple decimal slopes/intercepts
- Hard: write a concrete scenario (cost, speed, temperature) and derive a line from it
- No duplicate equations across the batch
- Self-check: for each question, verify the equation you wrote in "answer" matches the equation in "text"

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text, no comments.

Example of one correct object:
{"text":"Graph the equation y = 2x − 3 on the coordinate plane.","answer":"{\\"m\\":2,\\"b\\":-3}","sub_category":"Linear_Graphing","explanation":"This line has slope 2 and y-intercept −3. Place a point at (0,−3) and use rise/run of 2/1.","valid":true,"valid_note":""}`;
  }

  if (type === "grid-in") {
    return `Generate exactly ${count} SHSAT-style math grid-in (free response, no choices) questions for 7th-8th grade students.

Difficulty: ${diff}

Grid-in questions require a single numeric answer. Accepted formats: whole number, fraction (e.g. 3/4), mixed number as improper fraction (e.g. 7/2), or decimal.

For each question return an object with EXACTLY these keys:
- "text": the complete question text with all necessary information
- "answer": the exact correct answer as a string (e.g. "42", "3/4", "0.75")
- "sub_category": one of: ${cats.join(", ")}
- "explanation": a brief step-by-step solution (2-3 sentences)
${VALIDATION_KEYS}

RULES:
- Answers must be unambiguous — one value only
- Avoid decimals that cannot be expressed exactly in a grid
- Use real-world contexts: prices, distances, times, scores
- Vary sub_category evenly across the batch
- Self-check: work through the problem yourself and confirm your "answer" is correct before returning

Return ONLY a valid JSON array of ${count} objects. No markdown, no extra text.`;
  }

  if (type === "multi-select") {
    const letters = ["A", "B", "C", "D", "E", "F"].slice(0, choiceCount);
    const letterRange = `A–${letters[letters.length - 1]}`;
    const choiceFields = letters.map((l, i) =>
      `- "choice_${i + 1}": option ${l} text — plain text only, no letter prefix${i < 4 ? "" : " (required)"}`
    ).join("\n");
    const exampleChoices = choiceCount === 4
      ? `"choice_1":"5","choice_2":"6","choice_3":"8","choice_4":"9"`
      : choiceCount === 5
      ? `"choice_1":"5","choice_2":"6","choice_3":"8","choice_4":"9","choice_5":"11"`
      : `"choice_1":"5","choice_2":"6","choice_3":"8","choice_4":"9","choice_5":"11","choice_6":"12"`;

    const maxSelectCount = choiceCount - 1; // always leave at least one wrong answer

    return `Generate exactly ${count} SHSAT-style math multiple-select questions for 7th-8th grade students preparing for a specialized high school entrance exam.

Difficulty: ${diff}

Each question has exactly ${choiceCount} answer choices (${letterRange}). The number of correct answers (select_count) must vary randomly across the batch — use values between 1 and ${maxSelectCount} and distribute them as evenly as possible (e.g. for 10 questions: roughly equal spread of 1, 2, 3, …, ${maxSelectCount}).

For each question return an object with EXACTLY these keys:
- "text": the complete question text. End with "Select the [N] correct answer(s)." where [N] is the English word for select_count (one/two/three/four/five). Use singular "answer" when select_count is 1, plural "answers" otherwise.
${choiceFields}
- "select_count": integer between 1 and ${maxSelectCount} — randomized per question
- "answer": comma-separated sorted letters of ALL correct choices (e.g. "A" or "A,C" or "A,B,E")
- "sub_category": one of: ${cats.join(", ")}
- "explanation": why each listed answer is correct and why each unlisted option is wrong
${VALIDATION_KEYS}

RULES:
- Generate exactly ${choiceCount} choices — no more, no fewer
- select_count must be at least 1 and at most ${maxSelectCount} (never equal to ${choiceCount} — there must always be at least one wrong choice)
- "answer" must contain exactly select_count letters, sorted ${letterRange.replace("–", "→")}
- Spread select_count values evenly: avoid using the same value for every question in the batch
- Wrong choices must be plausible student mistakes (off-by-sign, wrong operation, nearby value)
- Good multi-select topics: properties of numbers (prime, multiples, factors), which equations have a given solution, which expressions are equivalent, which values satisfy an inequality
- Every answer letter must correspond to a non-null choice; choices not in "answer" must be genuinely incorrect
- Distribute sub_category evenly across the batch
- Self-check: count the letters in "answer" — it must equal select_count exactly

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example of one correct object (select_count=1):
{"text":"Which of the following is a prime number? Select the one correct answer.",${exampleChoices},"select_count":1,"answer":"B","sub_category":"Arithmetic","explanation":"6 is prime... (only B is correct). The other options are composite.","valid":true,"valid_note":""}`;
  }

  if (type === "expression") {
    return `Generate exactly ${count} SHSAT-style math expression/equation/inequality questions for 7th-8th grade students.

Difficulty: ${diff}

Students answer by building an expression on a virtual keyboard that has: digits 0–9, operators + − × ÷ / %, comparisons = < > ≤ ≥, grouping ( ), functions √( π | ^, and specific variable buttons.

For each question return an object with EXACTLY these keys:
- "text": the complete question text. End with "Enter your answer in the space provided. Enter only your answer."
- "variables": array of single-letter variable names used in the question (e.g. ["x"], ["n", "b"], ["p", "w"]). NEVER use "o" (looks like zero) or "l" (looks like one) as variable names — use other letters instead.
- "answer": the complete correct expression/equation/inequality as a string, using exact Unicode symbols: × (U+00D7), ÷ (U+00F7), − (U+2212), ≤ (U+2264), ≥ (U+2265), √, π. Use ^ for exponents (e.g. x^2). Use / for fractions (e.g. n/2).
- "sub_category": one of: ${cats.join(", ")}
- "explanation": step-by-step derivation of the answer
${VALIDATION_KEYS}

QUESTION TYPES (vary these evenly):
1. Write an inequality — "A number n is at least 3 more than twice m. Write an inequality." → "n ≥ 2m + 3"
2. Write an equation — "The perimeter of a rectangle with length l and width 5 is 28. Write an equation for l." → "2l + 10 = 28"
3. Write an expression — "The cost of x items at $4 each minus a $2 coupon. Write an expression." → "4x − 2"
4. Solve and write — "Write the value of n that satisfies: 3n + 1 = 10." → "3"
5. Write a formula — word problem requiring translating a relationship into math notation

RULES:
- Variables array must list EVERY letter used in the answer (so the keyboard shows those buttons)
- NEVER use "o" or "l" as variable names — they look identical to 0 and 1 on screen
- Answer must use proper Unicode symbols, NOT ASCII substitutes (−, not -; ×, not *; ÷, not /)
- Answer must be the minimal correct form (e.g. "2n + 3" not "2 × n + 3" unless both are acceptable)
- Keep expressions simple: 1–3 terms, coefficients ≤ 20, at most one operation under a √
- Self-check: substitute a value for each variable and verify both sides of your answer are consistent

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example of one correct object:
{"text":"A store sells notebooks for $n each and pens for $p each. Mia buys 3 notebooks and 2 pens. Write an expression for the total cost. Enter your answer in the space provided. Enter only your answer.","variables":["n","p"],"answer":"3n + 2p","sub_category":"Algebraic_Expressions","explanation":"Multiply price by quantity for each item and add: 3 × n + 2 × p = 3n + 2p.","valid":true,"valid_note":""}`;
  }

  if (type === "inline-dropdown") {
    const diffDesc: Record<string, string> = {
      easy: "common, frequently-used words that most 7th-graders know",
      medium: "moderately advanced vocabulary or slightly tricky grammar forms",
      hard: "sophisticated vocabulary or nuanced grammar distinctions that require careful reading of context",
      mixed: "one-third easy (common words), one-third medium, one-third hard (sophisticated vocabulary)",
      "easy-medium": "half easy and half medium difficulty",
      "easy-hard": "half easy and half hard difficulty",
      "medium-hard": "half medium and half hard difficulty",
    };
    const diff = diffDesc[difficulty] ?? diffDesc.mixed;

    return `Generate exactly ${count} SHSAT-style inline-dropdown ELA questions for 7th-8th grade students.

Difficulty: ${diff}

In this question type, a sentence is shown with a [BLANK] in the middle and the student selects the correct word or phrase from a dropdown. The question text IS the sentence itself — do not add a prompt like "Which word best completes..." before it; the sentence with the blank IS the question.

For each question return an object with EXACTLY these keys:
- "text": one complete sentence containing exactly one [BLANK] marker where the dropdown appears. The sentence must be grammatically complete on both sides of the blank. Do not add instructions — just the sentence.
- "choice_1": answer option A — the correct answer (plain text only, no letter prefix)
- "choice_2": answer option B — a plausible but wrong distractor
- "choice_3": answer option C — a plausible but wrong distractor
- "choice_4": answer option D — a plausible but wrong distractor
- "answer": exactly "A" (since choice_1 is always the correct answer — they will be shuffled before display)
- "sub_category": one of: Vocabulary_in_Context, Grammar_and_Usage
- "explanation": why the correct answer fits and why each distractor is wrong
${VALIDATION_KEYS}

RULES:
- The sentence must make unambiguous sense with only choice_1 filling the blank
- Distractors must be plausible — wrong part of speech, wrong tense, wrong connotation, or near-synonym that doesn't fit
- Vocabulary questions: test precise word choice in context (e.g. "The politician's speech was [BLANK], drawing applause from every section of the crowd.")
- Grammar questions: test correct verb form, pronoun agreement, or tense consistency
- Keep sentences rich enough that context guides the answer — avoid overly short, context-free sentences
- All four choices should be the same part of speech and similar in length
- No answer leaking — the sentence must not contain the answer word elsewhere
- Self-check: read the sentence with each choice inserted and confirm only choice_1 produces a clearly correct sentence

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example of one correct object:
{"text":"The scientist's findings were so [BLANK] that researchers around the world immediately began replicating her experiment.","choice_1":"groundbreaking","choice_2":"predictable","choice_3":"ordinary","choice_4":"familiar","answer":"A","sub_category":"Vocabulary_in_Context","explanation":"'Groundbreaking' means pioneering or revolutionary, which explains why others rushed to replicate the work. 'Predictable', 'ordinary', and 'familiar' would not motivate replication.","valid":true,"valid_note":""}`;
  }

  if (type === "number_line_click") {
    return `Generate exactly ${count} SHSAT-style math number-line-click questions for 7th-8th grade students.

Difficulty: ${diff}

In this question type the student clicks a single point on an interactive number line to give their answer.
You must design the axis carefully so the correct answer lies exactly on a snap point (a multiple of step).

For each question return an object with EXACTLY these keys:
- "text": the complete question prompt. It must tell the student WHAT value to mark. End with "Mark your answer on the number line."
- "nl_min": integer — the left edge of the number line (e.g. -10, 0, -5)
- "nl_max": integer — the right edge (e.g. 10, 20, 5). Must satisfy nl_max > nl_min.
- "nl_step": a positive number — the snap increment. Use 1 for integers, 0.5 for halves, 0.25 for quarters. NEVER use a step that makes the range have more than 80 ticks (i.e. (nl_max - nl_min) / nl_step ≤ 80).
- "answer": the correct numeric value as a string. MUST be exactly nl_min + k*nl_step for some non-negative integer k, AND must be within [nl_min, nl_max]. e.g. if nl_min=-4, nl_max=6, nl_step=0.5, a valid answer is "2.5".
- "sub_category": one of: ${cats.join(", ")}
- "explanation": 1-2 sentences explaining how to find the answer and where it falls on the number line
${VALIDATION_KEYS}

DIFFICULTY GUIDE:
- easy:   the answer is a labeled integer; no computation needed (e.g. "Mark −3 on the number line.")
- medium: requires simple computation to find the value (e.g. "Solve x + 7 = 3 and mark x.", fraction/decimal conversion)
- hard:   multi-step reasoning or non-obvious value (e.g. "A car travels at 40 mph for 1.5 hours. Mark the distance on the number line.", irrational approximation, word problem)

AXIS DESIGN RULES:
- Choose nl_min and nl_max so the answer is NOT at the very edge (leave at least 2 steps of buffer on each side).
- For integer answers: use nl_step = 1.
- For half-integer answers (e.g. 2.5, −1.5): use nl_step = 0.5.
- For quarter answers: use nl_step = 0.25.
- Keep the range small enough to be readable: prefer ranges of 10–20 units.
- If the question is about negative numbers, make sure nl_min is negative.
- Self-check: verify that parseFloat(answer) === nl_min + k*nl_step for some integer k >= 0.

GOOD QUESTION TYPES:
1. Direct placement: "Mark the integer −7 on the number line." → nl_min=-10, nl_max=0, nl_step=1, answer="-7"
2. Solve and mark: "Solve: x − 4 = 1. Mark the value of x on the number line." → answer="5"
3. Fraction/decimal: "Mark 3/2 on the number line." → nl_min=0, nl_max=4, nl_step=0.5, answer="1.5"
4. Word problem: "A submarine is 6 meters below sea level. Mark its depth on the number line (negative = below)." → nl_min=-10, nl_max=0, nl_step=1, answer="-6"
5. Opposite: "Mark the opposite of 4 on the number line." → answer="-4"
6. Average: "The average of 1 and 5 is ___. Mark it on the number line." → answer="3"

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example of one correct object:
{"text":"Solve x + 3 = 7. Mark the value of x on the number line.","nl_min":-2,"nl_max":12,"nl_step":1,"answer":"4","sub_category":"Algebra_and_Equations","explanation":"x = 7 − 3 = 4. On the number line from −2 to 12 with step 1, the point 4 is two ticks right of center.","valid":true,"valid_note":""}`;
  }

  if (type === "table_row_radio") {
    return `Generate exactly ${count} SHSAT-style math table-classification questions for 7th-8th grade students.

Difficulty: ${diff}

In this question type a table is shown with several rows (items to classify) and 2–4 column options (the classification categories). The student selects exactly one column option per row by clicking a radio button.

For each question return an object with EXACTLY these keys:
- "text": the complete question prompt that sets up the classification task. Should be one or two sentences. Do NOT repeat the row labels in the text — those are in "rows". End with something like "Complete the table."
- "col_headers": array of 2–4 strings — the classification column labels (e.g. ["True","False"] or ["Positive","Negative","Zero"] or ["Rational","Irrational"])
- "rows": array of 3–5 strings — the items to classify (each is one row label in the table). Keep each row label concise (under 60 characters).
- "answer": comma-separated capital letters, one per row, where A = first column, B = second column, etc. Length must equal rows.length exactly.
- "sub_category": one of: ${cats.join(", ")}
- "explanation": for each row, state which column it belongs to and why (one sentence each)
${VALIDATION_KEYS}

DIFFICULTY GUIDE:
- easy: direct recall, obvious classification, common facts (e.g. is this number even/odd?)
- medium: requires computation or applying a definition (e.g. evaluate expression, check divisibility)
- hard: multiple-step reasoning, non-obvious cases, requires combining concepts

EXCELLENT TABLE QUESTION TYPES (use varied types across the batch):
1. Number properties: classify integers as prime/composite/neither; even/odd; rational/irrational
2. Equation solutions: classify each equation as having 0, 1, or 2 solutions
3. Expression sign: classify each expression as positive/negative/zero for a given value of x
4. Geometric properties: classify each angle measure as acute/right/obtuse/straight
5. Inequality satisfaction: classify each value as a solution/not a solution to a given inequality
6. Divisibility: classify each number as divisible by 2/3/5/neither
7. Variable relationship: classify each scenario as proportional/not proportional

TABLE DESIGN RULES:
- col_headers: 2–4 entries. Use exactly 2 for binary (True/False, Yes/No). Use 3 for ternary. Never exceed 4.
- rows: 3–5 items. Use 4 rows as the default. Each row must clearly belong to exactly one column.
- Distribute answers evenly: don't put all items in the same column. Aim for roughly equal counts per column.
- answer length must equal rows.length — verify this before returning.
- Each row item must be unambiguous — it fits exactly one column, not two.
- Self-check: go through each row item and confirm which column it belongs to, then verify your answer string matches.

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example of one correct object (col A=True, B=False):
{"text":"For each statement about integers, select True or False.","col_headers":["True","False"],"rows":["The product of two negative numbers is negative.","All prime numbers are odd.","Zero is neither positive nor negative.","The sum of any two even numbers is even."],"answer":"B,B,A,A","sub_category":"Arithmetic","explanation":"Row1: neg×neg=positive (False). Row2: 2 is prime and even (False). Row3: zero is neither (True). Row4: even+even=even (True).","valid":true,"valid_note":""}`;
  }

  // ── drag_fill_single ────────────────────────────────────────────────────────────

  if (type === "drag_fill_single") {
    const isDragEla = subject === "english";
    const elaDiff: Record<string, string> = {
      easy:         "common vocabulary and straightforward grammar most 7th-graders know",
      medium:       "moderately advanced academic vocabulary and multi-rule grammar",
      hard:         "sophisticated SAT-level vocabulary and nuanced grammar",
      mixed:        "mix of easy, medium, and hard",
      "easy-medium":"half easy and half medium",
      "easy-hard":  "half easy and half hard",
      "medium-hard":"half medium and half hard",
    };
    const activeCats = isDragEla
      ? (categories.filter(c => ELA_SUBCATS.includes(c)).length > 0 ? categories.filter(c => ELA_SUBCATS.includes(c)) : ELA_SUBCATS)
      : cats;

    return `Generate exactly ${count} SHSAT-style ${isDragEla ? "ELA vocabulary/grammar" : "math"} drag-fill-single questions for 7th–8th grade students.

In this question type, a sentence (or short phrase) contains exactly one [BLANK] placeholder. A bank of 4 draggable word tiles is shown below — the student drags the correct tile into the blank.

Difficulty: ${isDragEla ? (elaDiff[diff] ?? elaDiff.mixed) : diff}
Topics to use: ${activeCats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": the complete sentence containing exactly one [BLANK] marker. The sentence must be grammatically complete on both sides of the blank. Do NOT add instructions — just the sentence. For math: can be an equation, word-problem sentence, or fill-in-the-definition prompt.
- "choice_1": the CORRECT tile (plain text, no letter prefix)
- "choice_2": a plausible wrong distractor
- "choice_3": a plausible wrong distractor
- "choice_4": a plausible wrong distractor
- "answer": exactly "A" (choice_1 is always correct — tiles are shuffled before display)
- "sub_category": one of: ${activeCats.join(", ")}
- "explanation": 1–2 sentences: why the correct tile fits and why each distractor is wrong
${VALIDATION_KEYS}

${isDragEla ? `ELA QUESTION FORMATS:
1. Vocabulary: embed word in sentence, ask for synonym/replacement. e.g. "The scientist was [BLANK] in recording every detail." → tiles: meticulous, careless, hasty, vague
2. Grammar: sentence with blank testing verb form, pronoun, or word choice. e.g. "Each of the students [BLANK] submitted the assignment." → tiles: has, have, having, had been
3. Connotation: "The journalist wrote in a [BLANK] tone, making readers uncomfortable." → tiles: accusatory, neutral, celebratory, calming
All 4 tiles must be the same part of speech. Correct tile should be clearly best; distractors plausible but wrong.` : `MATH QUESTION FORMATS:
1. Fill-in-the-answer: "If x + 5 = 12, then x = [BLANK]." → tiles: 7, 5, 17, 3
2. Fill-in-the-operation/term: "The area of a triangle is ½ × base × [BLANK]." → tiles: height, width, perimeter, radius
3. Fill-in-the-definition: "A triangle with all sides equal is called [BLANK]." → tiles: equilateral, isosceles, scalene, right
4. Fill-in-a-formula step: "To find 30% of 80, compute 80 × [BLANK]." → tiles: 0.3, 3, 0.03, 30
5. Complete the pattern: "The next term in 2, 4, 8, 16, [BLANK] is…" (tile is the answer)
Tiles must be the same category (all numbers, all words, all expressions) to avoid giving away the answer.`}

RULES:
- The blank must appear INSIDE the sentence, not at the very start or very end
- The sentence with choice_1 inserted must be unambiguously correct
- Distractors must look plausible to a student who hasn't mastered the topic
- Self-check: insert each tile and confirm only choice_1 produces a clearly correct sentence

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

${isDragEla
  ? `Example: {"text":"The museum curator was [BLANK] about the authenticity of the artifact, refusing to display it until experts confirmed it was genuine.","choice_1":"skeptical","choice_2":"enthusiastic","choice_3":"indifferent","choice_4":"reckless","answer":"A","sub_category":"Vocabulary_in_Context","explanation":"'Skeptical' means doubtful, which fits refusing to display until confirmed. 'Enthusiastic' and 'indifferent' contradict the caution; 'reckless' means the opposite of careful.","valid":true,"valid_note":""}`
  : `Example: {"text":"A quadrilateral with exactly one pair of parallel sides is called a [BLANK].","choice_1":"trapezoid","choice_2":"parallelogram","choice_3":"rhombus","choice_4":"rectangle","answer":"A","sub_category":"Geometry","explanation":"A trapezoid has exactly one pair of parallel sides. A parallelogram (including rhombus/rectangle) has two pairs.","valid":true,"valid_note":""}`}`;
  }

  // ── drag_fill_multiple ──────────────────────────────────────────────────────────

  if (type === "drag_fill_multiple") {
    const isDragEla = subject === "english";
    const elaDiff: Record<string, string> = {
      easy:         "common vocabulary and basic grammar most 7th-graders know",
      medium:       "moderately advanced vocabulary and multi-rule grammar",
      hard:         "sophisticated vocabulary and nuanced grammar requiring analysis",
      mixed:        "mix of easy, medium, and hard",
      "easy-medium":"half easy and half medium",
      "easy-hard":  "half easy and half hard",
      "medium-hard":"half medium and half hard",
    };
    const activeCats = isDragEla
      ? (categories.filter(c => ELA_SUBCATS.includes(c)).length > 0 ? categories.filter(c => ELA_SUBCATS.includes(c)) : ELA_SUBCATS)
      : cats;
    // 2–3 blanks per question; token pool = blanks + 1–2 distractors
    const blankCount = Math.min(3, Math.max(2, 2));
    const tokenCount = blankCount + 2; // 4 or 5 tokens total

    return `Generate exactly ${count} SHSAT-style ${isDragEla ? "ELA vocabulary/grammar" : "math"} drag-fill-multiple questions for 7th–8th grade students.

In this question type, a sentence or short passage has ${blankCount} blanks marked [BLANK_1], [BLANK_2]${blankCount > 2 ? ", [BLANK_3]" : ""}. A bank of ${tokenCount} word tiles is shown below (includes ${tokenCount - blankCount} distractor${tokenCount - blankCount !== 1 ? "s" : ""}). The student drags one tile into each blank.

Difficulty: ${isDragEla ? (elaDiff[diff] ?? elaDiff.mixed) : diff}
Topics to use: ${activeCats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": the complete sentence(s) containing exactly ${blankCount} blank markers in order: [BLANK_1]${blankCount > 1 ? ", [BLANK_2]" : ""}${blankCount > 2 ? ", [BLANK_3]" : ""}. Each blank is inside a grammatically meaningful position. For math: can span a multi-step explanation or a word problem.
- "choice_1" through "choice_${tokenCount}": all ${tokenCount} tiles in the bank (plain text, no letter prefix). The correct tiles for [BLANK_1], [BLANK_2]${blankCount > 2 ? ", [BLANK_3]" : ""} must be at specific positions corresponding to the answer field.
- "answer": comma-separated letters, one per blank in order. e.g. "A,C,B" means [BLANK_1]→choice_1 (A), [BLANK_2]→choice_3 (C), [BLANK_3]→choice_2 (B). Must have exactly ${blankCount} letters.
- "sub_category": one of: ${activeCats.join(", ")}
- "explanation": for each blank, state which tile goes there and why; then explain why the distractors are wrong
${VALIDATION_KEYS}

${isDragEla ? `ELA QUESTION FORMATS (choose varied types):
1. Transitional words: "The team practiced every day; [BLANK_1], they won the championship. Their success was [BLANK_2] to their hard work." → bank might include: therefore, attributed, however, dedication
2. Verb form pair: "By the time the bell rang, the students had [BLANK_1] their exams and [BLANK_2] their work quietly." → tiles: submitted, reviewed, submitting, reviewin
3. Vocabulary pair: "The [BLANK_1] scientist refused to accept the results without [BLANK_2] evidence." → tiles: skeptical, conclusive, enthusiastic, vague
4. Pronoun + verb: "Neither the teacher nor the students [BLANK_1] prepared when [BLANK_2] the pop quiz began." → tiles: were, they, was, it
All tiles must be the same part of speech (or logically grouped), with clear but plausible distractors.` : `MATH QUESTION FORMATS (choose varied types):
1. Two-step equation explanation: "To solve 3x + 6 = 15, first [BLANK_1] 6 from both sides to get 3x = 9, then [BLANK_2] both sides by 3." → tiles: subtract, divide, add, multiply
2. Formula fill-in: "The [BLANK_1] of a circle is π × r², while its [BLANK_2] is 2 × π × r." → tiles: area, circumference, diameter, radius
3. Word problem pair: "A store marks up items by 20%. If the original price is $50, the markup is $[BLANK_1] and the final price is $[BLANK_2]." → tiles: 10, 60, 5, 55 (answer A,B)
4. Definition pair: "A number divisible by both 2 and 5 must be divisible by [BLANK_1], which means its last digit must be [BLANK_2]." → tiles: 10, 0, 5, 2
All tiles must be numbers/operators/words of the same category; distractors are common mistakes.`}

RULES:
- Each blank position must accept exactly one tile unambiguously — no tile should fit two different blanks equally well
- answer field must have exactly ${blankCount} comma-separated letters
- The ${tokenCount - blankCount} distractor tile${tokenCount - blankCount !== 1 ? "s" : ""} must be plausible but clearly wrong in context
- Self-check: insert each correct tile into its blank and confirm the full sentence is coherent

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

${isDragEla
  ? `Example (2 blanks, 4 tiles): {"text":"The [BLANK_1] explorer ventured into uncharted territory; [BLANK_2], she mapped regions no one had seen before.","choice_1":"intrepid","choice_2":"consequently","choice_3":"timid","choice_4":"however","answer":"A,B","sub_category":"Vocabulary_in_Context","explanation":"[BLANK_1]: 'intrepid' (fearless) fits an explorer who ventured into uncharted territory; 'timid' is the opposite. [BLANK_2]: 'consequently' (as a result) logically connects venturing with mapping; 'however' signals contrast.","valid":true,"valid_note":""}`
  : `Example (2 blanks, 4 tiles): {"text":"To convert a fraction to a percent, [BLANK_1] the numerator by the denominator and then [BLANK_2] by 100.","choice_1":"divide","choice_2":"multiply","choice_3":"add","choice_4":"subtract","answer":"A,B","sub_category":"Arithmetic","explanation":"[BLANK_1]: dividing numerator by denominator gives the decimal form. [BLANK_2]: multiplying the decimal by 100 converts it to a percent. 'Add' and 'subtract' are incorrect operations here.","valid":true,"valid_note":""}`}`;
  }

  if (type === "drag_to_bin") {
    return `Generate exactly ${count} SHSAT-style math drag-to-bin classification questions for 7th–8th grade students.

In this question type, a pool of items (numbers, expressions, or math terms) is displayed. The student drags each item into one of the labeled bins. Every item must be placed — there are NO distractors. Every item has exactly one correct bin.

Difficulty: ${diff}

For each question return an object with EXACTLY these keys:
- "text": a short 1-sentence instruction like "Sort each number into the correct bin." or "Classify each expression." (the items and bins labels explain themselves — keep the text brief)
- "items": array of 4–6 strings — the values to be sorted (e.g. ["2","9","15","17","1"])
- "bins": array of 2–4 bin label strings (e.g. ["Prime","Composite","Neither"])
- "answer": comma-separated bin letters, one per item in items[] order. A=bins[0], B=bins[1], C=bins[2], D=bins[3]. Must have EXACTLY items.length letters — no dashes. Example: if items has 5 elements, answer must have 5 comma-separated letters like "A,B,B,A,C".
- "sub_category": one of: ${cats.join(", ")}
- "explanation": for each item in order, state its bin letter and one-line reason
${VALIDATION_KEYS}

CLASSIFICATION THEMES (rotate across generated questions):
1. Prime / Composite / Neither — 1 and 0 are Neither; e.g. items ["2","9","15","17","1"] → bins ["Prime","Composite","Neither"] → answer "A,B,B,A,C"
2. Even / Odd — parity of whole numbers or results of expressions
3. Positive / Negative / Zero — sign of numbers or simple expressions
4. Rational / Irrational — √4=rational, √2=irrational, π=irrational, 0.5=rational
5. Perfect Square / Not a Perfect Square — 1,4,9,16,25,36 are perfect squares
6. Multiples of N / Not Multiples of N — e.g. bins ["Multiple of 4","Not a Multiple of 4"]
7. Acute / Right / Obtuse — classify angle measures in degrees (e.g. "35°","90°","130°","180°")

RULES:
- Every item belongs to exactly one bin — no ambiguity
- Distribute items across bins roughly evenly (do not put all items in one bin)
- 4–6 total items; 2–4 bins
- Self-check: count items and count answer letters — they must match exactly

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Sort each number into the correct bin.","items":["2","9","15","17","1"],"bins":["Prime","Composite","Neither"],"answer":"A,B,B,A,C","sub_category":"Number_Properties","explanation":"2→A: only 1 and 2 divide it. 9→B: 3×3. 15→B: 3×5. 17→A: only 1 and 17 divide it. 1→C: by convention neither prime nor composite.","valid":true,"valid_note":""}`;
  }

  if (type === "drag_to_categorize") {
    const isDragCatEla = subject === "english";
    const elaDiff: Record<string, string> = {
      easy: "common grade-level vocabulary and clear grammatical categories most 7th-graders recognize",
      medium: "moderately advanced academic vocabulary with subtler categorization distinctions",
      hard: "sophisticated vocabulary with nuanced connotation or formality distinctions",
      mixed: "mix of easy, medium, and hard items within each question",
      "easy-medium": "half easy and half medium difficulty",
      "easy-hard": "half easy and half hard difficulty",
      "medium-hard": "half medium and half hard difficulty",
    };
    if (isDragCatEla) {
      const elaCats = categories.filter(c => ELA_SUBCATS.includes(c));
      const elaSubcats = elaCats.length > 0 ? elaCats : ELA_SUBCATS;
      return `Generate exactly ${count} SHSAT-style ELA drag-to-categorize questions for 7th–8th grade students. These are standalone vocabulary/grammar questions — NO reading passage required.

In this question type, a pool of words or phrases is shown. The student drags each word into the correct category column. Some words are distractors that do not belong to any category — those are left in the pool (answer = "-").

Difficulty: ${elaDiff[difficulty] ?? elaDiff.mixed}
Topics to use: ${elaSubcats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": a clear 1-sentence instruction, e.g. "Sort each word by its part of speech." or "Classify each word by connotation."
- "items": array of 5–7 words or short phrases
- "bins": array of 2–4 category label strings (e.g. ["Noun","Verb","Adjective"] or ["Positive","Negative","Neutral"])
- "answer": comma-separated values in items[] order — bin letter A/B/C/D for categorized items, "-" for distractors. Must have EXACTLY items.length values. Include 1–2 distractor items. Example for 6 items, 2 bins, 1 distractor: "A,B,A,-,B,A"
- "sub_category": one of: ${elaSubcats.join(", ")}
- "explanation": for each item, its bin letter (or "-") and a brief reason; for distractors explain why they don't fit
${VALIDATION_KEYS}

CATEGORY THEMES (rotate across questions):
1. Part of Speech: ["Noun","Verb","Adjective"] or ["Adjective","Adverb"] — use common academic words
2. Connotation: ["Positive","Negative","Neutral"] — e.g. generous→Positive, cunning→Negative, average→Neutral; distractors are words whose connotation is genuinely ambiguous in isolation
3. Formality: ["Formal","Informal"] — academic/literary words vs. casual/slang; distractors are technical jargon that doesn't clearly fit either register
4. Tense: ["Past Tense","Present Tense","Future Tense"] — sort verb forms; distractors are non-verb words
5. Synonym group: two groups of near-synonyms (e.g. ["Angry Words","Happy Words"]) with 1–2 outlier distractors
6. Prefix meaning: group words by shared prefix meaning (e.g. ["Re- (again)","Un- (not)"]) with 1–2 words that don't match either prefix

RULES:
- Include exactly 1–2 distractor items (answer = "-") per question
- Every non-distractor must unambiguously belong to exactly one bin
- Use words appropriate for 7th–8th grade — not obscure technical jargon
- Self-check: count items and count answer values — they must match exactly

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Sort each word by its connotation.","items":["generous","cunning","peaceful","sly","bold","mediocre"],"bins":["Positive","Negative","Neutral"],"answer":"A,B,A,B,A,C","sub_category":"Connotation_Tone","explanation":"generous(A): sharing freely — positive. cunning(B): crafty/manipulative — negative. peaceful(A): calm — positive. sly(B): sneaky — negative. bold(A): confident — positive. mediocre(C): average, neither good nor bad — neutral. No distractor this example.","valid":true,"valid_note":""}`;
    }

    // drag_to_categorize math
    return `Generate exactly ${count} SHSAT-style math drag-to-categorize questions for 7th–8th grade students.

In this question type, a pool of numbers or expressions is shown in columns. The student drags items into category columns. Some items are distractors that do not belong to any category — those stay in the pool (answer = "-").

Difficulty: ${diff}

For each question return an object with EXACTLY these keys:
- "text": a short 1-sentence instruction, e.g. "Categorize each number." or "Classify each expression."
- "items": array of 5–7 numbers, expressions, or terms — a mix of categorizable items and 1–2 distractors
- "bins": array of 2–4 category label strings (e.g. ["Rational","Irrational"] or ["Linear","Quadratic","Constant"])
- "answer": comma-separated values in items[] order — bin letter A/B/C/D for items that fit a category, "-" for distractors. Must have EXACTLY items.length values. Include 1–2 distractors. Example for 6 items, 2 bins, 1 distractor: "A,B,A,-,B,A"
- "sub_category": one of: ${cats.join(", ")}
- "explanation": for each item, its bin letter (or "-") and brief reason; for distractors explain why they don't fit any bin
${VALIDATION_KEYS}

CLASSIFICATION THEMES (rotate):
1. Rational / Irrational — distractors could be imaginary expressions like √(-1) or undefined forms like 0/0
2. Even / Odd integers — distractors are non-integers like 0.5 or √3
3. Multiples of 3 / Multiples of 5 / Neither — distractors are numbers that are multiples of both (e.g. 15) where "neither" is NOT a bin
4. Positive slope / Negative slope / Zero slope — sort linear equations (e.g. "y = 2x+1","y = -x","y = 4"); distractors are non-linear expressions
5. Monomials / Binomials / Trinomials — algebraic expressions; distractors have more terms or are numeric constants
6. Perfect squares / Non-perfect squares — distractors are fractions or decimals that make classification ambiguous

RULES:
- Include exactly 1–2 distractor items (answer = "-") per question
- Every non-distractor must belong to exactly one bin
- Distribute non-distractor items across bins (don't put all in one bin)
- 5–7 total items; 2–4 bins
- Self-check: count items and count answer values — they must match exactly

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Categorize each number as Rational or Irrational. Leave any item that does not apply.","items":["0.75","√3","4/5","π","2","0/0"],"bins":["Rational","Irrational"],"answer":"A,B,A,B,A,-","sub_category":"Number_Properties","explanation":"0.75(A): terminating decimal — rational. √3(B): non-repeating non-terminating — irrational. 4/5(A): fraction — rational. π(B): irrational. 2(A): integer — rational. 0/0(-): undefined — distractor.","valid":true,"valid_note":""}`;
  }

  if (type === "inline_text_span_click") {
    const elaDiff: Record<string, string> = {
      easy: "common grade-level vocabulary and clear, obvious grammatical errors that most 7th-graders would catch",
      medium: "moderately advanced vocabulary choices or subtle grammar errors requiring careful reading",
      hard: "sophisticated vocabulary distinctions or complex grammar violations that demand analytical attention",
      mixed: "mix of easy, medium, and hard difficulty levels",
      "easy-medium": "half easy and half medium difficulty",
      "easy-hard": "half easy and half hard difficulty",
      "medium-hard": "half medium and half hard difficulty",
    };
    const elaCats = categories.filter(c => ELA_SUBCATS.includes(c));
    const elaSubcats = elaCats.length > 0 ? elaCats : ELA_SUBCATS;
    return `Generate exactly ${count} SHSAT-style ELA inline-span-click questions for 7th–8th grade students. These are standalone questions — NO reading passage required.

In this question type, a sentence or short paragraph is displayed. Two to four specific words or phrases within the text are underlined and labeled A, B, C, D. The student clicks on the underlined span that is the answer. The spans are embedded in the passage using markers: [SPAN_A]word or phrase[/SPAN_A], [SPAN_B]...[/SPAN_B], etc.

Difficulty: ${elaDiff[difficulty] ?? elaDiff.mixed}
Topics to use: ${elaSubcats.join(", ")}

For each question return an object with EXACTLY these keys:
- "text": the question instruction, e.g. "Click on the underlined word or phrase that contains a grammatical error." or "Click on the underlined word that best fits the meaning of the sentence." (1–2 sentences max)
- "passage": the full sentence or paragraph with exactly 3–4 clickable spans marked using [SPAN_A]...[/SPAN_A], [SPAN_B]...[/SPAN_B], [SPAN_C]...[/SPAN_C], and optionally [SPAN_D]...[/SPAN_D]. The spans must be embedded naturally within the text. Spans must not overlap and must cover specific words or short phrases (not entire sentences).
- "answer": exactly one letter — "A", "B", "C", or "D" — identifying the correct span
- "sub_category": one of: ${elaSubcats.join(", ")}
- "explanation": identify which span is correct and why each other span is plausible but wrong
${VALIDATION_KEYS}

QUESTION THEME IDEAS (rotate across generated questions):
1. Grammar error: one span contains a subject-verb agreement error, wrong pronoun case, incorrect verb tense, or dangling modifier; others are grammatically fine
   Example: "The team of players [SPAN_A]were[/SPAN_A] exhausted after [SPAN_B]their[/SPAN_B] long practice." → answer A (should be "was" — team is singular)
2. Word choice / vocabulary: one span contains a word that is incorrect in context (wrong connotation, wrong register); others are appropriate
   Example: "The scientist [SPAN_A]meticulously[/SPAN_A] recorded every [SPAN_B]minute[/SPAN_B] detail in her [SPAN_C]incoherent[/SPAN_C] notes." → answer C (notes should be "meticulous" not "incoherent")
3. Best word replacement: the question asks "Which underlined word should be replaced to improve precision?" — one span is vague or imprecise, others are already precise
4. Redundancy: one span creates a redundancy (says the same thing twice); others add meaning
   Example: "The new innovation [SPAN_A]was[/SPAN_A] both [SPAN_B]creative and original[/SPAN_B] in [SPAN_C]its approach[/SPAN_C]." → answer B ("creative and original" is redundant with "new innovation")
5. Transition word error: one span uses a transition word that does not logically connect the ideas; others are logical
6. Apostrophe/possessive error: one span misuses or omits an apostrophe for possession

RULES:
- Each passage must be a complete, coherent sentence or short paragraph (2–3 sentences max)
- Exactly 3–4 [SPAN_X] markers; they must be balanced (not trivially easy to identify)
- All span text must be 1–5 words (short phrases, not full clauses)
- The wrong spans must be plausible distractors — they look like they could be errors but are actually correct
- Self-check: read the passage, confirm only one span is the answer, and verify the markers are balanced [SPAN_X]...[/SPAN_X]

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.

Example: {"text":"Click on the underlined word or phrase that contains a grammatical error.","passage":"Each of the students [SPAN_A]have[/SPAN_A] submitted [SPAN_B]their[/SPAN_B] report by the [SPAN_C]deadline[/SPAN_C].","answer":"A","sub_category":"Grammar_and_Usage","explanation":"A: 'have' should be 'has' — 'each' is a singular subject requiring a singular verb. B: 'their' correctly refers to students. C: 'deadline' is the right word here.","valid":true,"valid_note":""}`;
  }

  // MCQ (default)
  return `Generate exactly ${count} SHSAT-style math multiple-choice questions for 7th-8th grade students preparing for a specialized high school entrance exam.

Difficulty: ${diff}

For each question return an object with EXACTLY these keys:
- "text": the complete question text
- "choice_1": the text of answer choice A — plain text only, no letter prefix (e.g. "12" not "A) 12")
- "choice_2": the text of answer choice B — plain text only, no letter prefix
- "choice_3": the text of answer choice C — plain text only, no letter prefix
- "choice_4": the text of answer choice D — plain text only, no letter prefix
- "answer": exactly one letter — "A", "B", "C", or "D"
- "sub_category": one of: ${cats.join(", ")}
- "explanation": why the correct answer is right and why each wrong answer is a common mistake
${VALIDATION_KEYS}

RULES:
- Each wrong choice should represent a plausible student mistake (off-by-sign, unit error, wrong operation)
- Use concrete numbers; avoid variables as final answers in word problems
- Every question must have exactly one unambiguous correct answer
- Distribute sub_category evenly across the ${cats.length} available categories: do not repeat the same sub_category more than ${Math.ceil(count / cats.length)} times
- Questions must be solvable in under 90 seconds with pencil and paper
- Self-check: compute the answer yourself before committing to "answer"

Return ONLY a valid JSON array of ${count} objects. No markdown fences, no extra text.`;
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const body = await req.json();
    const type: string = body.type ?? "mcq";
    const count: number = Math.min(Math.max(parseInt(body.count ?? "10"), 1), 30);
    const rawChoiceCount = parseInt(body.choice_count ?? "5");
    const choiceCount: number = [4, 5, 6].includes(rawChoiceCount) ? rawChoiceCount : 5;
    const subject: string = body.subject === "english" ? "english" : "math";

    // Difficulty: accept new `difficulties[]` array or legacy single `difficulty` string
    const rawDiffs: string[] = Array.isArray(body.difficulties)
      ? (body.difficulties as string[]).filter((d: string) => ["easy", "medium", "hard"].includes(d))
      : [];
    if (rawDiffs.length === 0 && typeof body.difficulty === "string" && body.difficulty !== "mixed") {
      rawDiffs.push(body.difficulty as string);
    }
    const diffCycle = rawDiffs.length > 0 ? rawDiffs : ["easy", "medium", "hard"];
    // Build a key for the prompt description
    const diffKey = rawDiffs.length === 0 || rawDiffs.length === 3
      ? "mixed"
      : rawDiffs.length === 1
        ? rawDiffs[0]
        : [...rawDiffs].sort().join("-");

    // Categories: restrict subcategory selection; empty = all
    const validCatSet = new Set([...MATH_SUBCATS, ...ELA_SUBCATS]);
    const categories: string[] = Array.isArray(body.categories)
      ? (body.categories as string[]).filter((c: string) => validCatSet.has(c))
      : [];

    if (!["mcq", "grid-in", "linear_graphing", "multi-select", "expression", "inline-dropdown", "number_line_click", "table_row_radio", "drag_fill_single", "drag_fill_multiple", "drag_to_bin", "drag_to_categorize", "inline_text_span_click"].includes(type)) {
      return json({ error: "type must be one of: mcq, grid-in, linear_graphing, multi-select, expression, inline-dropdown, number_line_click, table_row_radio, drag_fill_single, drag_fill_multiple, drag_to_bin, drag_to_categorize, inline_text_span_click" }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    // ── Supabase client (needed for UID lookup and insert) ───────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Get next sequential UID number ───────────────────────────────────────
    const uidStart = await getNextUidStart(supabase);

    // ── Call Claude ──────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 16000,
        system:
          "You are an expert SHSAT question writer for math and ELA. You write clear, accurate, grade-appropriate questions. " +
          "After writing each question you verify your own work and include 'valid' and 'valid_note' fields. " +
          "Respond with valid JSON only — absolutely no markdown, no code fences, no extra text of any kind.",
        messages: [{ role: "user", content: buildPrompt(type, count, diffKey, choiceCount, categories, subject) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return json({ error: `Claude API error (${claudeRes.status}): ${err}` }, 502);
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text ?? "";

    // Strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let questions: GeneratedQuestion[];
    try {
      questions = JSON.parse(cleaned);
      if (!Array.isArray(questions)) throw new Error("Response is not a JSON array");
    } catch (e) {
      return json({ error: "Failed to parse Claude response", detail: String(e), raw: rawText.slice(0, 500) }, 500);
    }

    // ── Deduplicate against existing question bank ───────────────────────────
    const { data: existingRows } = await supabase
      .from("all_questions")
      .select("text");

    const existingTexts = new Set(
      (existingRows ?? []).map((r: { text: string }) => (r.text ?? "").trim().toLowerCase())
    );

    const uniqueQuestions = questions.filter(q => {
      const t = (q.text ?? "").trim().toLowerCase();
      return t && !existingTexts.has(t);
    });

    const duplicatesSkipped = questions.length - uniqueQuestions.length;

    // ── Build DB rows ────────────────────────────────────────────────────────
    const rows = uniqueQuestions.slice(0, count).map((q, i) => {
      // status: 'approved' if Claude validated it, 'pending' if it flagged a problem
      const status = q.valid === false ? "pending" : "approved";
      const isInlineDropdown = type === "inline-dropdown";
      const isDragFillSingle = type === "drag_fill_single";
      // Types where Claude always puts correct answer in choice_1 and choices need shuffling
      const needsShuffle = isInlineDropdown || isDragFillSingle || (subject === "english" && (type === "mcq" || type === "multi-select"));

      // For types that need shuffling: randomize choices so the correct answer isn't always A
      let c1 = q.choice_1?.trim() || null;
      let c2 = q.choice_2?.trim() || null;
      let c3 = q.choice_3?.trim() || null;
      let c4 = q.choice_4?.trim() || null;
      let answer = q.answer?.trim() ?? "";

      if (needsShuffle && c1 && c2 && c3 && c4) {
        const LETTERS = ["A", "B", "C", "D"];
        const choices = [c1, c2, c3, c4];
        const correctIdx = 0; // Claude always puts correct answer in choice_1 (index 0)
        let correctNewIdx = correctIdx;
        for (let j = choices.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [choices[j], choices[k]] = [choices[k], choices[j]];
          if (k === correctNewIdx) correctNewIdx = j;
          else if (j === correctNewIdx) correctNewIdx = k;
        }
        if (isInlineDropdown) {
          // inline-dropdown needs letter prefixes
          c1 = `A) ${choices[0]}`;
          c2 = `B) ${choices[1]}`;
          c3 = `C) ${choices[2]}`;
          c4 = `D) ${choices[3]}`;
          answer = LETTERS[correctNewIdx];
        } else {
          // drag_fill_single / ELA MCQ: plain text tiles, just update answer letter
          c1 = choices[0]; c2 = choices[1]; c3 = choices[2]; c4 = choices[3];
          answer = LETTERS[correctNewIdx];
        }
      }

      // drag_fill_multiple: Claude provides answer as "A,C,B" referencing its own tile order.
      // We keep tiles in their generated order (no shuffle) so the answer letters stay valid.
      // ELA multi-select: same — keep as-is.

      return {
        uid: makeUid(uidStart + i),
        type,
        subject: isInlineDropdown ? "english" : subject,
        sub_category:
          q.sub_category?.trim() ||
          (type === "linear_graphing" ? "Linear_Graphing"
           : isInlineDropdown ? "Vocabulary_in_Context"
           : subject === "english" ? "Vocabulary_in_Context"
           : type === "drag_fill_single" || type === "drag_fill_multiple" ? "Arithmetic"
           : type === "inline_text_span_click" ? "Grammar_and_Usage"
           : type === "drag_to_bin" || type === "drag_to_categorize" ? (subject === "english" ? "Vocabulary_in_Context" : "Number_Properties")
           : "Arithmetic"),
        difficulty: diffCycle[i % diffCycle.length],
        text: q.text?.trim() ?? "",
        choice_1: (type === "number_line_click" || type === "table_row_radio" || type === "drag_to_bin" || type === "drag_to_categorize" || type === "inline_text_span_click") ? null : c1,
        choice_2: (type === "number_line_click" || type === "table_row_radio" || type === "drag_to_bin" || type === "drag_to_categorize" || type === "inline_text_span_click") ? null : c2,
        choice_3: (type === "number_line_click" || type === "table_row_radio" || type === "drag_to_bin" || type === "drag_to_categorize" || type === "inline_text_span_click") ? null : c3,
        choice_4: (type === "number_line_click" || type === "table_row_radio" || type === "drag_to_bin" || type === "drag_to_categorize" || type === "inline_text_span_click") ? null : c4,
        answer,
        extra_data: type === "multi-select" ? {
          select_count: typeof q.select_count === "number" ? q.select_count : 2,
          ...(q.choice_5?.trim() ? { choice_5: q.choice_5.trim() } : {}),
          ...(q.choice_6?.trim() ? { choice_6: q.choice_6.trim() } : {}),
        } : type === "drag_fill_multiple" ? (() => {
          const ed: Record<string, unknown> = {};
          if (q.choice_5?.trim()) ed.choice_5 = q.choice_5.trim();
          if (q.choice_6?.trim()) ed.choice_6 = q.choice_6.trim();
          return Object.keys(ed).length > 0 ? ed : null;
        })() : type === "expression" ? {
          variables: Array.isArray(q.variables) ? q.variables.map(String).filter(Boolean) : [],
        } : type === "number_line_click" ? {
          min:  typeof q.nl_min  === "number" ? q.nl_min  : -10,
          max:  typeof q.nl_max  === "number" ? q.nl_max  : 10,
          step: typeof q.nl_step === "number" && q.nl_step > 0 ? q.nl_step : 1,
        } : type === "table_row_radio" ? {
          col_headers: Array.isArray(q.col_headers) ? q.col_headers.map(String) : [],
          rows:        Array.isArray(q.rows)        ? q.rows.map(String)        : [],
        } : (type === "drag_to_bin" || type === "drag_to_categorize") ? {
          items: Array.isArray(q.items) ? q.items.map(String).filter(Boolean) : [],
          bins:  Array.isArray(q.bins)  ? q.bins.map(String).filter(Boolean)  : [],
        } : type === "inline_text_span_click" ? {
          passage: typeof q.passage === "string" ? q.passage.trim() : "",
        } : null,
        media_refs: null,
        source: "ai",
        status,
      };
    }).filter((r) => {
      if (!r.text || !r.answer) return false;
      // For number_line_click: verify answer is a valid snap point within [min, max]
      if (r.type === "number_line_click" && r.extra_data) {
        const ed = r.extra_data as { min: number; max: number; step: number };
        const v = parseFloat(r.answer);
        if (!isFinite(v)) return false;
        if (v < ed.min - 0.0001 || v > ed.max + 0.0001) return false;
        const k = (v - ed.min) / ed.step;
        if (Math.abs(Math.round(k) - k) > 0.0001) return false;
      }
      // For table_row_radio: verify answer letter count matches row count
      if (r.type === "table_row_radio" && r.extra_data) {
        const ed = r.extra_data as { col_headers: string[]; rows: string[] };
        if (!ed.col_headers?.length || !ed.rows?.length) return false;
        const answerParts = r.answer.split(",").map(s => s.trim()).filter(Boolean);
        if (answerParts.length !== ed.rows.length) return false;
        const validLetters = ["A","B","C","D","E","F"].slice(0, ed.col_headers.length);
        if (!answerParts.every(l => validLetters.includes(l.toUpperCase()))) return false;
      }
      // For drag_to_bin: all items must be placed (no "-"), answer length must match items length
      if (r.type === "drag_to_bin" && r.extra_data) {
        const ed = r.extra_data as { items: string[]; bins: string[] };
        if (!ed.items?.length || !ed.bins?.length) return false;
        const answerParts = r.answer.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (answerParts.length !== ed.items.length) return false;
        const validLetters = ["A","B","C","D","E","F"].slice(0, ed.bins.length);
        if (!answerParts.every((l: string) => validLetters.includes(l.toUpperCase()))) return false;
      }
      // For inline_text_span_click: verify passage has at least 2 [SPAN_X] markers and answer is A-D
      if (r.type === "inline_text_span_click" && r.extra_data) {
        const ed = r.extra_data as { passage: string };
        if (!ed.passage?.trim()) return false;
        const spanCount = (ed.passage.match(/\[SPAN_[A-D]\]/g) ?? []).length;
        if (spanCount < 2) return false;
        if (!["A","B","C","D"].includes(r.answer.toUpperCase())) return false;
      }
      // For drag_to_categorize: "-" allowed for distractors, answer length must match items length
      if (r.type === "drag_to_categorize" && r.extra_data) {
        const ed = r.extra_data as { items: string[]; bins: string[] };
        if (!ed.items?.length || !ed.bins?.length) return false;
        const answerParts = r.answer.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (answerParts.length !== ed.items.length) return false;
        const validLetters = ["A","B","C","D","E","F"].slice(0, ed.bins.length);
        if (!answerParts.every((l: string) => l === "-" || validLetters.includes(l.toUpperCase()))) return false;
      }
      return true;
    }); // discard any empty or invalid rows Claude returned

    if (rows.length === 0) {
      return json({ error: "No valid questions parsed from Claude response", raw: rawText.slice(0, 500) }, 500);
    }

    // ── Insert into all_questions ────────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from("all_questions")
      .insert(rows)
      .select("uid, status");

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    const approvedCount = (inserted ?? []).filter((r: { status: string }) => r.status === "approved").length;
    const pendingCount = (inserted ?? []).filter((r: { status: string }) => r.status === "pending").length;

    return json({
      generated: inserted?.length ?? 0,
      approved: approvedCount,
      pending: pendingCount,
      duplicates_skipped: duplicatesSkipped,
      uids: inserted?.map((r: { uid: string }) => r.uid) ?? [],
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
