import { useState } from "react";
import GridInQuestion from "./gridInQuestion";
import MCQuestion from "./multiQuestion";
import { supabase } from "../supabase-client";

interface QuestionProps {
  type: 'mcq' | 'grid-in';
  uid: string;
  options: string[];
  answer: string;
  chosenAnswer: (answer: string) => void;
}

export default function QuestionRenderer( {type, uid, options, answer, chosenAnswer} : QuestionProps){
    const [mediaData, setMediaData] = useState<string[]>([])
    
    async function getMedia() {
        const { data, error } = await supabase.from('dictionary_of_media').select('*').eq('question_id', '21A_Q56_A');
    
        if (error) {
          return;
        }
        
        setMediaData(data)
      } 

    function renderQuestion() {
        switch (type) {
        case "mcq": return <MCQuestion
            option1={options[0]}
            option2={options[1]}
            option3={options[2]}
            option4={options[3]}
            chosenAnswer={chosenAnswer}
        />;
        case "grid-in": return <GridInQuestion chosenAnswer={chosenAnswer} />;
        default: return null;
        }
    };

    return (
        <div>
            
            {renderQuestion()}
        </div>
    );
    
}