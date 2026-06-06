import { BILLING_URL } from '@flows/web-core';

/**
 * Credit-charge deep-link to the billing app. flow never embeds payment — it
 * opens billing in a new tab carrying only `from` + `return_to` (no identity;
 * billing authenticates the user itself). See docs/adr/0001-flow-billing-deeplink.md.
 *
 * `isEnabled` is false when VITE_BILLING_URL is unset (open-source self-hosters),
 * so callers can hide the entry point entirely.
 */
export const useBillingCharge = () => {
    const isEnabled = !!BILLING_URL;

    const charge = () => {
        if (!isEnabled) return;
        const url = new URL(BILLING_URL);
        url.searchParams.set('from', 'flow');
        url.searchParams.set('return_to', window.location.href);
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
    };

    return { isEnabled, charge };
};
