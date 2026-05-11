import { Test } from "./index.ts";
import { TestRow } from "./TestRow.tsx";

interface RecentTestsProps {
  tests: Test[];
}

export function RecentTests({ tests }: RecentTestsProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-700 mb-3 tracking-tight">Recent Tests</h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {tests.map((test: Test, i: number) => (
          <TestRow
            key={test.id}
            test={test}
            isLast={i === tests.length - 1}
          />
        ))}
      </div>
    </div>
  );
}