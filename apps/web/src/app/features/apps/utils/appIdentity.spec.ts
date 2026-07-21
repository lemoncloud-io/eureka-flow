import { describe, expect, it } from 'vitest';

import { deriveAppIdentity } from './appIdentity';

describe('deriveAppIdentity', () => {
    it('recovers slug and name from the verbose SEO title', () => {
        expect(
            deriveAppIdentity({ title: 'AIStudio App : photo-figure-creator | AI Visual 워크플로우(Workflow)' })
        ).toEqual({ slug: 'photo-figure-creator', name: 'Photo Figure Creator' });
    });

    it('keeps acronyms uppercase in the name', () => {
        expect(deriveAppIdentity({ title: 'AIStudio App : ai-image-stylist | x' }).name).toBe('AI Image Stylist');
        expect(deriveAppIdentity({ title: 'AIStudio App : ai-content-banner-generator | x' }).name).toBe(
            'AI Content Banner Generator'
        );
    });

    it('falls back to the description when the title has no slug', () => {
        expect(
            deriveAppIdentity({
                title: 'No slug here',
                description: '[Flow] AIStudio WebApp : upload-processor-deploy',
            })
        ).toEqual({ slug: 'upload-processor-deploy', name: 'Upload Processor Deploy' });
    });

    it('falls back to the id when nothing parseable is present', () => {
        expect(deriveAppIdentity({ id: '1018107' })).toEqual({ slug: '1018107', name: '1018107' });
    });
});
