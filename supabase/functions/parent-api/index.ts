import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // ── Authenticate the caller via JWT ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail(401, "Unauthorized");

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return fail(401, "Invalid or expired token");

    // Privileged client — only used after ownership checks below
    const db = createClient(supabaseUrl, serviceKey);

    // Verify caller is a parent
    const { data: callerProfile } = await db
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (callerProfile?.role !== "parent") {
      return fail(403, "Access restricted to parent accounts");
    }

    const body = await req.json();
    const { action } = body;

    // ── GET_STUDENTS ─────────────────────────────────────────────────────────
    // Returns all students linked to this parent with basic test stats
    if (action === "get_students") {
      const { data: links } = await db
        .from("student_parents")
        .select("student_id")
        .eq("parent_id", caller.id);

      if (!links || links.length === 0) return ok({ students: [] });

      const studentIds = links.map((l: { student_id: string }) => l.student_id);
      const [{ data: profiles }, { data: tutorLinks }] = await Promise.all([
        db.from("profiles").select("id, first_name, last_name").in("id", studentIds),
        db.from("student_tutors").select("student_id, tutor_id").in("student_id", studentIds),
      ]);

      // Resolve tutor names
      const tutorIds = [...new Set((tutorLinks ?? []).map((l: { tutor_id: string }) => l.tutor_id))];
      const { data: tutorProfiles } = tutorIds.length > 0
        ? await db.from("profiles").select("id, first_name, last_name").in("id", tutorIds)
        : { data: [] as { id: string; first_name: string; last_name: string }[] };

      const tutorMap: Record<string, { id: string; first_name: string; last_name: string }> = {};
      for (const t of tutorProfiles ?? []) tutorMap[t.id] = t;

      const tutorsByStudent: Record<string, { id: string; first_name: string; last_name: string }[]> = {};
      for (const link of (tutorLinks ?? []) as { student_id: string; tutor_id: string }[]) {
        if (!tutorsByStudent[link.student_id]) tutorsByStudent[link.student_id] = [];
        const t = tutorMap[link.tutor_id];
        if (t) tutorsByStudent[link.student_id].push(t);
      }

      return ok({ students: (profiles ?? []).map(p => ({ ...p, tutors: tutorsByStudent[p.id] ?? [] })) });
    }

    // ── GET_TESTS ────────────────────────────────────────────────────────────
    // Returns all tests for a linked student
    if (action === "get_tests") {
      const { student_id } = body;
      if (!student_id) return fail(400, "Missing student_id");

      // Ownership check
      const { data: link } = await db
        .from("student_parents")
        .select("id")
        .eq("parent_id", caller.id)
        .eq("student_id", student_id)
        .maybeSingle();
      if (!link) return fail(403, "Not linked to this student");

      const { data: tests } = await db
        .from("tests")
        .select("id, test_name, created_at, score, total_questions, duration, configuration")
        .eq("user_id", student_id)
        .order("created_at", { ascending: false });

      return ok({ tests: tests ?? [] });
    }

    // ── GET_TEST_RESULTS ─────────────────────────────────────────────────────
    // Returns full result data for the parent results view
    if (action === "get_test_results") {
      const { student_id, test_id } = body;
      if (!student_id || !test_id) return fail(400, "Missing student_id or test_id");

      // Ownership check
      const { data: link } = await db
        .from("student_parents")
        .select("id")
        .eq("parent_id", caller.id)
        .eq("student_id", student_id)
        .maybeSingle();
      if (!link) return fail(403, "Not linked to this student");

      // Fetch test metadata
      const { data: test } = await db
        .from("tests")
        .select("test_name, created_at, total_questions, configuration")
        .eq("id", test_id)
        .eq("user_id", student_id)
        .single();
      if (!test) return fail(404, "Test not found");

      // Fetch answered questions
      const { data: qData } = await db
        .from("questions")
        .select("id, order_index, is_correct, student_answer")
        .eq("test_id", test_id)
        .eq("user_id", student_id)
        .order("order_index");

      const questionIds = (qData ?? []).map((q: { id: string }) => q.id).filter(Boolean);

      // Enrich with difficulty / subcategory from the question bank
      type QDetail = { uid: string; difficulty: string; sub_category: string; subject: string };
      let details: QDetail[] = [];
      if (questionIds.length > 0) {
        const { data } = await db
          .from("all_questions")
          .select("uid, difficulty, sub_category, subject")
          .in("uid", questionIds);
        details = (data ?? []) as QDetail[];
      }

      const detailMap: Record<string, QDetail> = Object.fromEntries(details.map(d => [d.uid, d]));

      type AnsweredQ = { id: string; order_index: number; is_correct: boolean | null; student_answer: string | null };
      const questions = (qData as AnsweredQ[] ?? []).map(q => ({
        id:             q.id,
        order_index:    q.order_index,
        is_correct:     q.is_correct,
        student_answer: q.student_answer ?? null,
        difficulty:     detailMap[q.id]?.difficulty   ?? "medium",
        sub_category:   detailMap[q.id]?.sub_category ?? null,
        subject:        detailMap[q.id]?.subject       ?? null,
      }));

      return ok({ test, questions });
    }

    // ── LINK_STUDENT ─────────────────────────────────────────────────────────
    // Verifies a student email and creates a new student_parents row
    if (action === "link_student") {
      const { student_email } = body;
      if (!student_email?.trim()) return fail(400, "Student email is required");

      const targetEmail = student_email.trim().toLowerCase();

      // Look up auth user by email
      const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) throw listErr;

      const studentAuthUser = users.find(u => u.email?.toLowerCase() === targetEmail);
      if (!studentAuthUser) {
        return fail(400, "No student found with that email address.");
      }

      // Verify they are a student
      const { data: studentProfile } = await db
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("id", studentAuthUser.id)
        .single();

      if (studentProfile?.role !== "student") {
        return fail(400, "That email does not belong to a registered student.");
      }

      // Not already linked?
      const { data: existingLink } = await db
        .from("student_parents")
        .select("id")
        .eq("parent_id", caller.id)
        .eq("student_id", studentAuthUser.id)
        .maybeSingle();
      if (existingLink) return fail(400, "You are already linked to this student.");

      // Enforce max 2 parents per student
      const { count: parentCount } = await db
        .from("student_parents")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentAuthUser.id);
      if ((parentCount ?? 0) >= 2) {
        return fail(400, "This student already has the maximum number of linked parents (2).");
      }

      await db.from("student_parents").insert({
        parent_id:  caller.id,
        student_id: studentAuthUser.id,
      });

      return ok({
        student: {
          id:         studentProfile.id,
          first_name: studentProfile.first_name,
          last_name:  studentProfile.last_name,
        },
      });
    }

    // ── UNLINK_STUDENT ───────────────────────────────────────────────────────
    // Removes a student link — parent must retain at least one
    if (action === "unlink_student") {
      const { student_id } = body;
      if (!student_id) return fail(400, "Missing student_id");

      // Enforce minimum 1 linked student
      const { count: studentCount } = await db
        .from("student_parents")
        .select("*", { count: "exact", head: true })
        .eq("parent_id", caller.id);
      if ((studentCount ?? 0) <= 1) {
        return fail(400, "You must remain linked to at least one student.");
      }

      // Verify the link exists before deleting
      const { data: link } = await db
        .from("student_parents")
        .select("id")
        .eq("parent_id", caller.id)
        .eq("student_id", student_id)
        .maybeSingle();
      if (!link) return fail(404, "Student link not found.");

      await db.from("student_parents")
        .delete()
        .eq("parent_id", caller.id)
        .eq("student_id", student_id);

      return ok({ success: true });
    }

    // ── GET_ASSIGNMENTS ──────────────────────────────────────────────────────
    // Returns all assignments for a linked student with test score
    if (action === "get_assignments") {
      const { student_id } = body;
      if (!student_id) return fail(400, "Missing student_id");

      // Ownership check
      const { data: link } = await db
        .from("student_parents")
        .select("id")
        .eq("parent_id", caller.id)
        .eq("student_id", student_id)
        .maybeSingle();
      if (!link) return fail(403, "Not linked to this student");

      const { data: rawAssignments } = await db
        .from("assignments")
        .select("id, test_type, num_questions, difficulties, categories, due_date, duration_minutes, note, status, test_id, created_at, assigned_by, tests(score)")
        .eq("student_id", student_id)
        .order("created_at", { ascending: false });

      // Fetch assigner names (service role bypasses RLS)
      const assignerIds = [...new Set((rawAssignments ?? []).map(a => a.assigned_by).filter(Boolean))];
      let assignerMap: Record<string, string> = {};
      if (assignerIds.length > 0) {
        const { data: assigners } = await db
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", assignerIds);
        for (const p of assigners ?? []) {
          assignerMap[p.id] = `${p.first_name} ${p.last_name}`;
        }
      }

      const assignments = (rawAssignments ?? []).map(a => ({
        ...a,
        assigner_name: a.assigned_by ? (assignerMap[a.assigned_by] ?? null) : null,
      }));

      return ok({ assignments });
    }

    return fail(400, "Unknown action");
  } catch (e) {
    console.error(e);
    return fail(500, "Internal server error");
  }
});
