import GridInQuestion from "./gridInQuestion";
import MCQuestion from "./multiQuestion";
import SHSATGrapher from "./SHSATGrapher";
import MultiSelectQuestion from "./MultiSelectQuestion";
import ExpressionEditorQuestion from "./ExpressionEditorQuestion";
import InlineDropdownQuestion from "./InlineDropdownQuestion";

type QuestionType = "mcq" | "grid-in" | "linear_graphing" | "multi-select" | "expression" | "inline-dropdown";

interface QuestionProps {
  type: QuestionType;
  uid: string;
  options: string[];
  answer: string;
  chosenAnswer: (answer: string) => void;
  isReadOnly?: boolean;
  previousAnswer?: string;
  choiceImages?: Record<string, string>;
  selectCount?: number;
  variables?: string[];
  eliminateMode?: boolean;
  eliminatedChoices?: Set<string>;
  onEliminate?: (letter: string) => void;
  // Used by inline-dropdown: full question text with [BLANK] marker
  text?: string;
}

export default function QuestionRenderer({
  type,
  options,
  chosenAnswer,
  answer,
  isReadOnly = false,
  previousAnswer = "",
  choiceImages = {},
  selectCount = 1,
  variables = [],
  eliminateMode = false,
  eliminatedChoices = new Set(),
  onEliminate,
  text = "",
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
          eliminateMode={eliminateMode}
          eliminatedChoices={eliminatedChoices}
          onEliminate={onEliminate}
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
    case "multi-select":
      return (
        <MultiSelectQuestion
          options={options}
          selectCount={selectCount}
          chosenAnswer={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={previousAnswer}
          choiceImages={choiceImages}
        />
      );
    case "expression":
      return (
        <ExpressionEditorQuestion
          chosenAnswer={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={previousAnswer}
          variables={variables}
        />
      );
    case "inline-dropdown":
      return (
        <InlineDropdownQuestion
          text={text}
          options={options}
          chosenAnswer={chosenAnswer}
          isReadOnly={isReadOnly}
          previousAnswer={previousAnswer}
          answer={answer}
        />
      );
    default:
      return null;
  }
}
