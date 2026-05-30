import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAMMAR_SUBCATEGORIES = [
  "Comma_Usage",
  "Organization-Concluding_Sentence",
  "Organization-Logical_Placement",
  "Organization-Paragraph_Unity",
  "Organization-Topic_Sentence",
  "Organization-Transitions",
  "Pronoun_Agreement",
  "Sentence_Combining",
  "Sentence_Structure",
  "Style-Word_Choice",
  "Subject-Verb_Agreement",
  "Verb_Tense",
];

interface QuestionRow {
  uid: string;
  text: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  answer: string;
  sub_category: string | null;
}

interface Classification {
  uid: string;
  difficulty: "easy" | "medium" | "hard";
}

function extractJSON(raw: string): Classification[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return parsed.classifications ?? [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Optional: ?limit=20 to process N passages per call (avoids timeout on large banks)
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  const results = {
    passages_processed: 0,
    passages_skipped:   0,
    grammar_processed:  0,
    updated:            0,
    errors:             [] as string[],
  };

  // ── Phase 1: RC passages ──────────────────────────────────────────────────
  // Each row in dictionary_of_media links one passage media to one question.
  // Rows sharing the same media_id = same passage.

  const { data: passageRows, error: prErr } = await supabase
    .from("dictionary_of_media")
    .select("media_id, content, question_id")
    .eq("media_type", "passage");

  if (prErr) {
    return new Response(JSON.stringify({ error: prErr.message }), {
      status: 500, headers: corsHeaders,
    });
  }

  // Group into passage_id → { content, questionIds[] }
  const passageMap = new Map<string, { content: string; questionIds: string[] }>();
  for (const row of passageRows ?? []) {
    if (!passageMap.has(row.media_id)) {
      passageMap.set(row.media_id, { content: row.content, questionIds: [] });
    }
    passageMap.get(row.media_id)!.questionIds.push(row.question_id);
  }

  let passageCount = 0;
  for (const [passageId, { content, questionIds }] of passageMap) {
    if (passageCount >= limit) break;

    // Only classify questions that still have no difficulty set
    const { data: questions } = await supabase
      .from("all_questions")
      .select("uid, text, choice_1, choice_2, choice_3, choice_4, answer, sub_category")
      .in("uid", questionIds)
      .is("difficulty", null);

    if (!questions || questions.length === 0) {
      results.passages_skipped++;
      continue;
    }

    const qList = (questions as QuestionRow[]).map((q, i) =>
      `Q${i + 1} [${q.uid}] (${q.sub_category ?? "unknown"})\n` +
      `${q.text}\n` +
      `A) ${q.choice_1}  B) ${q.choice_2}  C) ${q.choice_3}  D) ${q.choice_4}\n` +
      `Correct: ${q.answer}`,
    ).join("\n\n");

    try {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 600,
        messages: [{
          role: "user",
          content:
`You are an SHSAT expert. Classify each reading comprehension question's difficulty.

SHSAT DIFFICULTY CRITERIA:
- easy:   answer is directly stated in the passage; tests basic recall or literal comprehension; simple vocabulary
- medium: requires inference; comparing information across paragraphs; understanding relationships or implied meanings
- hard:   requires complex analysis; author's craft, tone, or purpose; abstract or figurative reasoning; multi-step logic

PASSAGE (excerpt):
${content.slice(0, 4000)}

QUESTIONS:
${qList}

Reply with ONLY this JSON — no explanation:
{"classifications":[{"uid":"...","difficulty":"easy"|"medium"|"hard"},...]}`
        }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      const classifications = extractJSON(raw);

      for (const { uid, difficulty } of classifications) {
        if (!["easy", "medium", "hard"].includes(difficulty)) continue;
        const { error } = await supabase
          .from("all_questions")
          .update({ difficulty })
          .eq("uid", uid);
        if (error) results.errors.push(`uid ${uid}: ${error.message}`);
        else results.updated++;
      }

      results.passages_processed++;
      passageCount++;
    } catch (e) {
      results.errors.push(`Passage ${passageId}: ${(e as Error).message}`);
    }
  }

  // ── Phase 2: Standalone grammar questions ─────────────────────────────────
  // Process only if we haven't used up the whole run on passages.

  if (passageCount < limit) {
    const { data: grammarQs } = await supabase
      .from("all_questions")
      .select("uid, text, choice_1, choice_2, choice_3, choice_4, answer, sub_category")
      .eq("subject", "english")
      .in("sub_category", GRAMMAR_SUBCATEGORIES)
      .is("difficulty", null);

    const BATCH = 15;
    for (let i = 0; i < (grammarQs?.length ?? 0); i += BATCH) {
      const batch = (grammarQs as QuestionRow[]).slice(i, i + BATCH);

      const qList = batch.map((q, idx) =>
        `Q${idx + 1} [${q.uid}] (${q.sub_category ?? "unknown"})\n` +
        `${q.text}\n` +
        `A) ${q.choice_1}  B) ${q.choice_2}  C) ${q.choice_3}  D) ${q.choice_4}\n` +
        `Correct: ${q.answer}`,
      ).join("\n\n");

      try {
        const msg = await anthropic.messages.create({
          model: "claude-opus-4-7",
          max_tokens: 400,
          messages: [{
            role: "user",
            content:
`You are an SHSAT expert. Classify each grammar/revising-editing question's difficulty.

SHSAT GRAMMAR DIFFICULTY CRITERIA:
- easy:   single clear error; common rule (basic comma, obvious subject-verb); one-step fix
- medium: requires understanding sentence or paragraph context; moderate punctuation or combining rules
- hard:   subtle style issues; complex restructuring; multi-step organization changes; transitions between ideas

QUESTIONS:
${qList}

Reply with ONLY this JSON — no explanation:
{"classifications":[{"uid":"...","difficulty":"easy"|"medium"|"hard"},...]}`
          }],
        });

        const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
        const classifications = extractJSON(raw);

        for (const { uid, difficulty } of classifications) {
          if (!["easy", "medium", "hard"].includes(difficulty)) continue;
          const { error } = await supabase
            .from("all_questions")
            .update({ difficulty })
            .eq("uid", uid);
          if (!error) results.updated++;
        }
        results.grammar_processed += batch.length;
      } catch (e) {
        results.errors.push(`Grammar batch ${i}: ${(e as Error).message}`);
      }
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
