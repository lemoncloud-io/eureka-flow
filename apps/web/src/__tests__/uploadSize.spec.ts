import { describe, expect, it } from 'vitest';

import {
    FileTooLargeError,
    MAX_UPLOAD_SIZE,
    MAX_UPLOAD_SIZE_MB,
    assertUploadSize,
    getUploadErrorMessage,
    processUploadedFile,
} from '../app/features/flows/utils';

const fileOfSize = (size: number): File => {
    const file = new File([''], 'upload.zip');
    Object.defineProperty(file, 'size', { value: size });
    return file;
};

const t = (key: string, options?: Record<string, unknown>): string =>
    options ? `${key}:${JSON.stringify(options)}` : key;

describe('assertUploadSize', () => {
    it('accepts a file under the limit', () => {
        expect(() => assertUploadSize(fileOfSize(MAX_UPLOAD_SIZE - 1))).not.toThrow();
    });

    it('rejects a file exactly at the limit', () => {
        expect(() => assertUploadSize(fileOfSize(MAX_UPLOAD_SIZE))).toThrow(FileTooLargeError);
    });

    it('rejects a file over the limit', () => {
        expect(() => assertUploadSize(fileOfSize(MAX_UPLOAD_SIZE + 1))).toThrow(FileTooLargeError);
    });
});

describe('processUploadedFile', () => {
    it('rejects an oversized file before reading it', async () => {
        await expect(
            processUploadedFile(
                fileOfSize(MAX_UPLOAD_SIZE),
                () => undefined,
                async dataUrl => dataUrl
            )
        ).rejects.toThrow(FileTooLargeError);
    });

    it('surfaces an image-processing failure instead of hanging', async () => {
        const image = new File(['x'], 'photo.png', { type: 'image/png' });
        const failingProcessImage = () => Promise.reject(new Error('decode failed'));

        await expect(processUploadedFile(image, () => undefined, failingProcessImage)).rejects.toThrow('decode failed');
    });
});

describe('getUploadErrorMessage', () => {
    it('reports the size limit for a size rejection', () => {
        const message = getUploadErrorMessage(new FileTooLargeError(), t);
        expect(message).toBe(`flows:detailPanel.fileTooLarge:{"size":${MAX_UPLOAD_SIZE_MB}}`);
    });

    it('reports a generic failure for any other error', () => {
        expect(getUploadErrorMessage(new Error('read failed'), t)).toBe('flows:detailPanel.uploadFailed');
    });
});
