import { parseFormattedText } from "../utils/textParser";

interface MCQuestionProps {
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  // keyed by choice letter "A"|"B"|"C"|"D" → image URL (for number line questions)
  choiceImages?: Record<string, string>;
}

function MCQuestion({
  option1, option2, option3, option4,
  chosenAnswer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
}: MCQuestionProps) {
  const hasImages = Object.keys(choiceImages).length > 0;

  // When choice images are present, radio values are "A"/"B"/"C"/"D" so they match
  // what gets stored in student_answer and compared against the answer field.
  // For regular MCQ, values are the full choice text.
  const choices = [
    { value: hasImages ? "A" : option1, label: option1, image: choiceImages["A"] },
    { value: hasImages ? "B" : option2, label: option2, image: choiceImages["B"] },
    { value: hasImages ? "C" : option3, label: option3, image: choiceImages["C"] },
    { value: hasImages ? "D" : option4, label: option4, image: choiceImages["D"] },
  ];

  return (
    <div className="flex flex-col gap-2">
      <fieldset>
        <legend className="sr-only">Answer choices</legend>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={`flex flex-row items-start gap-2 py-1 ${isReadOnly ? "cursor-default" : "cursor-pointer"}`}
          >
            <input
              type="radio"
              name="options"
              value={choice.value}
              defaultChecked={isReadOnly && previousAnswer === choice.value}
              disabled={isReadOnly}
              onChange={(e) => chosenAnswer(e.target.value)}
              className="mt-1 shrink-0"
            />
            {choice.image ? (
              <img
                src={choice.image}
                alt={`Choice ${choice.value}`}
                className="max-h-16 h-auto"
              />
            ) : (
              <span>{parseFormattedText(choice.label ?? "")}</span>
            )}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export default MCQuestion;
