import TestTableRow from "./testTableRow";
import { Test } from "./types";

interface TestTableProps {
  tests: Test[] | null;
}

export default function TestTable({ tests }: TestTableProps) {
  return (
    <div className="flex flex-col gap-2">
      {!tests ? (
        <p className="text-gray-500">Loading tests...</p>
      ) : tests.length === 0 ? (
        <p className="text-gray-500">No tests found.</p>
      ) : (
        tests.map((test) => (
          <TestTableRow
            key={test.id}
            name={test.test_name}
            date={new Date(test.created_at).toLocaleDateString("en-US")}
            completed={test.score !== null}
          />
        ))
      )}
    </div>
  );
}