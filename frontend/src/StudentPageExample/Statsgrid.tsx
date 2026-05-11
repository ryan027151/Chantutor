import { StatCard } from ".";

interface StatsGridProps {
  stats: StatCard[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
      {stats.map((stat: StatCard) => (
        <div
          key={stat.label}
          className={`rounded-2xl border p-4 sm:p-5 flex sm:block items-center gap-4 ${stat.color}`}
        >
          <p className="text-2xl font-bold leading-none sm:mb-1">{stat.value}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
              {stat.label}
            </p>
            <p className="text-xs opacity-60 mt-0.5">{stat.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}