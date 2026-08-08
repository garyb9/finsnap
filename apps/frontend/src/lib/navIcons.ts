import {
  Activity,
  BookOpen,
  Grid3x3,
  Layers,
  LayoutDashboard,
  LineChart,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/strategies', label: 'Strategies', icon: ListChecks },
  { href: '/options', label: 'Options', icon: Layers },
  { href: '/chart', label: 'Chart', icon: LineChart },
  { href: '/technicals', label: 'Technicals', icon: Activity },
  { href: '/correlation', label: 'Correlation', icon: Grid3x3 },
  { href: '/guide', label: 'Guide', icon: BookOpen },
];
