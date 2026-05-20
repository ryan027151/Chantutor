import { supabase } from "../supabase-client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();

  async function sendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setForgotLoading(false);
    setForgotSent(true);
  }

  async function signIn() {
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("Invalid email or password.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      navigate(profile?.role === "admin" ? "/admin" : profile?.role === "parent" ? "/parent" : "/home");
    } else {
      navigate("/home");
    }
  }

  return (
    <div className="flex h-screen w-full">
      {/* Left panel — branding */}
      <div className="hidden md:flex md:w-2/5 bg-linear-to-br from-blue-700 to-blue-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-0 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          <FontAwesomeIcon icon={faCrown} className="text-6xl text-amber-300" />
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Chan Tutoring</h1>
            <p className="text-blue-200 text-lg leading-relaxed">
              Master the SHSAT with smart,<br />personalized practice.
            </p>
          </div>
          <div className="flex flex-col gap-3 mt-4 w-full max-w-xs text-left">
            {[
              "Adaptive diagnostic testing",
              "AI-powered performance insights",
              "Targeted practice by topic",
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
      <div className="flex flex-1 items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex md:hidden items-center gap-2 mb-2">
            <FontAwesomeIcon icon={faCrown} className="text-2xl text-amber-400" />
            <span className="text-xl font-bold text-slate-900">Chan Tutoring</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-slate-500 mt-1 text-sm">Sign in to continue your practice.</p>
          </div>
          {showForgot ? (
            /* ── Forgot password inline form ── */
            forgotSent ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Check your inbox</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    If <span className="font-medium text-slate-700">{forgotEmail}</span> has an account,
                    you'll receive a reset link shortly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={sendResetEmail}>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Forgot password?</h2>
                  <p className="text-slate-500 mt-1 text-sm">Enter your email and we'll send a reset link.</p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </label>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60"
                >
                  {forgotLoading ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="text-center text-sm text-slate-500 hover:text-slate-700"
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : (
            /* ── Normal sign-in form ── */
            <>
              <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); signIn(); }}>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </label>
                {error && (
                  <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  Sign In
                </button>
              </form>
              <p className="text-center text-sm text-slate-500">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/signUp")}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign up
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
