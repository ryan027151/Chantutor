import { ReactNode } from "react";

export type TestStatus = "completed" | "in-progress";

export interface Test {
  id: number;
  name: string;
  date: string;
  score: number | null;
  status: TestStatus;
}

export interface NavItemData {
  label: string;
  icon: ReactNode;
}

export interface StatCard {
  label: string;
  value: string;
  sub: string;
  color: string;
}

export interface NavItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  iconOnly: boolean;
}

export interface SidebarBodyProps {
  activeNav: string;
  setActiveNav: (label: string) => void;
  navItems: NavItemData[];
  iconOnly: boolean;
  onClose?: () => void;
}