const pool = require("../config/db");

const createStudentsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      student_display_id VARCHAR(20) UNIQUE NOT NULL,
      grade INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(query);
  console.log("✅ Students table ready");
};

// Generates IDs like SHS-00001, SHS-00002, etc.
const generateStudentDisplayId = async () => {
  const result = await pool.query("SELECT COUNT(*) FROM students");
  const count = parseInt(result.rows[0].count) + 1;
  return `SHS-${String(count).padStart(5, "0")}`;
};

module.exports = { createStudentsTable, generateStudentDisplayId };
