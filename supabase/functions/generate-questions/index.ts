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

function buildPrompt(type: string, count: number, difficulty: string, choiceCount = 5, categories: string[] = MATH_SUBCATS): string {
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
    const validCatSet = new Set(MATH_SUBCATS);
    const categories: string[] = Array.isArray(body.categories)
      ? (body.categories as string[]).filter((c: string) => validCatSet.has(c))
      : [];

    if (!["mcq", "grid-in", "linear_graphing", "multi-select", "expression"].includes(type)) {
      return json({ error: "type must be mcq, grid-in, linear_graphing, multi-select, or expression" }, 400);
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
        model: "claude-opus-4-8",
        max_tokens: 16000,
        system:
          "You are an expert SHSAT math question writer. You write clear, accurate, grade-appropriate questions. " +
          "After writing each question you verify your own work and include 'valid' and 'valid_note' fields. " +
          "Respond with valid JSON only — absolutely no markdown, no code fences, no extra text of any kind.",
        messages: [{ role: "user", content: buildPrompt(type, count, diffKey, choiceCount, categories) }],
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
      return {
        uid: makeUid(uidStart + i),
        type,
        subject: "math",
        sub_category:
          q.sub_category?.trim() ||
          (type === "linear_graphing" ? "Linear_Graphing" : "Arithmetic"),
        difficulty: diffCycle[i % diffCycle.length],
        text: q.text?.trim() ?? "",
        choice_1: q.choice_1?.trim() || null,
        choice_2: q.choice_2?.trim() || null,
        choice_3: q.choice_3?.trim() || null,
        choice_4: q.choice_4?.trim() || null,
        answer: q.answer?.trim() ?? "",
        extra_data: type === "multi-select" ? {
          select_count: typeof q.select_count === "number" ? q.select_count : 2,
          ...(q.choice_5?.trim() ? { choice_5: q.choice_5.trim() } : {}),
          ...(q.choice_6?.trim() ? { choice_6: q.choice_6.trim() } : {}),
        } : type === "expression" ? {
          variables: Array.isArray(q.variables) ? q.variables.map(String).filter(Boolean) : [],
        } : null,
        media_refs: null,
        source: "ai",
        status,
      };
    }).filter((r) => r.text && r.answer); // discard any empty rows Claude returned

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
