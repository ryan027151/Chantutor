import TestTableRow from "./testTableRow";

interface TestTableProps {
  tests: [];
}


/* Can only implement after testing format/data storage in supabase is formalized*/
export default function TestTable({tests} : TestTableProps){
    return(
        <div className="flex flex-col gap-2">
            <h2 className="md:text-2xl text-xl">Recent Tests</h2>
                <TestTableRow name={"Test 1"} date={"05/12/2026"} completed={true}></TestTableRow>
        </div>
    );
}