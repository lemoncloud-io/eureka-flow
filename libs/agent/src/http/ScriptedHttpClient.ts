import type { HttpClient, HttpRequestInput, HttpResponse } from './types';

export interface ScriptedHttpResponseInit {
    /** Defaults to 200. */
    status?: number;
    headers?: Record<string, string>;
    /** JSON body; also used for text() when no text is given. */
    json?: unknown;
    /** Raw text body; wins over json for text(). */
    text?: string;
}

/** Test double for the HTTP port: replies with scripted responses in order, records every request, and throws past the end of the script. */
export class ScriptedHttpClient implements HttpClient {
    readonly requests: HttpRequestInput[] = [];
    private readonly script: ScriptedHttpResponseInit[];

    constructor(script: ScriptedHttpResponseInit[] = []) {
        this.script = [...script];
    }

    async request(input: HttpRequestInput): Promise<HttpResponse> {
        this.requests.push(input);

        const next = this.script.shift();

        if (!next) {
            throw new Error(`ScriptedHttpClient: no scripted response for ${input.method} ${input.url}`);
        }

        const status = next.status ?? 200;
        const text = next.text ?? JSON.stringify(next.json ?? null);

        return {
            status,
            ok: status >= 200 && status < 300,
            headers: next.headers ?? {},
            json: async () => (next.json !== undefined ? next.json : JSON.parse(text)),
            text: async () => text,
        };
    }
}
