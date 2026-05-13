

function MCQuestion(props : {option1: string, option2: string, option3: string, option4: string,}){
    return (
        <div className="flex flex-rol w-auto flex-start">
            <form>
                <label className="flex flex-rol justify-center gap-2">
                    <input type="radio" name="options" ></input>
                    {"A. " + props.option1}
                </label>
                <label className="flex flex-rol justify-center gap-2">
                    <input type="radio" name="options" ></input>
                    {"B. " + props.option2}
                </label>
                <label className="flex flex-rol justify-center gap-2">
                    <input type="radio" name="options"></input>
                    {"C. " + props.option3}
                </label>
                <label className="flex flex-rol justify-center gap-2">
                    <input type="radio" name="options" ></input>
                    {"D. " + props.option4}
                </label>
            </form>
        </div>
    
    )
}

export default MCQuestion;    