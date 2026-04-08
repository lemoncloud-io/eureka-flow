export interface VideoCompositionRequest {
    images: Array<{ url: string; durationSec: number }>;
    audioUrl?: string;
    outputWidth: number;
    outputHeight: number;
    outputFormat: 'mp4';
}

export interface VideoCompositionResult {
    videoBuffer: Buffer;
    durationSec: number;
    sizeBytes: number;
}

export const ffmpegAdapter = {
    async compose(request: VideoCompositionRequest): Promise<VideoCompositionResult> {
        // Phase 4C: Generate a minimal valid MP4 placeholder.
        // Real FFmpeg integration requires a Lambda Layer with an ffmpeg binary.
        // This placeholder is structurally valid (recognized as MP4) but contains no playable content.

        const durationSec = request.images.reduce((sum, img) => sum + img.durationSec, 0);
        const placeholder = createMinimalMp4Placeholder();

        return {
            videoBuffer: placeholder,
            durationSec,
            sizeBytes: placeholder.length,
        };
    },
};

function createMinimalMp4Placeholder(): Buffer {
    // Minimal valid MP4: ftyp box + empty moov box.
    // Recognized by file-type libraries as MP4 but won't render meaningful content.
    const ftyp = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x1c, // box size (28 bytes)
        0x66,
        0x74,
        0x79,
        0x70, // 'ftyp'
        0x69,
        0x73,
        0x6f,
        0x6d, // 'isom' — major brand
        0x00,
        0x00,
        0x02,
        0x00, // minor version
        0x69,
        0x73,
        0x6f,
        0x6d, // 'isom' — compatible brand
        0x69,
        0x73,
        0x6f,
        0x32, // 'iso2'
        0x6d,
        0x70,
        0x34,
        0x31, // 'mp41'
    ]);
    const moov = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x08, // box size (8 bytes, empty moov)
        0x6d,
        0x6f,
        0x6f,
        0x76, // 'moov'
    ]);
    return Buffer.concat([ftyp, moov]);
}
