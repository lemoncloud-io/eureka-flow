import { GitBranch, LayoutDashboard, Package, Users, Wrench } from 'lucide-react';

export interface NavItem {
    to: string;
    icon: React.ElementType;
    labelKey: string;
    fallback: string;
}

export interface NavGroup {
    labelKey: string;
    fallback: string;
    items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
    {
        labelKey: 'navigator.work',
        fallback: 'Work',
        items: [
            { to: '/dashboard', icon: LayoutDashboard, labelKey: 'navigator.dashboard', fallback: 'Dashboard' },
            { to: '/items', icon: Package, labelKey: 'navigator.items', fallback: 'Items' },
        ],
    },
    {
        labelKey: 'navigator.setup',
        fallback: 'Setup',
        items: [
            { to: '/processes', icon: GitBranch, labelKey: 'navigator.processes', fallback: 'Processes' },
            { to: '/tools', icon: Wrench, labelKey: 'navigator.tools', fallback: 'Tools' },
        ],
    },
];

/** Flat list derived from groups + actors route for header title matching */
export const NAV_ITEMS: NavItem[] = [
    ...NAV_GROUPS.flatMap(g => g.items),
    { to: '/actors', icon: Users, labelKey: 'navigator.actors', fallback: 'Actors' },
];
