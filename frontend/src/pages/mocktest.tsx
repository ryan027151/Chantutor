import MCQuestion from "../components/multiQuestion";
import GridInQuestion from "../components/gridInQuestion";
import { supabase } from "../supabase-client";
import {useEffect, useState, useRef} from "react";
import QuestionGenerator from "../logicclasses/questionGenerator";
import { icons } from "../assets/icons.tsx"
import { useNavigate } from "react-router-dom";
import Question from "../logicclasses/question.ts";
import QuestionRenderer from "../components/questionRenderer.tsx";


function MockTest() {
  const [questionData, setQuestionData] = useState(Object);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [chosenAnswer, setChosenAnswer] = useState("");
  const [mediaData, setMediaData] = useState(null)
  

  const categoryTracker = useRef(new QuestionGenerator());
  const navigate = useNavigate();


  useEffect(() => {
    getQuestions();
  }, [])

  /**
   * category selection is broken for some reason
   */
  async function getQuestions() {
    const { data, error } = await supabase.rpc('get_random_question', {
      diff: 'Easy',
      cat: 'Linear_Eq._Formula'
    });

    if (error) {
      return;
    }
    
    setQuestionData(data[0]);
    console.log(data[0]);
  } 
  //use media type to determine what to display
  async function getMedia() {
    const { data, error } = await supabase.from('dictionary_of_media').select('*').eq('question_id', '21A_Q56_A');

    if (error) {
      return;
    }
    
    setMediaData(data[0])
    console.log(data[0])
  } 


  //Answer Submission Handler

   useEffect(() => {
    console.log("chosenAnswer changed:", chosenAnswer);
  }, [chosenAnswer]);


  async function handleSubmit(){
     const {data: { user }} = await supabase.auth.getUser();
    
    if (user && questionData){
      const { data, error } = await supabase
        .from('questions')
        .upsert({
            id: questionData.uid, 
            test_id: "24e08fd4-c0e0-486d-a4e7-bf82cea1b3a9", 
            user_id: user.id,
            student_answer: chosenAnswer,
            order_index: currentQuestion
        }, {
            onConflict: 'test_id, user_id, id'
        }) 

      if (error) {
        console.log("Answer not submitted", error)
        return;
      }
    }
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
              <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-l-none" onClick={handleSubmit}>
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

          <h2 className="md:text-2xl text-xl">0/117</h2>

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
