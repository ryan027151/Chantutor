import SideBar from "../components/sideBar";

export default function PracticePage() {
  return (
    <div className="flex h-screen bg-slate-50">
      <SideBar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="bg-white border-b border-slate-100 px-8 py-4 shadow-sm shrink-0">
          <h1 className="text-xl font-bold text-slate-900">Practice</h1>
          <p className="text-sm text-slate-500">Topic-based question sets</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">Practice coming soon</p>
            <p className="text-sm text-slate-400 max-w-xs">Topic-based practice sets organized by subject and difficulty will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
