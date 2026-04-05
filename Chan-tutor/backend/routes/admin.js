const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { verifyToken, requireRole } = require("../middleware/auth");
const { getSchoolCode } = require("../utils/schoolCode");

// All routes require a valid token AND admin role
router.use(verifyToken, requireRole("admin"));

// ─── GET ALL USERS ──────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, email, role, created_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── GET ALL STUDENTS (with display IDs) ────────────────────────────────────
router.get("/students", async (req, res) => {
  // Supabase can join tables using select with relation syntax
  const { data, error } = await supabase
    .from("students")
    .select(
      `
      student_display_id,
      grade,
      created_at,
      users ( name, username )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Flatten the nested users object for cleaner response
  const formatted = data.map((s) => ({
    name: s.users?.name,
    username: s.users?.username,
    student_display_id: s.student_display_id,
    grade: s.grade,
    created_at: s.created_at,
  }));

  res.json(formatted);
});

// ─── DELETE A USER ──────────────────────────────────────────────────────────
router.delete("/users/:id", async (req, res) => {
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "User deleted." });
});

// ─── GET CURRENT SCHOOL CODE ─────────────────────────────────────────────────
router.get("/school-code", (req, res) => {
  res.json({ schoolCode: getSchoolCode() });
});

module.exports = router;
