import type { AppsSeoListResult } from '../types';

const _log = console.log.bind(console, '[apps-api]');

/** localStorage flag the dev-only mock toggle writes (see `AppsMockToggle`). */
export const APPS_MOCK_FLAG = 'flows:apps-mock';

/**
 * Dev-only sample rows so the gallery can be styled without the live endpoint (dev returns 0
 * apps). Behind `import.meta.env.DEV`, so the whole function — and this data — is dead-code
 * eliminated from every production bundle. Real dev payload (2026-07-21).
 */
const getMockAppsSeo = (): AppsSeoListResult => ({
    aggr: [{ key: 'approved', val: 4 }],
    limit: 120,
    page: 0,
    total: 4,
    list: [
        {
            description: '[Flow] AIStudio WebApp : photo-figure-creator',
            id: '1018107',
            image: 'https://flow.eureka.codes/images/screenshot-light.jpg',
            lastmod: 1784538551308,
            siteName: 'AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            title: 'AIStudio App : photo-figure-creator | AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            type: 'website',
            url: 'https://flow-dev.eureka.codes/1018107',
        },
        {
            description: '[Flow] AIStudio WebApp : upload-processor-deploy',
            id: '1017950',
            image: 'https://flow.eureka.codes/images/screenshot-light.jpg',
            lastmod: 1784535478408,
            siteName: 'AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            title: 'AIStudio App : upload-processor-deploy | AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            type: 'website',
            url: 'https://flow-dev.eureka.codes/1017950',
        },
        {
            description: '[Flow] AIStudio WebApp : ai-image-stylist',
            id: '1017774',
            image: 'https://flow.eureka.codes/images/screenshot-light.jpg',
            lastmod: 1784538610853,
            siteName: 'AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            title: 'AIStudio App : ai-image-stylist | AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            type: 'website',
            url: 'https://flow-dev.eureka.codes/1017774',
        },
        {
            description: '[Flow] AIStudio WebApp : ai-content-banner-generator',
            id: '1017700',
            image: 'https://flow.eureka.codes/images/screenshot-light.jpg',
            lastmod: 1784538587845,
            siteName: 'AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            title: 'AIStudio App : ai-content-banner-generator | AI Visual 워크플로우(Workflow) / 유레카(Eureka) 플로우(Flow)',
            type: 'website',
            url: 'https://flow-dev.eureka.codes/1017700',
        },
    ],
});

/**
 * List deployed Apps as SEO metadata, for the public `/apps` gallery.
 * `GET {VITE_API_URL}/_seo_/apps/0/list?page=N`
 *
 * Hits the bare API base directly and unauthenticated — deliberately NOT through the shared
 * `api` client. The `_seo_` proxy resolves ONLY at the bare base: the client injects `/public`
 * (→ 404) or `/_api_` (→ 403). No `x-api-key` is sent, so a stray 403 can never clear a
 * signed-in user's key.
 *
 * Command is `list`, not `list-seo`: the server currently routes the SEO result under `list`;
 * `list-seo` is not wired yet. Flip the last path segment once the server connects it.
 */
export const listAppsSeo = async (page?: number): Promise<AppsSeoListResult> => {
    // `import.meta.env.DEV` is a literal `false` in prod builds, so this whole branch — and
    // `getMockAppsSeo` with it — is dead-code eliminated from every production bundle.
    if (import.meta.env.DEV && localStorage.getItem(APPS_MOCK_FLAG) === '1') {
        _log('> listAppsSeo() [DEV MOCK]');
        return getMockAppsSeo();
    }

    const base = `${import.meta.env.VITE_API_URL}/_seo_/apps/0/list`;
    const url = page != null ? `${base}?page=${page}` : base;
    _log(`> listAppsSeo(page=${page ?? 0}) → ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`listAppsSeo failed: HTTP ${response.status}`);
    return (await response.json()) as AppsSeoListResult;
};
