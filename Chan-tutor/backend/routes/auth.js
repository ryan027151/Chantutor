const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");
const { getSchoolCode } = require("../utils/schoolCode");
const { isValidEmail } = require("../utils/validateEmail");
require("dotenv").config();

// ─── ADMIN SIGNUP ───────────────────────────────────────────────────────────
router.post("/signup/admin", async (req, res) => {
  const { name, username, email, password, bootstrapKey } = req.body;

  if (bootstrapKey !== process.env.ADMIN_BOOTSTRAP_KEY) {
    return res.status(403).json({ error: "Invalid bootstrap key." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ name, username, email, password_hash: hash, role: "admin" }])
      .select("id, name, role")
      .single();

    if (error) {
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "Username or email already exists." });
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Admin account created.", user: data });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ─── STUDENT SIGNUP ─────────────────────────────────────────────────────────
router.post("/signup/student", async (req, res) => {
  const { name, username, password, schoolCode, grade } = req.body;

  if (schoolCode !== getSchoolCode()) {
    return res
      .status(400)
      .json({ error: "Invalid school code. Please check with your teacher." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    // Create user row
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert([{ name, username, password_hash: hash, role: "student" }])
      .select("id")
      .single();

    if (userError) {
      if (userError.code === "23505")
        return res.status(409).json({ error: "Username already taken." });
      return res.status(500).json({ error: userError.message });
    }

    // Generate student display ID (e.g. SHS-00042)
    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true });

    const studentDisplayId = `SHS-${String((count || 0) + 1).padStart(5, "0")}`;

    // Create student row
    const { error: studentError } = await supabase.from("students").insert([
      {
        user_id: userData.id,
        student_display_id: studentDisplayId,
        grade: grade || null,
      },
    ]);

    if (studentError)
      return res.status(500).json({ error: studentError.message });

    res.status(201).json({
      message: "Student account created successfully!",
      studentId: studentDisplayId, // Student shares this with their parent
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ─── PARENT SIGNUP ──────────────────────────────────────────────────────────
router.post("/signup/parent", async (req, res) => {
  const { name, email, password, studentId } = req.body;

  // Check that the student ID actually exists
  const { data: studentCheck, error: studentLookupError } = await supabase
    .from("students")
    .select("student_display_id")
    .eq("student_display_id", studentId)
    .single();

  if (studentLookupError || !studentCheck) {
    return res
      .status(404)
      .json({ error: "Student ID not found. Please check your child's ID." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    // Create user row
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert([{ name, email, password_hash: hash, role: "parent" }])
      .select("id")
      .single();

    if (userError) {
      if (userError.code === "23505")
        return res.status(409).json({ error: "Email already registered." });
      return res.status(500).json({ error: userError.message });
    }

    // Link parent to student
    const { error: parentError } = await supabase
      .from("parents")
      .insert([{ user_id: userData.id, linked_student_display_id: studentId }]);

    if (parentError)
      return res.status(500).json({ error: parentError.message });

    res.status(201).json({
      message:
        "Parent account created. You're now linked to your child's account.",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ─── LOGIN (all roles) ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Try matching by username OR email
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .or(`username.eq.${username},email.eq.${email}`)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "Account not found." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: `Welcome back, ${user.name}!`,
      token,
      role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
