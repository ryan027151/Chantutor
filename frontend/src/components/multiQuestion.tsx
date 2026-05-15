import { useState } from "react";
import {icons} from "../assets/icons.tsx"
import { supabase } from "../supabase-client";

function MCQuestion(props : {option1: string, option2: string, option3: string, option4: string, chosenAnswer : (answer : string) => void}){
    

    return (
        <div className="flex flex-rol w-auto flex-start">
            <form>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option1} onChange={(e) => props.chosenAnswer(e.target.value[0])}></input>
                    {props.option1}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option2} onChange={(e) => props.chosenAnswer(e.target.value[0])}></input>
                    {props.option2}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option3} onChange={(e) => props.chosenAnswer(e.target.value[0])}></input>
                    {props.option3}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option4} onChange={(e) => props.chosenAnswer(e.target.value[0])}></input>
                    {props.option4}
                </label>
            </form>
        </div>
        
    
    )
}

export default MCQuestion;    