import { useEffect, useState } from "react";
import { supabase } from "../supabase-client";
import { parseFormattedText } from "../utils/textParser";
import MediaDisplay from "./mediaDisplay";
import { MediaItem } from "./types";
import SHSATGrapher from "./SHSATGrapher";
import NumberLineClick from "./NumberLineClick";
import TableRowRadio from "./TableRowRadio";

interface AllQuestion {
  uid: string;
  text: string;
  answer: string;
  type: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  extra_data?: Record<string, unknown> | null;
}

interface Props {
  questionUid: string;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  questionNumber: number;
  testId?: string;
  testName?: string;
  onClose: () => void;
}

const REASON_LABELS: { value: string; label: string }[] = [
  { value: "wrong_answer_key",      label: "Wrong answer key" },
  { value: "typo_formatting",       label: "Typo or formatting issue" },
  { value: "unclear_question",      label: "Unclear or ambiguous question" },
  { value: "missing_broken_image",  label: "Missing or broken image" },
  { value: "other",                 label: "Other" },
];

function extractLetter(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const m = text.match(/^([A-Ha-h])[).:\s]/);
  return m ? m[1].toUpperCase() : fallback;
}

function stripChoicePrefix(text: string): string {
  return text.replace(/^[A-Ha-h][).:\s]\s*/, "");
}

function isChoiceMedia(mediaId: string): boolean {
  return (mediaId.split("_").pop() ?? "").startsWith("NL");
}

function choiceLetter(mediaId: string): string {
  return (mediaId.split("_").pop() ?? "").slice(2);
}

