import { GitBranch, LayoutDashboard, Package, Users, Wrench } from 'lucide-react';

export interface NavItem {
    to: string;
    icon: React.ElementType;
    labelKey: string;
    fallback: string;
}

export const NAV_ITEMS: NavItem[] = [
    { to: '/', icon: LayoutDashboard, labelKey: 'navigator.dashboard', fallback: 'Dashboard' },
    { to: '/items', icon: Package, labelKey: 'navigator.items', fallback: 'Items' },
    { to: '/processes', icon: GitBranch, labelKey: 'navigator.processes', fallback: 'Processes' },
    { to: '/actors', icon: Users, labelKey: 'navigator.actors', fallback: 'Actors' },
    { to: '/tools', icon: Wrench, labelKey: 'navigator.tools', fallback: 'Tools' },
];
