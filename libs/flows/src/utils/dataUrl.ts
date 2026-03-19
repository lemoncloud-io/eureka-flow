/** Decode base64 data URL to text content */
export const decodeDataUrl = (dataUrl: string): string => {
    try {
        const base64 = dataUrl.split(',')[1];
        if (!base64) return dataUrl;
        return decodeURIComponent(
            Array.from(atob(base64), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
        );
    } catch {
        return dataUrl;
    }
};
