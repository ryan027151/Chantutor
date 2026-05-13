import { useState } from "react";
import { supabase } from "../supabase-client";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

function SignUpPage(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [token, setToken] = useState("");
    const navigate = useNavigate();

    async function signUp(email: string, password: string, role: string){
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: 'John',
                    age: 27,
                }
    }
        })

        if (error) {
            console.log(error.message)
        } else {
            <Link to="/"></Link>
        }

    }

    return(

        <div className="flex flex-col fixed items-center justify-center border w-full h-full gap-3">
            <form id="signUp">
                    <label>
                        <h3 className="md:text-xl text-sm">Email:</h3>
                        <input type="email" id="email" onChange={e => setEmail(e.target.value)} className="border border-black"></input>
                        <br/>
                    </label>
                    <label>
                        <h3 className="md:text-xl text-sm">Password:</h3>
                        <input type="password" id="password" onChange={e => setPassword(e.target.value)} className="border border-black"></input>
                        <br/>
                    </label>
                    <label>
                        <h3 className="md:text-xl text-sm">Token:</h3>
                        <input type="text" id="token" onChange={e => setToken(e.target.value)} className="border border-black"></input>
                        <br/>
                    </label>
                

            </form>
            <button className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all" onClick={() => navigate("/")}>Login</button>
            <button className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all" onClick={() => {signUp(email, password, token)}}>Sign up</button>
       </div>
    );
}

export default SignUpPage;