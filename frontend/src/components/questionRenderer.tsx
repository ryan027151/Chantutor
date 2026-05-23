import GridInQuestion from "./gridInQuestion";
import MCQuestion from "./multiQuestion";
import SHSATGrapher from "./SHSATGrapher";

type QuestionType = "mcq" | "grid-in" | "linear_graphing";

interface QuestionProps {
  type: QuestionType;
  uid: string;
  options: string[];
  answer: string;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  choiceImages?: Record<string, string>;
}

export default function QuestionRenderer({
  type,
  options,
  chosenAnswer,
  answer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
}: QuestionProps) {
  switch (type) {
    case "mcq":
      return (
        <MCQuestion
          option1={options[0]}
          option2={options[1]}
          option3={options[2]}
          option4={options[3]}
          chosenAnswer={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={previousAnswer}
          choiceImages={choiceImages}
        />
      );
    case "grid-in":
      return (
        <GridInQuestion
          chosenAnswer={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={previousAnswer}
        />
      );
    case "linear_graphing":
      return (
        <SHSATGrapher
          onAnswerChange={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={isReadOnly ? previousAnswer : undefined}
          correctAnswer={isReadOnly ? answer : undefined}
        />
      );
    default:
      return null;
  }
}
