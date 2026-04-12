// Run this SQL once in your Supabase SQL Editor to set up the students table.
// This file is NOT executed at runtime.

/*
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_display_id VARCHAR(20) UNIQUE NOT NULL,
  grade INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
*/

module.exports = {};
