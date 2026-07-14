import { describe, expect, it } from 'vitest';

import { getUploadHtmlProduct } from '../app/features/flows/utils';

import type { DataPacket, DataType } from '@lemoncloud/eureka-flows-api';

const packet = (type: DataType, value: unknown): DataPacket => ({ type, value });

const PRODUCT = {
    id: '1017866',
    name: 'Admin Run Cost Dashboard',
    region: 'Asia Pacific (Seoul)',
    workspaceId: '1005802',
    workspace$: { id: '1005802', code: '@1005802', name: 'default', stereo: 'basic' },
    progress$: { state: 'github', status: 'success', msg: 'Source code downloaded successfully.' },
    website: 'https://flow.eureka.codes/apps/1017866',
};

describe('getUploadHtmlProduct', () => {
    it('recognizes a product packet', () => {
        expect(getUploadHtmlProduct(packet('json', PRODUCT))).toEqual(PRODUCT);
    });

    it('recognizes a mock run, which carries only a website', () => {
        const mock = { website: 'https://flow.eureka.codes/apps/1017866' };
        expect(getUploadHtmlProduct(packet('json', mock))).toEqual(mock);
    });

    it('recognizes a product carried as a JSON string', () => {
        expect(getUploadHtmlProduct(packet('text', JSON.stringify(PRODUCT)))).toEqual(PRODUCT);
    });

    it('ignores JSON without a website', () => {
        expect(getUploadHtmlProduct(packet('json', { id: '1017866', name: 'No website here' }))).toBeNull();
    });

    it('ignores plain text, null values and missing packets', () => {
        expect(getUploadHtmlProduct(packet('text', 'https://flow.eureka.codes/apps/1017866'))).toBeNull();
        expect(getUploadHtmlProduct(packet('json', null))).toBeNull();
        expect(getUploadHtmlProduct(null)).toBeNull();
        expect(getUploadHtmlProduct(undefined)).toBeNull();
    });

    it('ignores an empty website', () => {
        expect(getUploadHtmlProduct(packet('json', { id: '1017866', website: '' }))).toBeNull();
    });
});
