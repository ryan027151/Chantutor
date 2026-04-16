import MCQuestion from "../components/multiQuestion";
import GridInQuestion from "../components/gridInQuestion";
import { supabase } from "../supabase-client";
import {useEffect, useState, useRef} from "react";
import "./mocktest.css"
import QuestionGenerator from "../logicclasses/questionGenerator";



function MockTest() {
  const [questionData, setQuestionData] = useState(Object);
  const [currentQuestion, setCurrentQuestion] = useState(1);

  const categoryTracker = useRef(new QuestionGenerator());


  useEffect(() => {
    getQuestions();
  }, [])

  /**
   * category selection is broken for some reason
   */
  async function getQuestions() {
    const {error, data} = await supabase.rpc('get_random_question', {diff : 'Easy', cat: null});

    if (error) {
      return;
    }
    
    setQuestionData(data[0]);
    console.log(data[0])
    console.log(categoryTracker.current.getTestPreset());
  } 


  return (
    <>
    {questionData ? ( 
    <div id="question">
      {questionData.Type ? ( (
        questionData.Type[0] == "M" ? ( 
          <MCQuestion 
          problem={questionData.Question_Text ? questionData.Question_Text : "Loading"} 
          option1={questionData.Option_A ?  questionData.Option_A : "Loading"} 
          option2={questionData.Option_B ? questionData.Option_B : "Loading"}
          option3={questionData.Option_C ? questionData.Option_C : "Loading"}
          option4={questionData.Option_D ? questionData.Option_D : "Loading"}
          >
      </MCQuestion>
        ) : ( 
          <GridInQuestion problem={questionData.Question_Text ? questionData.Question_Text : "Loading"}></GridInQuestion>
        ) )
      ) : (
        <p> "Loading" </p>
      )
      }
      <button onClick={() => setCurrentQuestion(currentQuestion + 1)}>Next</button>
      <button onClick={() => setCurrentQuestion(currentQuestion - 1)}>Back</button>
    </div>
    ) : 
    <p>Loading</p>}
    </>
  )
}

export default MockTest;
