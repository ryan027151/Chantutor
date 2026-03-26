import Question from "./components/question";
import { supabase } from "./supabase-client";
import {useEffect, useState} from "react";



function App() {
  const [questionData, setQuestionData] = useState(Object);

  async function getQuestions() {
    const {error, data} = await supabase.from("instruments").select("problem_options").eq("question_num", 1);
    
    if (error) {
      return;
    }

    setQuestionData(data);
  }

  useEffect(() => {
    getQuestions();
  }, [])


  /**
   * can maybe use a array based renderi
   */
  return (
    <>
      <Question 
      problem={questionData.problem} 
      option1={questionData.option1} 
      option2={questionData.option2}
      option3={questionData.option3}
      option4={questionData.option4}
      className="questions">
      </Question>
    </>
  )
}

export default App
