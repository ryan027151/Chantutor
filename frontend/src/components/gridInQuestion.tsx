interface GridInProps {
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
}

function GridInQuestion({ chosenAnswer, isReadOnly = false, previousAnswer = "" }: GridInProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="grid-in-answer" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Your answer
      </label>
      <input
        id="grid-in-answer"
        type="text"
        defaultValue={isReadOnly ? previousAnswer : ""}
        disabled={isReadOnly}
        placeholder="e.g. 42 or 3/4 or 0.75"
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400 w-48 font-mono"
        onChange={(e) => {
          if (!isReadOnly) chosenAnswer(e.target.value);
        }}
      />
    </div>
  );
}

export default GridInQuestion;
