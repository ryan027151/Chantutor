import { useNavigate } from "react-router-dom";

interface TestTableRowProps {
  id: string;
  name: string;
  date: string;
  completed: boolean;
}

export default function TestTableRow({ id, name, date, completed }: TestTableRowProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold text-slate-900">{name}</h3>
        <p className="text-sm text-slate-500">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            completed
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {completed ? "Completed" : "In Progress"}
        </span>
        <button
          type="button"
          onClick={() => navigate(completed ? `/results/${id}` : `/mock/${id}`)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            completed
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          }`}
        >
          {completed ? "View" : "Continue"}
        </button>
      </div>
    </div>
  );
}
