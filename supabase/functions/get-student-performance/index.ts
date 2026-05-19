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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id } = await req.json();
    if (!student_id) {
      return new Response(JSON.stringify({ error: "Missing student_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Privileged client — bypasses RLS (only after auth verified above)
    const db = createClient(supabaseUrl, serviceKey);

    // Authorization: admin, linked parent, or student themselves
    const { data: callerProfile } = await db
      .from("profiles").select("role").eq("id", caller.id).single();
    const isAdmin = callerProfile?.role === "admin";

    if (!isAdmin && caller.id !== student_id) {
      const { data: parentLink } = await db
        .from("student_parents").select("id")
        .eq("parent_id", caller.id).eq("student_id", student_id).maybeSingle();
      if (!parentLink) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch questions and tests in parallel
    const [{ data: rawQs }, { data: tests }] = await Promise.all([
      db.from("questions")
        .select("id, test_id, is_correct, time_spent")
        .eq("user_id", student_id)
        .not("is_correct", "is", null),
      db.from("tests")
        .select("id, user_id, test_name, created_at, duration, score, total_questions, configuration")
        .eq("user_id", student_id)
        .not("score", "is", null)
        .order("created_at", { ascending: true }),
    ]);

    if (!rawQs?.length) {
      return new Response(JSON.stringify({ questions: [], tests: tests ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Join with all_questions for metadata
    const ids = [...new Set(rawQs.map((q) => q.id))];
    const { data: meta } = await db
      .from("all_questions")
      .select("uid, sub_category, subject, difficulty")
      .in("uid", ids);
    const metaMap = new Map((meta ?? []).map((m) => [m.uid, m]));

    const questions = rawQs.map((q) => ({
      id: q.id,
      test_id: q.test_id,
      is_correct: q.is_correct,
      time_spent: q.time_spent ?? null,
      ...(metaMap.get(q.id) ?? { sub_category: null, subject: null, difficulty: null }),
    }));

    return new Response(JSON.stringify({ questions, tests: tests ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
