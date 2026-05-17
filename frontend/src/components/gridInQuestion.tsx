interface GridInProps {
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
}

function GridInQuestion({ chosenAnswer, isReadOnly = false, previousAnswer = "" }: GridInProps) {
  return (
    <div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">Your answer:</span>
        <input
          type="text"
          defaultValue={isReadOnly ? previousAnswer : ""}
          disabled={isReadOnly}
          className="border border-gray-400 px-2 py-1 rounded disabled:bg-gray-100 disabled:text-gray-500 w-32"
          onChange={(e) => {
            if (!isReadOnly) chosenAnswer(e.target.value);
          }}
        />
      </label>
    </div>
  );
}

export default GridInQuestion;
