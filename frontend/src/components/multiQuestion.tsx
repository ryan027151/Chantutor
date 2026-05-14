import { useState } from "react";
import {icons} from "../assets/icons.tsx"
import { supabase } from "../supabase-client";

function MCQuestion(props : {option1: string, option2: string, option3: string, option4: string, chosenAnswer : (answer : string) => void}){
    
    const handleSubmit = async (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const selected = formData.get("options");
        if (typeof selected === "string") {
            props.chosenAnswer(selected);
        }

        const { data, error } = await supabase.from('tests').insert([{id : 1, user_id: 1, test_name : "test1", score : 2}])

        if (error) {
            console.log("Answer not submitted")
            return;
        }
    };

    return (
        <div className="flex flex-rol w-auto flex-start">
            <form onSubmit={handleSubmit}>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option1}></input>
                    {props.option1}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option2}></input>
                    {props.option2}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option3}></input>
                    {props.option3}
                </label>
                <label className="flex flex-row justify-start gap-2">
                    <input type="radio" name="options" value={props.option4}></input>
                    {props.option4}
                </label>
                <button className="bg-white border shadow-md px-3 py-1.5 hover:bg-blue-300 rounded-md rounded-l-none" type="submit">
                    {icons.arrowRight}
                </button>
            </form>
        </div>
        
    
    )
}

export default MCQuestion;    