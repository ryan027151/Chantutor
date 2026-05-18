import SideBar from "../components/sideBar";

export default function PerformancePage() {
  return (
    <div className="flex h-screen bg-slate-50">
      <SideBar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="bg-white border-b border-slate-100 px-8 py-4 shadow-sm shrink-0">
          <h1 className="text-xl font-bold text-slate-900">Performance</h1>
          <p className="text-sm text-slate-500">Your progress over time</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">Analytics coming soon</p>
            <p className="text-sm text-slate-400 max-w-xs">Score trends, subject breakdowns, and improvement insights will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
