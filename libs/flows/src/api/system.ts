import axios from 'axios';

import { API_URL } from '@flows/web-core';

import type { SystemInfo } from '../types';

/**
 * Fetch system info from backend
 * GET /flw-d1 or /flw-v1 (root endpoint, no /_apis or /_api_ suffix)
 *
 * Response format (plain text):
 * eureka-flows-api/0.26.227b
 * lemon-core/4.1.15
 *
 * @returns System info including component versions
 */
export const getSystemInfo = async (): Promise<SystemInfo> => {
    // Use API_URL directly (no endpoint path suffix needed for root)
    const baseUrl = API_URL;
    const response = await axios.get<string>(baseUrl, {
        responseType: 'text',
    });

    // Parse plain text response: "name/version" per line
    const components = response.data
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => {
            const [name, version] = line.split('/');
            return { name: name.trim(), version: version?.trim() || '' };
        });

    return { components };
};
