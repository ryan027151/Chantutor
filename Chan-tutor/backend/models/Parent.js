const pool = require("../config/db");

const createParentsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS parents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      linked_student_display_id VARCHAR(20) REFERENCES students(student_display_id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(query);
  console.log("✅ Parents table ready");
};

module.exports = { createParentsTable };
