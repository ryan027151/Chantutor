import { ReactNode } from "react";

interface SideNavIconsProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

export default function SideNavIcons({ icon, label, onClick}: SideNavIconsProps) {
  return (
    <button className="flex items-center justify-start m-2 gap-3 md:w-40 w-9 px-2 py-2 text-center text-lg text-gray-500 hover:text-black hover:bg-gray-100 rounded hover:border transition-all " onClick={onClick}>
        {icon}
        <span>
            <p className="text-sm md:inline hidden">{label}</p>
        </span>
    </button>
  );
}