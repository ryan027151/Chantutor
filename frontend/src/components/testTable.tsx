import TestTableRow from "./testTableRow";
import { Test } from "./types";

interface TestTableProps {
  tests: Test[] | null;
}

export default function TestTable({ tests }: TestTableProps) {
  return (
    <div className="flex flex-col gap-3">
      {!tests ? (
        <p className="text-slate-500 text-sm">Loading tests...</p>
      ) : tests.length === 0 ? (
        <p className="text-slate-500 text-sm">No tests yet. Take your first test!</p>
      ) : (
        tests.map((test) => (
          <TestTableRow
            key={test.id}
            id={test.id}
            name={test.test_name}
            date={new Date(test.created_at).toLocaleDateString("en-US")}
            completed={test.score !== null}
            score={test.score}
          />
        ))
      )}
    </div>
  );
}