export default function QuestionDetailModal({
  questionUid, studentAnswer, isCorrect, questionNumber, testId, testName, onClose,
}: Props) {
  const [question, setQuestion] = useState<AllQuestion | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Report state
  const [showReport, setShowReport]         = useState(false);
  const [reportReason, setReportReason]     = useState("wrong_answer_key");
  const [reportDesc, setReportDesc]         = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone]         = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: qData }, { data: mData }] = await Promise.all([
        supabase
          .from("all_questions")
          .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4, extra_data")
          .eq("uid", questionUid)
          .single(),
        supabase
          .from("dictionary_of_media")
          .select("*")
          .eq("question_id", questionUid)
          .order("media_id"),
      ]);
      setQuestion(qData as AllQuestion | null);
      setMediaItems((mData as MediaItem[]) ?? []);
      setLoading(false);
    })();
  }, [questionUid]);

  async function submitReport() {
    setReportSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("question_reports").insert([{
      user_id:      user?.id ?? null,
      test_id:      testId ?? null,
      question_uid: questionUid,
      order_index:  questionNumber,
      test_name:    testName ?? null,
      reason:       reportReason,
      description:  reportDesc.trim() || null,
      status:       "pending",
    }]);
    setReportSubmitting(false);
    setReportDone(true);
    setTimeout(() => {
      setShowReport(false);
      setReportDone(false);
      setReportDesc("");
      setReportReason("wrong_answer_key");
    }, 1800);
  }

  const correctAnswer = question?.answer ?? "";
  const isGridIn = question?.type === "grid-in";
  const isGraphing = question?.type === "linear_graphing";
  const isMultiSelect = question?.type === "multi-select";
  const isExpression = question?.type === "expression";
  const isInlineDropdown = question?.type === "inline-dropdown";
  const isNumberLine    = question?.type === "number_line_click";
  const isTableRowRadio = question?.type === "table_row_radio";
  const fallbackLetters = ["A", "B", "C", "D", "E", "F"];

  // Multi-select: build full options list including extra_data choices
  const multiSelectChoices = (() => {
    if (!isMultiSelect || !question) return [];
    const extra = (question.extra_data ?? {}) as Record<string, unknown>;
    const opts = [
      question.choice_1, question.choice_2, question.choice_3, question.choice_4,
      extra.choice_5 as string | null, extra.choice_6 as string | null,
    ].filter(Boolean) as string[];
    return opts.map((opt, i) => ({ letter: extractLetter(opt, fallbackLetters[i]), label: opt }));
  })();

  const choices = question && !isMultiSelect && !isInlineDropdown && !isTableRowRadio && !isNumberLine
    ? [question.choice_1, question.choice_2, question.choice_3, question.choice_4].map(
        (opt, i) => ({ letter: extractLetter(opt, fallbackLetters[i]), label: opt })
      )
    : [];

  // Inline-dropdown: derive the option list for the sentence display
  const inlineDropdownChoices = isInlineDropdown && question
    ? [question.choice_1, question.choice_2, question.choice_3, question.choice_4]
        .filter(Boolean)
        .map((opt, i) => ({ letter: extractLetter(opt, fallbackLetters[i]), label: stripChoicePrefix(opt!) }))
    : [];

  const displayMedia = mediaItems
    .filter(m => !isChoiceMedia(m.media_id))
    .sort((a, b) => a.media_id.localeCompare(b.media_id));
  const choiceImages: Record<string, string> = {};
  mediaItems.filter(m => isChoiceMedia(m.media_id)).forEach(m => {
    choiceImages[choiceLetter(m.media_id)] = m.content;
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-slate-900">Question {questionNumber}</span>
            {isCorrect === true && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Correct</span>
            )}
            {isCorrect === false && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Incorrect</span>
            )}
            {isCorrect === null && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">Skipped</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Flag button */}
            {!loading && question && (
              <button
                type="button"
                onClick={() => setShowReport(v => !v)}
                title="Report an issue with this question"
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  showReport
                    ? "bg-amber-50 text-amber-600 border-amber-300"
                    : "text-slate-400 border-slate-200 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-9.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                Flag
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Inline report form */}
        {showReport && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex flex-col gap-3">
            {reportDone ? (
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Report submitted — thank you!
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Report an issue</p>
                <div className="flex gap-2">
                  <select
                    value={reportReason}
                    title="Report reason"
                    onChange={e => setReportReason(e.target.value)}
                    className="flex-1 border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {REASON_LABELS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={reportSubmitting}
                    onClick={submitReport}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                  >
                    {reportSubmitting ? "Sending…" : "Submit"}
                  </button>
                </div>
                <textarea
                  value={reportDesc}
                  onChange={e => setReportDesc(e.target.value)}
                  placeholder="Optional details…"
                  rows={2}
                  className="border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </>
            )}
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !question ? (
          <div className="py-10 text-center text-sm text-slate-400">Question details not available.</div>
        ) : (
          <div className="overflow-y-auto">
            {displayMedia.length > 0 && (
              <div className="px-5 pt-5 pb-0">
                <MediaDisplay mediaItems={displayMedia} />
              </div>
            )}
            <div className="p-5 flex flex-col gap-4">
              {/* For inline-dropdown, render the sentence with the blank filled in */}
              {isInlineDropdown ? (() => {
                const blankIdx = question.text?.indexOf("[BLANK]") ?? -1;
                const before = blankIdx >= 0 ? question.text.slice(0, blankIdx) : question.text ?? "";
                const after  = blankIdx >= 0 ? question.text.slice(blankIdx + 7) : "";
                const studentChoice = inlineDropdownChoices.find(c => c.letter === studentAnswer?.toUpperCase());
                const correctChoice = inlineDropdownChoices.find(c => c.letter === correctAnswer.toUpperCase());
                const chipBase = "inline-block mx-1 px-2.5 py-0.5 rounded-lg border-2 text-sm font-semibold";
                return (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-slate-800 leading-relaxed">
                      {parseFormattedText(before, "b-")}
                      {studentAnswer ? (
                        <span className={`${chipBase} ${isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-rose-400 bg-rose-50 text-rose-800"}`}>
                          {studentChoice?.label ?? studentAnswer}
                        </span>
                      ) : (
                        <span className={`${chipBase} border-dashed border-slate-300 text-slate-400`}>
                          not answered
                        </span>
                      )}
                      {parseFormattedText(after, "a-")}
                    </p>
                    {isCorrect === false && correctChoice && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400 font-medium shrink-0">Correct answer:</span>
                        <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                          {correctChoice.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <p className="text-sm text-slate-800 leading-relaxed">
                  {parseFormattedText(
                    question.text,
                    "",
                    Array.isArray(question.extra_data?.variables) ? question.extra_data!.variables as string[] : []
                  )}
                </p>
              )}

              {isTableRowRadio ? (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const extra = (question?.extra_data ?? {}) as Record<string, unknown>;
                    const cols = Array.isArray(extra.col_headers) ? extra.col_headers as string[] : [];
                    const rowLabels = Array.isArray(extra.rows) ? extra.rows as string[] : [];
                    return (
                      <TableRowRadio
                        colHeaders={cols}
                        rows={rowLabels}
                        chosenAnswer={() => {}}
                        isReadOnly={true}
                        previousAnswer={studentAnswer ?? ""}
                        correctAnswer={correctAnswer}
                      />
                    );
                  })()}
                  {!studentAnswer && (
                    <p className="text-xs text-slate-400 italic text-center">No answer was submitted for this question.</p>
                  )}
                </div>
              ) : isNumberLine ? (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const extra = (question?.extra_data ?? {}) as Record<string, unknown>;
                    const nlMin  = typeof extra.min  === "number" ? extra.min  : -10;
                    const nlMax  = typeof extra.max  === "number" ? extra.max  : 10;
                    const nlStep = typeof extra.step === "number" ? extra.step : 1;
                    return (
                      <NumberLineClick
                        min={nlMin} max={nlMax} step={nlStep}
                        isReadOnly={true}
                        previousAnswer={studentAnswer ?? undefined}
                        correctAnswer={correctAnswer}
                      />
                    );
                  })()}
                  {!studentAnswer && (
                    <p className="text-xs text-slate-400 italic text-center">No answer was submitted for this question.</p>
                  )}
                </div>
              ) : isGraphing ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {studentAnswer && (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-5 h-0.5 bg-gray-400 rounded" />
                          Your line
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-5 h-0.5 bg-emerald-500 rounded" />
                        Correct answer
                      </span>
                    </div>
                    <SHSATGrapher
                      onAnswerChange={() => {}}
                      isReadOnly={true}
                      previousAnswer={studentAnswer ?? undefined}
                      correctAnswer={correctAnswer}
                    />
                  </div>
                  {!studentAnswer && (
                    <p className="text-xs text-slate-400 italic text-center">No answer was submitted for this question.</p>
                  )}
                </div>
              ) : isExpression ? (
                <div className="flex flex-col gap-2">
                  <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                    !studentAnswer ? "bg-slate-50 border-slate-200" :
                    isCorrect ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}>
                    <span className="text-xs font-semibold text-slate-500 w-28 shrink-0">Your answer</span>
                    <span className={`font-mono text-sm font-semibold ${
                      !studentAnswer ? "text-slate-400 italic" :
                      isCorrect ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {studentAnswer || "—"}
                    </span>
                  </div>
                  {isCorrect === false && (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-emerald-50 border border-emerald-200">
                      <span className="text-xs font-semibold text-slate-500 w-28 shrink-0">Correct answer</span>
                      <span className="font-mono text-sm font-semibold text-emerald-700">{correctAnswer}</span>
                    </div>
                  )}
                </div>
              ) : isGridIn ? (
                <div className="flex flex-col gap-2">
                  <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                    !studentAnswer ? "bg-slate-50 border-slate-200" :
                    isCorrect ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}>
                    <span className="text-xs font-semibold text-slate-500 w-24 shrink-0">Your answer</span>
                    <span className={`text-sm font-bold ${
                      !studentAnswer ? "text-slate-400 italic" :
                      isCorrect ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {studentAnswer ?? "—"}
                    </span>
                  </div>
                  {isCorrect === false && (
                    <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-emerald-50 border border-emerald-200">
                      <span className="text-xs font-semibold text-slate-500 w-24 shrink-0">Correct answer</span>
                      <span className="text-sm font-bold text-emerald-700">{correctAnswer}</span>
                    </div>
                  )}
                </div>
              ) : isMultiSelect ? (
                <div className="flex flex-col gap-2">
                  {multiSelectChoices.map(({ letter, label }) => {
                    const studentSelections = new Set(
                      (studentAnswer ?? "").split(",").map(s => s.trim()).filter(Boolean)
                    );
                    const correctSelections = new Set(
                      correctAnswer.split(",").map(s => s.trim()).filter(Boolean)
                    );
                    const isStudentChoice = studentSelections.has(letter);
                    const isCorrectChoice = correctSelections.has(letter);
                    let rowCls = "bg-white border-slate-200";
                    let squareCls = "bg-slate-100 text-slate-500 border-slate-300";
                    if (isCorrectChoice) {
                      rowCls = "bg-emerald-50 border-emerald-300";
                      squareCls = "bg-emerald-500 text-white border-emerald-500";
                    } else if (isStudentChoice) {
                      rowCls = "bg-rose-50 border-rose-300";
                      squareCls = "bg-rose-400 text-white border-rose-400";
                    }
                    return (
                      <div key={letter} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${rowCls}`}>
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 border mt-0.5 ${squareCls}`}>
                          {letter}
                        </span>
                        <div className="flex-1 text-sm text-slate-700 leading-relaxed">
                          {label ? parseFormattedText(stripChoicePrefix(label)) : "—"}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 self-center">
                          {isStudentChoice && !isCorrectChoice && (
                            <span className="text-xs text-rose-500 font-medium">Your choice</span>
                          )}
                          {isStudentChoice && isCorrectChoice && (
                            <span className="text-xs text-emerald-600 font-medium">Your choice</span>
                          )}
                          {!isStudentChoice && isCorrectChoice && (
                            <span className="text-xs text-emerald-600 font-medium">Missed</span>
                          )}
                          {isCorrectChoice && (
                            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : isInlineDropdown ? null : (
                <div className="flex flex-col gap-2">
                  {choices.map(({ letter, label }) => {
                    const isStudentChoice = studentAnswer === letter;
                    const isCorrectChoice = correctAnswer === letter;
                    let rowCls = "bg-white border-slate-200";
                    let circleCls = "bg-slate-100 text-slate-500 border-slate-300";
                    if (isCorrectChoice) {
                      rowCls = "bg-emerald-50 border-emerald-300";
                      circleCls = "bg-emerald-500 text-white border-emerald-500";
                    } else if (isStudentChoice) {
                      rowCls = "bg-rose-50 border-rose-300";
                      circleCls = "bg-rose-400 text-white border-rose-400";
                    }
                    return (
                      <div key={letter} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${rowCls}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border mt-0.5 ${circleCls}`}>
                          {letter}
                        </span>
                        <div className="flex-1 text-sm text-slate-700 leading-relaxed">
                          {choiceImages[letter] ? (
                            <img src={choiceImages[letter]} alt={`Choice ${letter}`} className="max-h-16 h-auto" />
                          ) : (
                            label ? parseFormattedText(stripChoicePrefix(label)) : "—"
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 self-center">
                          {isStudentChoice && !isCorrectChoice && (
                            <span className="text-xs text-rose-500 font-medium">Your choice</span>
                          )}
                          {isStudentChoice && isCorrectChoice && (
                            <span className="text-xs text-emerald-600 font-medium">Your choice</span>
                          )}
                          {isCorrectChoice && (
                            <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
