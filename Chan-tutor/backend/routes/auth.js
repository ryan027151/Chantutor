const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");
const { getSchoolCode } = require("../utils/schoolCode");
const { isValidEmail } = require("../utils/validateEmail");
require("dotenv").config();

// ─── ADMIN SIGNUP ────────────────────────────────────────────────────────────
router.post("/signup/admin", async (req, res) => {
  const { name, username, email, password, bootstrapKey } = req.body;

  // Input validation
  if (!name || !username || !email || !password || !bootstrapKey) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ error: "Please enter a valid email address." });
  }
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

// ─── STUDENT SIGNUP ──────────────────────────────────────────────────────────
router.post("/signup/student", async (req, res) => {
  const { name, username, password, schoolCode, grade } = req.body;

  // Input validation
  if (!name || !username || !password || !schoolCode) {
    return res
      .status(400)
      .json({
        error: "Name, username, password, and school code are required.",
      });
  }
  if (username.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters." });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }
  if (schoolCode !== getSchoolCode()) {
    return res
      .status(400)
      .json({ error: "Invalid school code. Please check with your teacher." });
  }
  if (grade !== undefined && grade !== null && grade !== "") {
    const gradeNum = Number(grade);
    if (!Number.isInteger(gradeNum) || gradeNum < 1 || gradeNum > 12) {
      return res
        .status(400)
        .json({ error: "Grade must be a number between 1 and 12." });
    }
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
        return res
          .status(409)
          .json({ error: "Username already taken. Please choose another." });
      return res.status(500).json({ error: userError.message });
    }

    // Generate student display ID safely.
    // We fetch the current count and build SHS-XXXXX. The UNIQUE constraint on
    // student_display_id acts as a final safety net against any race collision.
    const { count, error: countError } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return res.status(500).json({ error: "Could not generate student ID." });
    }

    const studentDisplayId = `SHS-${String((count || 0) + 1).padStart(5, "0")}`;

    // Create student row
    const { error: studentError } = await supabase.from("students").insert([
      {
        user_id: userData.id,
        student_display_id: studentDisplayId,
        grade: grade ? Number(grade) : null,
      },
    ]);

    if (studentError) {
      // Clean up the orphaned user row if student creation failed
      await supabase.from("users").delete().eq("id", userData.id);
      return res
        .status(500)
        .json({ error: "Account setup failed. Please try again." });
    }

    res.status(201).json({
      message: "Student account created successfully!",
      // Students share this ID with their parent so they can link accounts
      studentId: studentDisplayId,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ─── PARENT SIGNUP ───────────────────────────────────────────────────────────
router.post("/signup/parent", async (req, res) => {
  const { name, email, password, studentId } = req.body;

  // Input validation — all moved before any DB calls
  if (!name || !email || !password || !studentId) {
    return res
      .status(400)
      .json({
        error:
          "Name, email, password, and your child's student ID are required.",
      });
  }
  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ error: "Please enter a valid email address." });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }

  try {
    // Verify the student ID exists before creating any account
    const { data: studentCheck, error: studentLookupError } = await supabase
      .from("students")
      .select("student_display_id")
      .eq("student_display_id", studentId)
      .single();

    if (studentLookupError || !studentCheck) {
      return res
        .status(404)
        .json({
          error: "Student ID not found. Please double-check your child's ID.",
        });
    }

    const hash = await bcrypt.hash(password, 10);

    // Create user row
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert([{ name, email, password_hash: hash, role: "parent" }])
      .select("id")
      .single();

    if (userError) {
      if (userError.code === "23505")
        return res
          .status(409)
          .json({ error: "This email is already registered." });
      return res.status(500).json({ error: userError.message });
    }

    // Link parent to student
    const { error: parentError } = await supabase
      .from("parents")
      .insert([{ user_id: userData.id, linked_student_display_id: studentId }]);

    if (parentError) {
      // Clean up the orphaned user row if linking failed
      await supabase.from("users").delete().eq("id", userData.id);
      return res
        .status(500)
        .json({ error: "Account setup failed. Please try again." });
    }

    res.status(201).json({
      message:
        "Parent account created. You're now linked to your child's account.",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error." });
  }
});

// ─── LOGIN (all roles) ───────────────────────────────────────────────────────
// Students log in with username; parents log in with email.
// We detect which one was sent and query accordingly — this avoids the
// broken .or("username.eq.undefined,...") bug from querying both at once.
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  // "identifier" is whatever the user typed — username OR email.
  // The frontend should send a single field called "identifier".

  if (!identifier || !password) {
    return res
      .status(400)
      .json({
        error: "Please enter your username or email and your password.",
      });
  }

  try {
    // Decide whether it's an email or a username
    const isEmail = isValidEmail(identifier);

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq(isEmail ? "email" : "username", identifier)
      .single();

    if (error || !user) {
      // Use a vague message intentionally — don't reveal whether it's the
      // identifier or the password that's wrong (security best practice)
      return res
        .status(401)
        .json({ error: "Incorrect username/email or password." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ error: "Incorrect username/email or password." });
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
