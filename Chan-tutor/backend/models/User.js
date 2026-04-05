const pool = require("../config/db");

const createUsersTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE,
      email VARCHAR(100) UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(10) CHECK (role IN ('admin', 'student', 'parent')) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  await pool.query(query);
  console.log("✅ Users table ready");
};

module.exports = { createUsersTable };
