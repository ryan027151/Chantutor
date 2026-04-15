function GridInQuestion(props : {problem: string}){
    return (
        <div className="container">
            <p id="problem">{props.problem}</p>
            <form id="questions">
                <label>
                    <input type="text"></input>
                </label>
            </form>
        </div>
    );
}

export default GridInQuestion; 