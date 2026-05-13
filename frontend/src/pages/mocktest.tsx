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
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-r-none " onClick={() => setCurrentQuestion(currentQuestion - 1)} >
                {icons.arrowLeft}
              </button >
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-l-none" onClick={() => setCurrentQuestion(currentQuestion + 1)}>
                {icons.arrowRight}
              </button>

              {/*Temporary mock test exit button*/}
              <button>

              </button>
            </div>
           </div>

          <h2 className="md:text-2xl text-xl">0/117</h2>

          <div className="flex flex-row gap-6">
            <h2 className="md:text-2xl text-xl">00:00:00</h2>
            <h2 className="md:text-2xl text-xl">Name</h2>
          </div>
        
        </div>

        {/*Bottom section below header*/}
        <div className="flex flex-col items-center">
        {questionData ? ( 
          <div className="flex flex-col border border-gray-300 gap-6 shadow-lg m-6 p-6 w-auto">

            {/* Problem */}
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

                // Checks type of math question
                <GridInQuestion problem={questionData.Question_Text ? questionData.Question_Text : "Loading"}></GridInQuestion>
              ) )
            ) : (
              <p> "Loading" </p>
            )
            }
          </div>
          ) : 
          <p>Loading</p>}
        
        
        
        </div>
      </div>

    </>
  )
}

export default MockTest;
