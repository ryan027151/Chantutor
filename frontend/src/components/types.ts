export interface User{
    first_name : string,
    last_name : string,
    id: string,
    role: string
}

export interface MediaItem {
    media_id: string;
    media_type: "passage" | "graph" | "table" | "equation";
    content: string;
    question_id: string;
    index: number;
}

export interface TestConfiguration {
  [subject: string]: {
    count: number;
    seen_count: number;
  };
}

// Matches your Supabase columns exactly
export interface Test {
  id: string;
  user_id: string;
  test_name: string;
  score: number | null;
  created_at: string;
  duration: number;
  configuration: TestConfiguration;
  total_questions: number;
}
