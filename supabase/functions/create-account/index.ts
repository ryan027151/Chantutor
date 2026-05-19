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

  try {
    const { email, password, firstName, lastName, code } = await req.json();

    if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim() || !code?.trim()) {
      return fail(400, "All fields are required.");
    }

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const studentCode  = Deno.env.get("STUDENT_CODE");
    const adminCode    = Deno.env.get("ADMIN_CODE");

    const db = createClient(supabaseUrl, serviceKey);

    let role: string | null = null;
    let linkedStudentId: string | null = null;

    if (code === studentCode) {
      role = "student";
    } else if (code === adminCode) {
      role = "admin";
    } else {
      // Treat the code as a student's email address — parent signup path
      const studentEmail = code.trim().toLowerCase();

      const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) throw listErr;

      const studentAuthUser = users.find(u => u.email?.toLowerCase() === studentEmail);
      if (!studentAuthUser) {
        return fail(400, "No student found with that email. Please double-check with the tutoring center.");
      }

      // Verify the found user is actually a student
      const { data: studentProfile } = await db
        .from("profiles")
        .select("role")
        .eq("id", studentAuthUser.id)
        .single();

      if (studentProfile?.role !== "student") {
        return fail(400, "That email does not belong to a registered student.");
      }

      // Enforce max 2 parents per student
      const { count: parentCount } = await db
        .from("student_parents")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentAuthUser.id);

      if ((parentCount ?? 0) >= 2) {
        return fail(400, "This student already has the maximum number of linked parent accounts.");
      }

      role = "parent";
      linkedStudentId = studentAuthUser.id;
    }

    // Create the auth user — email_confirm skips the verification email (private platform)
    const { data: newUserData, error: createErr } = await db.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      user_metadata: { first_name: firstName.trim(), last_name: lastName.trim(), role },
      email_confirm: true,
    });

    if (createErr) {
      return fail(400, createErr.message);
    }

    // Link parent → student in student_parents
    if (role === "parent" && linkedStudentId && newUserData.user) {
      const { error: linkErr } = await db
        .from("student_parents")
        .insert({ parent_id: newUserData.user.id, student_id: linkedStudentId });
      if (linkErr) {
        // Roll back: delete the just-created user so the DB stays consistent
        await db.auth.admin.deleteUser(newUserData.user.id);
        throw linkErr;
      }
    }

    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return fail(500, "Internal server error");
  }
});
