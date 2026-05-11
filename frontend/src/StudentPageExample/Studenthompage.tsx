import { useState } from "react";

import { NavItemData, StatCard } from "./index.ts";
import { mockTests } from "./mockTests.ts";
import { icons } from "./icons.tsx";

import { SidebarBody } from "./SidebarBody.tsx";
import { MobileDrawer } from "./MobileDrawer.tsx";
import { MobileTopBar } from "./MobileTopBar.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { StatsGrid } from "./StatsGrid.tsx";
import { RecentTests } from "./RecentTests.tsx";

const NAV_ITEMS: NavItemData[] = [
  { label: "Home",        icon: icons.home        },
  { label: "Mock Tests",  icon: icons.tests       },
  { label: "Practice",    icon: icons.practice    },
  { label: "Performance", icon: icons.performance },
];

const STATS: StatCard[] = [
  { label: "Tests Completed", value: "24",      sub: "+3 this week",           color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  { label: "Avg. Score",      value: "87%",     sub: "↑ 4pts from last month", color: "bg-indigo-50 text-indigo-600 border-indigo-100"    },
  { label: "Practice Streak", value: "12 days", sub: "Keep it up!",            color: "bg-amber-50 text-amber-600 border-amber-100"       },
];

export default function StudentHomepage() {
  const [activeNav, setActiveNav]   = useState<string>("Home");
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const sharedSidebarProps = {
    activeNav,
    setActiveNav,
    navItems: NAV_ITEMS,
  };

  return (
    <div
      className="flex h-screen bg-slate-50 overflow-hidden"
      style={{ fontFamily: "'DM Sans','Helvetica Neue',sans-serif" }}
    >
      {/* ── DESKTOP: icon-only sidebar (md only) ── */}
      <aside className="hidden md:flex lg:hidden w-16 bg-white border-r border-slate-100 flex-col py-6 px-2 flex-shrink-0">
        <SidebarBody {...sharedSidebarProps} iconOnly={true} />
      </aside>

      {/* ── DESKTOP: full sidebar (lg+) ── */}
      <aside className="hidden lg:flex w-60 bg-white border-r border-slate-100 flex-col py-6 px-3 flex-shrink-0">
        <SidebarBody {...sharedSidebarProps} iconOnly={false} />
      </aside>

      {/* ── MOBILE: slide-in drawer ── */}
      {drawerOpen && (
        <MobileDrawer
          {...sharedSidebarProps}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">

        <MobileTopBar onMenuClick={() => setDrawerOpen(true)} />

        <div className="flex-1 px-4 sm:px-6 xl:px-10 py-6 sm:py-8 w-full max-w-5xl mx-auto lg:mx-0">

          <PageHeader
            studentName="Jordan Rivera"
            onNewTest={() => console.log("New test")}
          />

          <StatsGrid stats={STATS} />

          <RecentTests tests={mockTests} />

        </div>
      </main>
    </div>
  );
}