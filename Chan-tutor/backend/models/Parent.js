// Run this SQL once in your Supabase SQL Editor to set up the parents table.
// This file is NOT executed at runtime.

/*
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  linked_student_display_id VARCHAR(20) REFERENCES students(student_display_id),
  created_at TIMESTAMP DEFAULT NOW()
);
*/

module.exports = {};
