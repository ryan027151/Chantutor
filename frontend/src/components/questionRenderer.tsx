import MCQuestion from "./multiQuestion";

interface QuestionProps {
  type: 'mcq' | 'grid-in';
  uid: string;
  problem: string;
  options: string[];
  media?: string;
  answer: string;
}

export default function QuestionRenderer( {type, uid, problem, options, media, answer} : QuestionProps){
    switch (type) {
        case "mcq": return <MCQuestion 
                option1={options[0]} 
                option2={options[1]}
                option3={options[2]}
                option4={options[3]} ></MCQuestion>;
        case "grid-in": return 

    }
}