import { useState } from "react";
import { supabase } from "../supabase-client";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";

const STUDENT_CODE = import.meta.env.VITE_STUDENT_CODE as string;
const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE as string;

function getRoleFromCode(code: string): string | null {
  if (code === STUDENT_CODE) return "student";
  if (code === ADMIN_CODE) return "admin";
  return null;
}

function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function signUp() {
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
      options: { data: { first_name: fName, last_name: lName, role } },
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    navigate("/");
  }

  return (
    <div className="flex h-screen w-full">
      {/* Left panel — branding */}
      <div className="hidden md:flex md:w-2/5 bg-linear-to-br from-blue-700 to-blue-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-white/5" />
        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          <FontAwesomeIcon icon={faCrown} className="text-6xl text-amber-300" />
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Chan Tutoring</h1>
            <p className="text-blue-200 text-lg leading-relaxed">
              Join students preparing<br />for SHSAT success.
            </p>
          </div>
          <div className="flex flex-col gap-3 mt-4 w-full max-w-xs text-left">
            {[
              "Get a personalized diagnostic baseline",
              "Practice questions organized by topic",
              "Track your progress over time",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2 text-blue-100 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-white p-8 overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col gap-6 py-4">
          <div className="flex md:hidden items-center gap-2 mb-2">
            <FontAwesomeIcon icon={faCrown} className="text-2xl text-amber-400" />
            <span className="text-xl font-bold text-slate-900">Chan Tutoring</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Create account</h2>
            <p className="text-slate-500 mt-1 text-sm">Fill in your details to get started.</p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); signUp(); }}>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">First name</span>
                <input
                  type="text"
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Jane"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">Last name</span>
                <input
                  type="text"
                  onChange={(e) => setLName(e.target.value)}
                  placeholder="Doe"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Signup code</span>
              <input
                type="password"
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter your access code"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </label>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors mt-1"
            >
              Create Account
            </button>
          </form>
          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
