import MCQuestion from "../components/multiQuestion";
import GridInQuestion from "../components/gridInQuestion";
import { supabase } from "../supabase-client";
import {useEffect, useState, useRef} from "react";
import QuestionGenerator from "../logicclasses/questionGenerator";
import { icons } from "../assets/icons.tsx"
import { useNavigate } from "react-router-dom";
import Question from "../logicclasses/question.ts";
import QuestionRenderer from "../components/questionRenderer.tsx";
import { useParams } from "react-router-dom";
import MockTextPopUp from "../components/mockTestPopUp.tsx";



function MockTest() {
  const [questionData, setQuestionData] = useState(Object);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [chosenAnswer, setChosenAnswer] = useState("");
  const [nullSubmission, setNullSubmission] = useState(false);
  const [mediaData, setMediaData] = useState(null)
  const [isFinished, setIsFinished] = useState(false);
  const navigate = useNavigate();

  const { testID } = useParams();

  const getQuestion = async () => {
      const { data, error } = await supabase.rpc("get_random_question", {
        p_test_id: testID,
      });

      if (error) {
        console.error("Function error:", error);
        return;
      }
      
      setQuestionData(data[0])
      console.log(questionData[0])
      if (data && data.length > 0) {
        console.log("Question ID:", data[0]);
      } else {
        console.warn("No question found for this test.");
      }

    };
  
  //use media type to determine what to display
  async function getMedia() {
    const { data, error } = await supabase.from('dictionary_of_media').select('*').eq('question_id', '21A_Q56_A');

    if (error) {
      return;
    }
    
    setMediaData(data[0])
    console.log(data[0])
  } 


  async function handleSubmit(){
     const {data: { user }} = await supabase.auth.getUser();
     setCurrentQuestion(currentQuestion + 1)

    
    if (user && questionData){
      const { data, error } = await supabase
        .from('questions')
        .upsert({
            id: questionData.uid, 
            test_id: testID, 
            user_id: user.id,
            student_answer: chosenAnswer,
            order_index: currentQuestion
        }, {
            onConflict: 'test_id, user_id, id'
        }) 

      if (error) {
        console.log("Answer not submitted", error)
        return;
      } else {
        isFinishedFunc()
        getQuestion();
        setChosenAnswer("");
        setNullSubmission(false);
        if (isFinished) {
          navigate("/home")
          console.log("woo")
        }
      }


    }
  }

  //doesn't work for 1 question tests
  async function isFinishedFunc(){
    const { data, error } = await supabase.from('tests').select('total_questions').eq('id', testID)
    if (data) {
      if ( Number(data[0].total_questions) === Number(currentQuestion)) {
        console.log(data[0].total_questions);
        console.log("Penis" + currentQuestion);
        Number(data[0].total_questions) === Number(currentQuestion) ? setIsFinished(true) : setIsFinished(false);
      }
    }
  }

  /**
   * Load the first question the moment the mock test begins
   */
  useEffect(() => {
    getQuestion();
  }, []);

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
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-l-none" onClick={chosenAnswer ? handleSubmit : () => setNullSubmission(true)}>
                {icons.arrowRight}
              </button>

              {/*Temporary mock test exit button*/}
              <button onClick={() => navigate("/home")}>
                {icons.home}
              </button>
              <button onClick={getMedia}>
                {icons.exit}
              </button>
            </div>
           </div>

          <h2 className="md:text-2xl text-xl">0/114</h2>

          <div className="flex flex-row gap-6">
            <h2 className="md:text-2xl text-xl">00:00:00</h2>
            <h2 className="md:text-2xl text-xl">Name</h2>
          </div>
        
        </div>

        {/*Bottom section below header*/}
        {/*Need to fix this flex nightmare*/}
        <div className="flex flex-col items-center justify-center">
        {questionData ?  


          <div className="flex flex-col border border-gray-300 gap-6 shadow-xl m-6 px-6 md:w-3xl sm:w-xl w-xs">
            <div>
              {/*prob gonna need seperate component here to handle media logic*/}
            </div>
            <div className="flex flex-col gap-6 m-8">
            <h3 className="md:text-xl text-md">{"Question " + currentQuestion}</h3>
            {/* Problem */}
            <p>{questionData.text ? questionData.text : "Loading"}</p>
            {nullSubmission ? <p className="md:text-sm text-xs text-red-600 font-bold animate-bounce">Input a answer!!!</p> : ""}
           <QuestionRenderer chosenAnswer={setChosenAnswer} type={questionData.type} uid={questionData.uid} options={[questionData.choice_1, questionData.choice_2, questionData.choice_3, questionData.choice_4]} answer={questionData.answer}></QuestionRenderer>       
            </div>
          </div>
          
          : 
          <p>Loading</p>}
        
        
        </div>
      </div>

    </>
  )
}

export default MockTest;
