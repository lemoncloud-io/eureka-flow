import { GitBranch, Package, Users, Wrench } from 'lucide-react';

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
    collapsible?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
    {
        labelKey: 'navigator.work',
        fallback: 'Work',
        items: [{ to: '/items', icon: Package, labelKey: 'navigator.items', fallback: 'Items' }],
    },
    {
        labelKey: 'navigator.setup',
        fallback: 'Setup',
        collapsible: true,
        items: [
            { to: '/processes', icon: GitBranch, labelKey: 'navigator.processes', fallback: 'Processes' },
            { to: '/tools', icon: Wrench, labelKey: 'navigator.tools', fallback: 'Tools' },
            { to: '/actors', icon: Users, labelKey: 'navigator.actors', fallback: 'Actors' },
        ],
    },
];

/** Flat list derived from groups for header title matching */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);
