import MCQuestion from "../components/multiQuestion";
import GridInQuestion from "../components/gridInQuestion";
import { supabase } from "../supabase-client";
import {useEffect, useState, useRef} from "react";
import QuestionGenerator from "../logicclasses/questionGenerator";
import { icons } from "../assets/icons.tsx"



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
      <div className="flex flex-col w-full h-full ">
        {/*header*/}
        <div className="flex flex-row w-full md:h-auto h-auto px-10 py-3 gap-6 items-center justify-between border-b-3 border-dotted">

          <div className="flex flex-row gap-6">
            <h2 className="md:text-2xl text-xl">Recent Tests</h2>

            {/*arrow buttons container*/}
            <div>
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-r-none ">
                {icons.arrowLeft}
              </button >
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-l-none">
                {icons.arrowRight}
              </button>
            </div>
           </div>

          <h2 className="md:text-2xl text-xl">0/117</h2>

          <div className="flex flex-row gap-6">
            <h2 className="md:text-2xl text-xl">00:00:00</h2>
            <h2 className="md:text-2xl text-xl">Name</h2>
          </div>
        
        </div>

        <div className="flex flex-col">
        {questionData ? ( 
          <div className="flex flex-col gap-6">
            <p>{questionData.Question_Text ? questionData.Question_Text : "Loading"}</p>
            {questionData.Type ? ( (
              questionData.Type[0] == "M" ? ( 
                <MCQuestion 
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
        </div>
      </div>

    </>
  )
}

export default MockTest;
