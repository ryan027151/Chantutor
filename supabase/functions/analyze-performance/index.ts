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

    const [{ data: testData }, { data: qData }] = await Promise.all([
      db.from("tests").select("test_name, total_questions, configuration").eq("id", test_id).single(),
      db.from("questions").select("order_index, is_correct").eq("test_id", test_id).eq("user_id", user_id),
    ]);

    if (!testData || !qData) {
      return new Response(JSON.stringify({ error: "Data not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const englishCount: number = testData.configuration?.english?.count ?? Math.floor(testData.total_questions / 2);
    const mathCount: number = testData.configuration?.math?.count ?? Math.ceil(testData.total_questions / 2);

    const englishQs = qData.filter((q: { order_index: number }) => q.order_index < englishCount);
    const mathQs = qData.filter((q: { order_index: number }) => q.order_index >= englishCount);

    const totalAnswered = qData.length;
    const totalCorrect = qData.filter((q: { is_correct: boolean }) => q.is_correct === true).length;
    const engCorrect = englishQs.filter((q: { is_correct: boolean }) => q.is_correct === true).length;
    const mathCorrect = mathQs.filter((q: { is_correct: boolean }) => q.is_correct === true).length;

    const stats = {
      test_name: testData.test_name,
      total_questions: testData.total_questions,
      total_answered: totalAnswered,
      total_correct: totalCorrect,
      overall_pct: Math.round((totalCorrect / testData.total_questions) * 100),
      english: { total: englishCount, answered: englishQs.length, correct: engCorrect, pct: Math.round((engCorrect / englishCount) * 100) },
      math: { total: mathCount, answered: mathQs.length, correct: mathCorrect, pct: Math.round((mathCorrect / mathCount) * 100) },
    };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: 600,
        system: "You are an expert SHSAT tutor. Be concise, specific, and encouraging. Always respond with valid JSON only — no markdown fences, no extra text.",
        messages: [
          {
            role: "user",
            content: `A student just finished an SHSAT practice test. Here are their results:\n${JSON.stringify(stats, null, 2)}\n\nBased on this data, respond ONLY with a JSON object with exactly these three keys:\n{\n  "strengths": ["...", "...", "..."],\n  "improvements": ["...", "...", "..."],\n  "recommendations": ["...", "...", "..."]\n}\nEach array must have exactly 3 short, specific, actionable strings (1–2 sentences each). No markdown.`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
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
