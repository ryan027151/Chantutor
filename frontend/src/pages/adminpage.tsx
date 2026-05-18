import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";
import AdminStudentsPanel from "../components/AdminStudentsPanel";
import AdminQuestionsPanel from "../components/AdminQuestionsPanel";

type Tab = "students" | "questions";

const ICON_USERS = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ICON_BOOK = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const ICON_SIGNOUT = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

function NavItem({ label, active, onClick, icon }: {
  label: string; active: boolean; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left border ${
        active
          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("students");
  const navigate = useNavigate();
  const user = useContext(UserContext);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col bg-zinc-950 border-r border-zinc-800/80">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <FontAwesomeIcon icon={faCrown} className="text-amber-400 text-base shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight tracking-tight">Chan Tutoring</p>
              <p className="text-xs text-zinc-600 font-medium">Admin Console</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          <p className="text-xs font-bold text-zinc-700 uppercase tracking-widest px-2 py-2">Management</p>
          <NavItem label="Students" active={tab === "students"} onClick={() => setTab("students")} icon={ICON_USERS} />
          <NavItem label="Question Bank" active={tab === "questions"} onClick={() => setTab("questions")} icon={ICON_BOOK} />
        </nav>

        {/* User card + sign out */}
        <div className="p-3 border-t border-zinc-800/80 flex flex-col gap-1.5">
          <div className="px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
            <p className="text-xs text-zinc-600 mb-0.5">Signed in as</p>
            <p className="text-sm font-semibold text-white leading-tight">{user?.first_name} {user?.last_name}</p>
            <span className="text-xs text-amber-500 font-medium">Administrator</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 transition-colors w-full"
          >
            {ICON_SIGNOUT}
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {tab === "students" ? <AdminStudentsPanel /> : <AdminQuestionsPanel />}
      </main>
    </div>
  );
}
