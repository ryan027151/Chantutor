import GridInQuestion from "./gridInQuestion";
import MCQuestion from "./multiQuestion";

interface QuestionProps {
  type: 'mcq' | 'grid-in';
  uid: string;
  options: string[];
  media?: string;
  answer: string;
  chosenAnswer: (answer: string) => void;
}

export default function QuestionRenderer( {type, uid, options, media, answer, chosenAnswer} : QuestionProps){
    switch (type) {
        case "mcq": return <MCQuestion 
                option1={options[0]} 
                option2={options[1]}
                option3={options[2]}
                option4={options[3]} 
                chosenAnswer={chosenAnswer}></MCQuestion>;
        case "grid-in": return <GridInQuestion chosenAnswer={chosenAnswer}></GridInQuestion>;

    }
}