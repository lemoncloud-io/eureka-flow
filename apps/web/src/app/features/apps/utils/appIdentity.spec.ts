import { describe, expect, it } from 'vitest';

import { deriveAppIdentity } from './appIdentity';

describe('deriveAppIdentity', () => {
    it('recovers slug, name and monogram from the verbose SEO title', () => {
        expect(
            deriveAppIdentity({ title: 'AIStudio App : photo-figure-creator | AI Visual 워크플로우(Workflow)' })
        ).toEqual({ slug: 'photo-figure-creator', name: 'Photo Figure Creator', monogram: 'PF' });
    });

    it('gives distinct monograms to apps that share a leading word, and keeps acronyms uppercase', () => {
        expect(deriveAppIdentity({ title: 'AIStudio App : ai-image-stylist | x' })).toMatchObject({
            name: 'AI Image Stylist',
            monogram: 'AI',
        });
        expect(deriveAppIdentity({ title: 'AIStudio App : ai-content-banner-generator | x' })).toMatchObject({
            name: 'AI Content Banner Generator',
            monogram: 'AC',
        });
    });

    it('falls back to the description when the title has no slug', () => {
        expect(
            deriveAppIdentity({
                title: 'No slug here',
                description: '[Flow] AIStudio WebApp : upload-processor-deploy',
            })
        ).toEqual({ slug: 'upload-processor-deploy', name: 'Upload Processor Deploy', monogram: 'UP' });
    });

    it('falls back to the id when nothing parseable is present', () => {
        expect(deriveAppIdentity({ id: '1018107' })).toEqual({ slug: '1018107', name: '1018107', monogram: '10' });
    });
});
