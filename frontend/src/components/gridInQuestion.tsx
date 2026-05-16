
function GridInQuestion(props : {chosenAnswer : (answer : string) => void}){
    return (
        <div className="container">
            <form id="questions">
                <label>
                    <input type="text" onChange={(e) => props.chosenAnswer(e.target.value)}></input>
                </label>
            </form>
        </div>
    );
}

export default GridInQuestion; 