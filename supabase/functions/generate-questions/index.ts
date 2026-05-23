// supabase/functions/generate-questions/index.ts
// POST { type: "mcq" | "grid-in" | "linear_graphing", count: number, difficulty: "easy"|"medium"|"hard"|"mixed" }
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

function buildPrompt(type: string, count: number, difficulty: string): string {
  const diffDesc: Record<string, string> = {
    easy: "single-step computation, basic concepts, direct application of one rule",
    medium: "multi-step problems requiring 2-3 operations, moderate algebra or geometry",
    hard: "complex multi-step reasoning, non-obvious algebraic manipulation, challenging word problems",
    mixed: "one-third easy (basic), one-third medium (multi-step), one-third hard (complex)",
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
- "sub_category": one of: ${MATH_SUBCATS.join(", ")}
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
- "sub_category": one of: ${MATH_SUBCATS.join(", ")}
- "explanation": why the correct answer is right and why each wrong answer is a common mistake
${VALIDATION_KEYS}

RULES:
- Each wrong choice should represent a plausible student mistake (off-by-sign, unit error, wrong operation)
- Use concrete numbers; avoid variables as final answers in word problems
- Every question must have exactly one unambiguous correct answer
- Distribute sub_category evenly across all 12 categories: do not repeat the same sub_category more than ${Math.ceil(count / 12)} times
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
    const difficulty: string = body.difficulty ?? "mixed";

    if (!["mcq", "grid-in", "linear_graphing"].includes(type)) {
      return json({ error: "type must be mcq, grid-in, or linear_graphing" }, 400);
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
        model: "claude-opus-4-7",
        max_tokens: 16000,
        system:
          "You are an expert SHSAT math question writer. You write clear, accurate, grade-appropriate questions. " +
          "After writing each question you verify your own work and include 'valid' and 'valid_note' fields. " +
          "Respond with valid JSON only — absolutely no markdown, no code fences, no extra text of any kind.",
        messages: [{ role: "user", content: buildPrompt(type, count, difficulty) }],
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
    const difficulties = ["easy", "medium", "hard"];

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
        difficulty:
          difficulty === "mixed"
            ? difficulties[i % 3]
            : difficulty,
        text: q.text?.trim() ?? "",
        choice_1: q.choice_1?.trim() || null,
        choice_2: q.choice_2?.trim() || null,
        choice_3: q.choice_3?.trim() || null,
        choice_4: q.choice_4?.trim() || null,
        answer: q.answer?.trim() ?? "",
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
