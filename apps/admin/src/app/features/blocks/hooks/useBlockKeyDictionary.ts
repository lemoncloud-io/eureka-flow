import { useQuery } from '@tanstack/react-query';

import { blockKeys } from './blockKeys';
import { fetchTranslation } from '../../i18n/consts';

/** The hint only needs one language to prove a key resolves. */
const DICTIONARY_LANGUAGE = 'ko';

/**
 * The `blocks` namespace the web app renders from, so the editor can tell an
 * operator whether the key they typed actually resolves. A mistyped key fails
 * silently at runtime — the web app just falls back to the original text — so
 * showing the translation here is the only place the mistake is visible.
 */
export const useBlockKeyDictionary = () =>
    useQuery({
        queryKey: [...blockKeys.all, 'dictionary', DICTIONARY_LANGUAGE],
        queryFn: () => fetchTranslation(DICTIONARY_LANGUAGE, 'blocks') as Promise<Record<string, string>>,
        staleTime: 5 * 60 * 1000,
        // The web app may not be running locally; a missing dictionary just hides the hint.
        retry: false,
    });
