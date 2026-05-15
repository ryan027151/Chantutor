import { BlockquoteHTMLAttributes, ReactNode } from "react";
import { icons } from "../assets/icons";

export default function MockTextPopUp(props : {appear : boolean, children : ReactNode, setAppear : (appear : boolean) => void}){
    return (props.appear) ? (
        <div className="flex items-center justify-center w-full h-full fixed bg-gray-300/70">
            <div className="md:w-xl md:h-xl w-lg h-lg bg-white relative p-6 flex flex-col gap-2">
                <button className="absolute right-0 mx-6 hover:text-gray-400" onClick={() => props.setAppear(false)}>
                    {icons.exit}
                </button>
                {props.children}
            </div>
        </div>
    ) : "";
}