import {
  LayoutDashboardIcon,
  InboxIcon,
  BrainCircuitIcon,
  UsersIcon,
  BellIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Utama",
    items: [{ href: "/dashboard", label: "Carta", icon: LayoutDashboardIcon }],
  },
  {
    heading: "Pengurusan",
    items: [
      { href: "/complaints", label: "Aduan", icon: InboxIcon, permission: "complaint:view" },
      { href: "/notifications", label: "Pemberitahuan", icon: BellIcon, permission: "complaint:view" },
      { href: "/runs", label: "AI & Carian", icon: BrainCircuitIcon, permission: "analytics:view" },
    ],
  },
  {
    heading: "Pentadbiran",
    items: [
      { href: "/users", label: "Pengguna", icon: UsersIcon, permission: "users:manage" },
      { href: "/audit", label: "Audit Log", icon: ScrollTextIcon, permission: "audit:view" },
    ],
  },
];

export function visibleNavGroups(permissions: string[]): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);
}

export const ROLE_ICON: LucideIcon = ShieldCheckIcon;
