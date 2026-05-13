import { useState } from "react";
import { supabase } from "../supabase-client";
import { Link } from "react-router-dom";

function SignUpPage(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [token, setToken] = useState("");

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
        <form id="signUp">
                <label>
                    <h3>Email:</h3>
                    <input type="email" id="email" onChange={e => setEmail(e.target.value)}></input>
                    <br/>
                </label>
                <label>
                    <h3>Password:</h3>
                    <input type="password" id="password" onChange={e => setPassword(e.target.value)}></input>
                    <br/>
                </label>
                <label>
                    <h3>Token:</h3>
                    <input type="text" id="token" onChange={e => setToken(e.target.value)}></input>
                    <br/>
                </label>
                <br/>
                <Link to="/">
                    <button>Login</button>
                </Link>
                <br/>
                <button onClick={() => {signUp(email, password, token)}}>Sign up</button>

            </form>
    )
}

export default SignUpPage;