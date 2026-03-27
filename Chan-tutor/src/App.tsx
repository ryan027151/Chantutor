import Question from "./components/question";
import { supabase } from "./supabase-client";
import {useEffect, useState} from "react";
import "./App.css"



function App() {
  
  const [questionData, setQuestionData] = useState(new Map());
  const [currentQuestion, setCurrentQuestion] = useState(1);

  useEffect(() => {
    getQuestions();
  }, [])

  async function getQuestions() {
    const {error, data} = await supabase.from("TestQuiz").select("*");
    
    if (error) {
      return;
    }
    
    const fetchedMap = new Map();

    for (let i = 0; i < data.length; i++ ) {
      fetchedMap.set(data[i].question_num, data[i].problem_options);
    }

    
    setQuestionData(fetchedMap);
  } 

  useEffect(() => {
  console.log("questionData changed:", questionData);
  console.log("questionData size:", questionData.size);

  const obj = questionData.get(1);
  console.log(obj)
}, [questionData]);

  /**
   * can maybe use a array based renderi
   */
  return (
    <>
    <div id="question">
      <Question 
      problem={questionData.get(currentQuestion) ? questionData.get(currentQuestion).probem: "Loading"} 
      option1={questionData.get(currentQuestion) ? questionData.get(currentQuestion).options[0]: "Loading"} 
      option2={questionData.get(currentQuestion) ? questionData.get(currentQuestion).options[1]: "Loading"}
      option3={questionData.get(currentQuestion) ? questionData.get(currentQuestion).options[2]: "Loading"}
      option4={questionData.get(currentQuestion) ? questionData.get(currentQuestion).options[3]: "Loading"}
      >
      </Question>
      <button onClick={() => setCurrentQuestion(currentQuestion + 1)}>Next</button>
      <button onClick={() => setCurrentQuestion(currentQuestion - 1)}>Back</button>
    </div>
    </>
  )
}

export default App
