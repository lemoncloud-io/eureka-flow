export const GITHUB_URL = 'https://github.com/lemoncloud-io/eureka-flow';

export const ROUTES = {
    DASHBOARD: '/dashboard',
    TUTORIAL: '/tutorial',
    EDITOR: '/editor',
    EXPLORE: '/flows',
    TERMS: '/policy/terms',
    PRIVACY: '/policy/privacy',
} as const;

const STAGGER_DELAY_MS = 100;

export const staggerStyle = (index: number): React.CSSProperties => ({
    animationDelay: `${STAGGER_DELAY_MS * index}ms`,
    opacity: 0,
});
