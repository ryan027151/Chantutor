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
        <>
            <form id="login">
                <label>
                    <h3>Email:</h3>
                    <input type="email" onChange={e => setEmail(e.target.value)}></input>
                    <br/>
                </label>
                <label>
                    <h3>Password:</h3>
                    <input type="password" onChange={e => setPassword(e.target.value)}></input>
                    <br/>
                </label>
                <br/>
                <button onClick={() => {
                    signIn(email, password);
                    if (success){
                        navigate("/home");
                    }
                    }}>Login</button>
                <br/>
                <Link to="/signUp">
                    <button>Sign up</button>
                </Link>
            </form>

        </>
    )
}

export default LoginPage;