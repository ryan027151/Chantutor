import { ReactNode } from "react";
import { icons } from "../assets/icons";

export default function MockTextPopUp(props: {
  appear: boolean;
  children: ReactNode;
  setAppear: (appear: boolean) => void;
}) {
  if (!props.appear) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col gap-5 p-6 relative">
        <button
          type="button"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100"
          onClick={() => props.setAppear(false)}
        >
          {icons.exit}
        </button>
        {props.children}
      </div>
    </div>
  );
}
