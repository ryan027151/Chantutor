interface TestTableRowProps {
  name: string;
  date: string;
  completed: boolean; 
}

export default function TestTableRow({name, date, completed} : TestTableRowProps){
    return(
        <div className="flex justify-between bg-white p-3">
            <div className="flex flex-col">
                <h3 className="md:text-xl text-sm">{name}</h3>
                <p className="md:text-sm text-xs">{date}</p>
            </div>
            <button className="border bg-indigo-300 px-4 py-1 rounded-xl">
                {completed ? "View": "Continue"}
            </button>
        </div>
    );
}