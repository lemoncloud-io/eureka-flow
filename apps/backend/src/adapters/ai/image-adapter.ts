import { log } from '../../utils/logger';

export interface ImageGenerationRequest {
    prompt: string;
    width?: number;
    height?: number;
    style?: string;
}

export interface ImageGenerationResult {
    imageUrl: string; // URL from provider (temporary)
    width: number;
    height: number;
}

export const imageAdapter = {
    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const apiKey = process.env.NANOBANANA_API_KEY;
        if (!apiKey) throw new Error('NANOBANANA_API_KEY not configured');

        const width = request.width || 1080;
        const height = request.height || 1920;

        log.info('NanoBanana image generation', { promptLength: request.prompt.length, width, height });

        const response = await fetch('https://api.nanobanana.com/v1/images/generate', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: request.prompt,
                width,
                height,
                style: request.style || 'realistic',
                num_images: 1,
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => 'unknown');
            throw new Error(`NanoBanana API error ${response.status}: ${errText.slice(0, 200)}`);
        }

        const data = (await response.json()) as { images?: Array<{ url: string }> };
        const imageUrl = data.images?.[0]?.url;
        if (!imageUrl) throw new Error('NanoBanana returned no image URL');

        return { imageUrl, width, height };
    },
};
