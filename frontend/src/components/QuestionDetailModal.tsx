import { useEffect, useState } from "react";
import { supabase } from "../supabase-client";
import { parseFormattedText } from "../utils/textParser";
import MediaDisplay from "./mediaDisplay";
import { MediaItem } from "./types";

interface AllQuestion {
  uid: string;
  text: string;
  answer: string;
  type: string;
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
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
          .select("uid, text, answer, type, choice_1, choice_2, choice_3, choice_4")
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
  const fallbackLetters = ["A", "B", "C", "D"];
  const choices = question
    ? [question.choice_1, question.choice_2, question.choice_3, question.choice_4].map(
        (opt, i) => ({ letter: extractLetter(opt, fallbackLetters[i]), label: opt })
      )
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
              <p className="text-sm text-slate-800 leading-relaxed">
                {parseFormattedText(question.text)}
              </p>

              {isGridIn ? (
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
              ) : (
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
                            label ? parseFormattedText(label) : "—"
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
