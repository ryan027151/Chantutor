import { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import { UserContext } from "../components/userContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrown } from "@fortawesome/free-solid-svg-icons";
import AdminStudentsPanel from "../components/AdminStudentsPanel";
import AdminReportsPanel from "../components/AdminReportsPanel";

type Tab = "students" | "reports";

const ICON_USERS = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ICON_FLAG = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-9.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
  </svg>
);

const ICON_SIGNOUT = (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

function NavItem({ label, active, onClick, icon, badge }: {
  label: string; active: boolean; onClick: () => void; icon: React.ReactNode; badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex items-center justify-center lg:justify-start gap-3 px-2 lg:px-3 py-2.5 rounded-lg text-base font-medium transition-all w-full text-left border ${
        active
          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
          : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 border-transparent"
      }`}
    >
      {icon}
      <span className="flex-1 hidden lg:inline">{label}</span>
      {badge != null && badge > 0 && (
        <span className="text-xs font-bold bg-rose-500 text-white rounded-full px-1.5 py-0.5 min-w-5 text-center leading-none hidden lg:block">
          {badge}
        </span>
      )}
    </button>
  );
}

export default function TutorPage() {
  const [tab, setTab] = useState<Tab>("students");
  const [pendingReports, setPendingReports] = useState(0);
  const navigate = useNavigate();
  const user = useContext(UserContext);

  function refreshPendingReports() {
    supabase
      .from("question_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => setPendingReports(count ?? 0));
  }

  useEffect(() => { refreshPendingReports(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
    <div className="flex h-screen bg-white text-zinc-800 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-10 lg:w-56 shrink-0 flex flex-col bg-white border-r border-zinc-200">
        {/* Logo */}
        <div className="px-2 lg:px-5 py-5 border-b border-zinc-200">
          <div className="flex items-center justify-center lg:justify-start gap-2.5">
            <FontAwesomeIcon icon={faCrown} className="text-amber-400 text-lg shrink-0" />
            <div className="min-w-0 hidden lg:block">
              <p className="brand-name text-lg text-zinc-900 leading-tight">TestQueens</p>
              <p className="text-sm text-zinc-400 font-medium">Tutor Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 lg:p-3 flex flex-col gap-0.5">
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest px-2 py-2 hidden lg:block">Management</p>
          <NavItem label="Students" active={tab === "students"} onClick={() => setTab("students")} icon={ICON_USERS} />
          <NavItem label="Reports"  active={tab === "reports"}  onClick={() => setTab("reports")}  icon={ICON_FLAG} badge={pendingReports} />
        </nav>

        {/* User card + sign out */}
        <div className="p-2 lg:p-3 border-t border-zinc-200 flex flex-col gap-1.5">
          <div className="hidden lg:block px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
            <p className="text-sm text-zinc-400 mb-0.5">Signed in as</p>
            <p className="text-base font-semibold text-zinc-900 leading-tight">{user?.first_name} {user?.last_name}</p>
            <span className="text-sm text-amber-500 font-medium">Tutor</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign Out"
            className="flex items-center justify-center lg:justify-start gap-2.5 px-2 lg:px-3 py-2 rounded-lg text-base text-zinc-400 hover:text-red-500 hover:bg-zinc-100 transition-colors w-full"
          >
            {ICON_SIGNOUT}
            <span className="hidden lg:inline">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {tab === "students" && <AdminStudentsPanel isAdmin={false} />}
        {tab === "reports" && (
          <AdminReportsPanel
            isAdmin={false}
            onEditQuestion={() => {}}
            onReportResolved={refreshPendingReports}
          />
        )}
      </main>
    </div>
  );
}
