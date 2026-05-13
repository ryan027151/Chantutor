import "./multiQuestion.css"

function MCQuestion(props : {option1: string, option2: string, option3: string, option4: string,}){
    return (
        <div className="container">
            <form id="questions">
                <label>
                    {props.option1}
                    <input type="radio" name="options" ></input>
                </label>
                <label>
                    {props.option2}
                    <input type="radio" name="options" ></input>
                </label>
                <label>
                    {props.option3}
                    <input type="radio" name="options"></input>
                </label>
                <label>
                    {props.option4}
                    <input type="radio" name="options" ></input>
                </label>
            </form>
        </div>
    
    )
}

export default MCQuestion;    