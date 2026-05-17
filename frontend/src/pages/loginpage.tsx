import { supabase } from "../supabase-client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function LoginPage(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    async function signIn(){
        setError("");
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
            setError("Invalid email or password.");
            return;
        }
        navigate("/home");
    }

    return(
        <div className="flex flex-col fixed items-center justify-center w-full h-full gap-3">
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); signIn(); }}>
                <label>
                    <h3 className="md:text-xl text-sm">Email:</h3>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Password:</h3>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                {error && <p className="text-red-500 text-sm">{error}</p>}
            </form>
            <button
                type="button"
                onClick={signIn}
                className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all"
            >
                Login
            </button>
            <button
                type="button"
                className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all"
                onClick={() => navigate("/signUp")}
            >
                Sign up
            </button>
        </div>
    );
}

export default LoginPage;
