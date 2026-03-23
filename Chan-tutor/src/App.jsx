import Question from "./components/question"

function App() {
  /**
   * can maybe use a array based renderi
   */
  return (
    <>
      <Question 
      problem="qweqweqweqwe" 
      option1="A" 
      option2="B" 
      option3="C" 
      option4="D"
      className="questions">
      </Question>
    </>
  )
}

export default App
