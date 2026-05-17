import { useState } from "react";
import { supabase } from "../supabase-client";
import { useNavigate } from "react-router-dom";

const STUDENT_CODE = import.meta.env.VITE_STUDENT_CODE as string;
const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE as string;

function getRoleFromCode(code: string): string | null {
    if (code === STUDENT_CODE) return "student";
    if (code === ADMIN_CODE) return "admin";
    return null;
}

function SignUpPage(){
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [fName, setFName] = useState("");
    const [lName, setLName] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    async function signUp(){
        setError("");

        if (!fName.trim() || !lName.trim() || !email.trim() || !password.trim() || !code.trim()) {
            setError("All fields are required.");
            return;
        }

        const role = getRoleFromCode(code);
        if (!role) {
            setError("Invalid signup code.");
            return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name: fName,
                    last_name: lName,
                    role,
                }
            }
        });

        if (signUpError) {
            setError(signUpError.message);
            return;
        }

        navigate("/");
    }

    return(
        <div className="flex flex-col fixed items-center justify-center w-full h-full gap-3">
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); signUp(); }}>
                <label>
                    <h3 className="md:text-xl text-sm">First name:</h3>
                    <input
                        type="text"
                        onChange={e => setFName(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Last name:</h3>
                    <input
                        type="text"
                        onChange={e => setLName(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Email:</h3>
                    <input
                        type="email"
                        onChange={e => setEmail(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Password:</h3>
                    <input
                        type="password"
                        onChange={e => setPassword(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                <label>
                    <h3 className="md:text-xl text-sm">Signup Code:</h3>
                    <input
                        type="password"
                        onChange={e => setCode(e.target.value)}
                        className="border border-black w-full"
                    />
                </label>
                {error && <p className="text-red-500 text-sm">{error}</p>}
            </form>
            <button
                type="button"
                className="flex items-center justify-center md:w-40 w-9 px-2 py-0.5 text-center text-xl text-black hover:bg-gray-100 rounded border transition-all"
                onClick={signUp}
            >
                Sign up
            </button>
        </div>
    );
}

export default SignUpPage;
