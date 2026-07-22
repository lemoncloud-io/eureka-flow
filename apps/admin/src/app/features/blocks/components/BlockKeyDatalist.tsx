import { useBlockKeyDictionary } from '../hooks';

/**
 * Suggestions shared by every `KeyInput` on the page. Mount this once — an
 * `id` must be unique for `<input list>` to resolve it, so a copy per input
 * would leave every copy but the first inert.
 */
export const BLOCK_KEY_LIST_ID = 'block-language-keys';

export const BlockKeyDatalist = () => {
    const { data: dictionary } = useBlockKeyDictionary();
    if (!dictionary) return null;

    return (
        <datalist id={BLOCK_KEY_LIST_ID}>
            {Object.entries(dictionary).map(([key, text]) => (
                <option key={key} value={key}>
                    {text}
                </option>
            ))}
        </datalist>
    );
};
