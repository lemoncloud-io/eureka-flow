/**
 * `?desktop=1` URL override controls.
 *
 * Mobile-sized devices can opt into the desktop editor via the `desktop=1` query param.
 * Toggling the param triggers a full reload so the FlowEditorRouter re-evaluates its
 * `useIsMobile` decision against the new URL.
 */

export const hasDesktopOverride = (): boolean => new URLSearchParams(window.location.search).get('desktop') === '1';

export const enableDesktopOverride = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('desktop', '1');
    window.location.href = url.toString();
};

export const disableDesktopOverride = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete('desktop');
    window.location.href = url.toString();
};
