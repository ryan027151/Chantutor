
function Question(props){
    return (
        <>
        <p>{props.problem}</p>
        <form>
            <label>
                {props.option1}
                <input type="radio" name="options" value={props.option1Val}></input>
            </label>
            <label>
                {props.option2}
                <input type="radio" name="options" value={props.option2Val}></input>
            </label>
            <label>
                {props.option3}
                <input type="radio" name="options" value={props.option3Val}></input>
            </label>
            <label>
                {props.option4}
                <input type="radio" name="options" value={props.option4Val}></input>
            </label>
        </form>
        </>
    
    )
}

export default Question;    