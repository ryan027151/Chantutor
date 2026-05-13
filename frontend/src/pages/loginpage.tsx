import { Link } from "react-router-dom";
import { supabase } from "../supabase-client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 
gonna need to ensure that is good security later down the road
need to return error messages and such when password is incorrect, email is invalid, and etc*/
function LoginPage(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();


    async function signIn(email: string, password: string){
        const {error, data} = await supabase.auth.signInWithPassword({email, password});

        if (error){
            return console.error(error);
        } 

        setSuccess(true);
    }


    return(
        <div className="flex flex-col fixed items-center justify-center border w-full h-full gap-3">
            <form>
                <label>
                    <h3 className="md:text-xl text-sm">Email:</h3>
                    <input type="email" onChange={e => setEmail(e.target.value)} className="border border-black"></input>
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Password:</h3>
                    <input type="password" onChange={e => setPassword(e.target.value)} className="border border-black"></input>
                </label>
            </form>
            
            <button onClick={() => {
                signIn(email, password);
                if (success){
                    navigate("/home");
                } else {
                    console.log("Wrong Password!!!")
                }
                }} className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all">Login</button>
            
            <button className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all" onClick={() => navigate("/signUp")}>Sign up</button>
        </div>
    )
}

export default LoginPage;