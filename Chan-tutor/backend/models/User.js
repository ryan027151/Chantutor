// Run this SQL once in your Supabase SQL Editor to set up the users table.
// This file is NOT executed at runtime.

/*
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) UNIQUE,
  email VARCHAR(100) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) CHECK (role IN ('admin', 'student', 'parent')) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
*/

module.exports = {};
