import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { test_id, user_id } = await req.json();
    if (!test_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing test_id or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    const db = createClient(supabaseUrl, serviceKey);

    // Fetch test metadata and all answered questions in parallel
    const [{ data: testData }, { data: qData }] = await Promise.all([
      db.from("tests").select("test_name, total_questions, configuration").eq("id", test_id).single(),
      // Select * so missing columns (e.g. time_spent before migration) don't crash the query
      db.from("questions")
        .select("*")
        .eq("test_id", test_id)
        .eq("user_id", user_id)
        .order("order_index"),
    ]);

    if (!testData || !qData) {
      return new Response(JSON.stringify({ error: "Data not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full question details for every answered question
    type AnsweredQ = { order_index: number; is_correct: boolean | null; student_answer: string; id: string; time_spent: number | null };
    type QuestionDetail = { uid: string; text: string; answer: string; sub_category: string; subject: string; difficulty: string };

    const questionIds = (qData as AnsweredQ[]).map(q => q.id).filter(Boolean);
    let questionDetails: QuestionDetail[] = [];
    if (questionIds.length > 0) {
      const { data } = await db
        .from("all_questions")
        .select("uid, text, answer, sub_category, subject, difficulty")
        .in("uid", questionIds);
      questionDetails = (data ?? []) as QuestionDetail[];
    }

    const detailMap = Object.fromEntries(questionDetails.map(q => [q.uid, q]));

    const englishCount: number =
      testData.configuration?.english?.count ?? Math.floor(testData.total_questions / 2);

    // Build a rich per-question record
    const perQuestion = (qData as AnsweredQ[]).map(q => {
      const d = detailMap[q.id];
      return {
        question_number: q.order_index,
        subject: d?.subject ?? (q.order_index <= englishCount ? "english" : "math"),  // fallback when all_questions row missing
        sub_category: d?.sub_category ?? "General",
        student_answer: q.student_answer ?? null,
        correct_answer: d?.answer ?? null,
        is_correct: q.is_correct,
        time_spent_seconds: q.time_spent ?? null,
        difficulty: d?.difficulty ?? null,
      };
    });

    // Subcategory breakdown (worst performing first)
    const subCatMap: Record<string, { total: number; correct: number; subject: string }> = {};
    for (const q of perQuestion) {
      const cat = q.sub_category || "General";
      if (!subCatMap[cat]) subCatMap[cat] = { total: 0, correct: 0, subject: q.subject };
      subCatMap[cat].total++;
      if (q.is_correct) subCatMap[cat].correct++;
    }
    const subcategoryPerformance = Object.entries(subCatMap)
      .map(([name, s]) => ({
        name,
        subject: s.subject,
        correct: s.correct,
        total: s.total,
        pct: Math.round((s.correct / s.total) * 100),
      }))
      .sort((a, b) => a.pct - b.pct);

    // Timing analysis (only if time_spent data exists)
    const timedQs = perQuestion.filter(q => q.time_spent_seconds !== null);
    const avgTime = timedQs.length > 0
      ? Math.round(timedQs.reduce((s, q) => s + (q.time_spent_seconds ?? 0), 0) / timedQs.length)
      : null;

    const timingInsights = avgTime !== null ? {
      average_seconds_per_question: avgTime,
      slow_questions: timedQs
        .filter(q => (q.time_spent_seconds ?? 0) > avgTime * 2)
        .map(q => ({ question_number: q.question_number, seconds: q.time_spent_seconds, sub_category: q.sub_category })),
      rushed_wrong_questions: timedQs
        .filter(q => !q.is_correct && (q.time_spent_seconds ?? 999) < avgTime * 0.4)
        .map(q => ({ question_number: q.question_number, seconds: q.time_spent_seconds, sub_category: q.sub_category })),
    } : null;

    // Wrong answer detail for targeted feedback
    const wrongAnswers = perQuestion
      .filter(q => q.is_correct === false)
      .map(q => ({
        question_number: q.question_number,
        sub_category: q.sub_category,
        student_answered: q.student_answer,
        correct_answer: q.correct_answer,
        time_seconds: q.time_spent_seconds,
      }));

    // Overall stats
    const englishQs = perQuestion.filter(q => q.subject === "english");
    const mathQs = perQuestion.filter(q => q.subject === "math");
    const engCorrect = englishQs.filter(q => q.is_correct === true).length;
    const mathCorrect = mathQs.filter(q => q.is_correct === true).length;
    const totalCorrect = perQuestion.filter(q => q.is_correct === true).length;

    const payload = {
      test_name: testData.test_name,
      total_questions: testData.total_questions,
      total_answered: perQuestion.length,
      overall_score_pct: Math.round((totalCorrect / testData.total_questions) * 100),
      english: {
        total: englishCount,
        answered: englishQs.length,
        correct: engCorrect,
        pct: englishQs.length > 0 ? Math.round((engCorrect / englishQs.length) * 100) : 0,
      },
      math: {
        total: testData.total_questions - englishCount,
        answered: mathQs.length,
        correct: mathCorrect,
        pct: mathQs.length > 0 ? Math.round((mathCorrect / mathQs.length) * 100) : 0,
      },
      subcategory_performance: subcategoryPerformance,
      wrong_answers: wrongAnswers,
      timing: timingInsights,
    };

    const systemPrompt = `You are a caring, experienced high school teacher who helps 8th-graders prepare for the SHSAT. You know every student is different and you tailor your feedback to exactly what they did — not generic advice. Write the way a real teacher talks: warm, clear, and direct. No jargon, no buzzwords. A student reading this should immediately know what they did well, exactly where they struggled, and exactly what to do next.

Always respond with valid JSON only. No markdown fences. No text outside the JSON.`;

    const userPrompt = `Here is a student's full performance breakdown from an SHSAT practice test. Analyze it carefully and give specific, personal feedback.

${JSON.stringify(payload, null, 2)}

Instructions for your analysis:
- Name the specific subcategories or topics the student struggled with — don't say "some math topics," say the actual names from the data.
- If the wrong_answers list shows a pattern (e.g., student kept picking the same letter, or got a specific topic wrong multiple times), call it out directly.
- If timing data is available: flag questions where the student was unusually slow (may indicate confusion) or answered too quickly but got it wrong (may indicate rushing or guessing).
- Be honest but kind. If a student scored 40%, don't sugarcoat it — tell them what they need to work on while keeping them motivated.
- Speak directly to the student, not about them.

Respond ONLY with this JSON structure:
{
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."]
}

Rules:
- 3 to 5 items per array.
- Each item: 2–3 sentences, specific to THIS student's actual data. Reference subcategory names, question numbers, or answer patterns when relevant.
- Plain language. No jargon. Write for a motivated 8th-grader.
- No markdown inside strings. No bullet characters. Plain prose only.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errBody);
      throw new Error(`Claude API error: ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData.content?.[0]?.text ?? "{}";

    let analysis: { strengths: string[]; improvements: string[]; recommendations: string[] };
    try {
      analysis = JSON.parse(rawText);
    } catch {
      throw new Error("Failed to parse Claude response as JSON");
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
