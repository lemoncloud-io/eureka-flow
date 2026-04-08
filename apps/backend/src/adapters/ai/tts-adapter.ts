export interface TtsRequest {
    text: string;
    voiceId?: string; // default: a stable multilingual voice
    modelId?: string;
}

export interface TtsResult {
    audioBuffer: Buffer;
    contentType: string;
    estimatedDurationSec: number;
}

export const ttsAdapter = {
    async synthesize(request: TtsRequest): Promise<TtsResult> {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

        const voiceId = request.voiceId || '21m00Tcm4TlvDq8ikWAM'; // default voice (Rachel)
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: request.text,
                model_id: request.modelId || 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => 'unknown');
            throw new Error(`ElevenLabs TTS error ${response.status}: ${err.slice(0, 200)}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        // Estimate: Korean ~4 chars/sec narration
        const estimatedDurationSec = Math.ceil(request.text.length / 4);

        return { audioBuffer: buffer, contentType: 'audio/mpeg', estimatedDurationSec };
    },
};
