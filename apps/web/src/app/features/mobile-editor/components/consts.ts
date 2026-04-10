import type { PortStyleKey } from '../../flows/utils';

/** Port type → Tailwind dot color class. Shared between MobileNodeCard and MobileConnectionSheet. */
export const TYPE_DOT: Record<PortStyleKey, string> = {
    text: 'bg-port-type-text',
    image: 'bg-port-type-image',
    number: 'bg-port-type-number',
    json: 'bg-port-type-json',
    any: 'bg-port-type-any',
};
