import { useState } from "react";
import { supabase } from "../supabase-client";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";

function SignUpPage() {
  const [accountType, setAccountType] = useState<"student" | "parent" | "tutor">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function signUp() {
    setError("");
    if (!fName.trim() || !lName.trim() || !email.trim() || !password.trim() || !code.trim()) {
      setError("All fields are required.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-account", {
        body: { email, password, firstName: fName, lastName: lName, code, accountType },
      });
      if (fnError) {
        let msg = "Signup failed. Please try again.";
        try {
          // Supabase JS v2: non-2xx puts the response body on fnError.context
          const body = await (fnError as unknown as { context: Response }).context.json();
          if (body?.error) msg = body.error;
        } catch {}
        setError(msg);
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        navigate("/");
        return;
      }
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser) {
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", newUser.id).single();
        navigate(profile?.role === "parent" ? "/parent" : profile?.role === "tutor" ? "/tutor" : "/home");
      } else {
        navigate("/home");
      }
    } finally {
      setLoading(false);
    }
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
            <h1 className="brand-name text-5xl text-white mb-2">TestQueens</h1>
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
      <div className="flex flex-1 items-center justify-center bg-white p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col gap-6 py-4">
          <div className="flex md:hidden items-center gap-2 mb-2">
            <FontAwesomeIcon icon={faCrown} className="text-2xl text-amber-400" />
            <span className="brand-name text-2xl text-slate-900">TestQueens</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Create account</h2>
            <p className="text-slate-500 mt-1 text-sm">Fill in your details to get started.</p>
          </div>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); signUp(); }}>

            {/* Account type toggle */}
            <div>
              <span className="text-sm font-medium text-slate-700 block mb-1.5">I am a</span>
              <div className="grid grid-cols-3 gap-2">
                {(["student", "parent", "tutor"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setAccountType(type); setCode(""); setError(""); }}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                      accountType === type
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
              <span className="text-sm font-medium text-slate-700">
                {accountType === "parent" ? "Student's email address" : accountType === "tutor" ? "Tutor access code" : "Access code"}
              </span>
              <input
                type={accountType === "parent" ? "email" : "password"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={accountType === "parent" ? "student@example.com" : "Enter your access code"}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {accountType === "parent" && (
                <p className="text-xs text-slate-400">Enter your child's registered email address.</p>
              )}
            </label>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create Account"}
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
