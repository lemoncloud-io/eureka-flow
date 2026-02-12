import { useCallback, useEffect, useRef, useState } from 'react';

const MESSAGE_TYPE = 'FLOW_API_KEY_RESPONSE';
const POPUP_CHECK_INTERVAL = 500;
const STATE_STORAGE_KEY = 'flow_api_key_popup_state';

interface ApiKeyMessage {
    type: typeof MESSAGE_TYPE;
    payload?: {
        apiKey: string;
        state: string;
    };
    error?: string;
}

interface UseApiKeyPopupOptions {
    codesUrl: string;
    onSuccess: (apiKey: string) => void;
    onError?: (error: string) => void;
}

interface UseApiKeyPopupReturn {
    openPopup: () => void;
    isLoading: boolean;
    error: string | null;
}

const generateState = (): string => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
};

export const useApiKeyPopup = ({ codesUrl, onSuccess, onError }: UseApiKeyPopupOptions): UseApiKeyPopupReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const popupRef = useRef<Window | null>(null);
    const intervalRef = useRef<number | null>(null);

    // Use refs to avoid useEffect re-running on callback changes
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;

    const clearPopupInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const openPopup = useCallback(() => {
        const state = generateState();
        sessionStorage.setItem(STATE_STORAGE_KEY, state);

        const currentOrigin = window.location.origin;
        const url = new URL(`${codesUrl}/openapi-keys`);
        url.searchParams.set('callback', 'flow');
        url.searchParams.set('state', state);
        url.searchParams.set('origin', currentOrigin);

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        popupRef.current = window.open(
            url.toString(),
            'codes_api_key_popup',
            `width=${width},height=${height},left=${left},top=${top},toolbar=0,scrollbars=1,status=1,resizable=1,location=1,menuBar=0`
        );

        if (!popupRef.current) {
            setError('팝업이 차단되었습니다. 팝업 차단을 해제해 주세요.');
            onErrorRef.current?.('Popup blocked');
            sessionStorage.removeItem(STATE_STORAGE_KEY);
            return;
        }

        setIsLoading(true);
        setError(null);

        intervalRef.current = window.setInterval(() => {
            if (popupRef.current?.closed) {
                clearPopupInterval();
                setIsLoading(false);
            }
        }, POPUP_CHECK_INTERVAL);
    }, [codesUrl, clearPopupInterval]);

    useEffect(() => {
        if (!codesUrl) {
            return;
        }

        const codesOrigin = new URL(codesUrl).origin;

        const handleMessage = (event: MessageEvent<ApiKeyMessage>) => {
            if (event.origin !== codesOrigin) {
                return;
            }

            if (!event.data || event.data.type !== MESSAGE_TYPE) {
                return;
            }

            // Clear interval and close popup
            clearPopupInterval();
            popupRef.current?.close();
            setIsLoading(false);

            if (event.data.error) {
                sessionStorage.removeItem(STATE_STORAGE_KEY);
                setError(event.data.error);
                onErrorRef.current?.(event.data.error);
                return;
            }

            if (!event.data.payload) {
                sessionStorage.removeItem(STATE_STORAGE_KEY);
                setError('Invalid response from Codes');
                onErrorRef.current?.('Invalid response');
                return;
            }

            // Validate state from sessionStorage
            const expectedState = sessionStorage.getItem(STATE_STORAGE_KEY);
            sessionStorage.removeItem(STATE_STORAGE_KEY);

            if (event.data.payload.state !== expectedState) {
                setError('State mismatch - possible security issue');
                onErrorRef.current?.('State mismatch');
                return;
            }

            onSuccessRef.current(event.data.payload.apiKey);
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [codesUrl, clearPopupInterval]);

    useEffect(() => {
        return () => {
            clearPopupInterval();
            if (popupRef.current && !popupRef.current.closed) {
                popupRef.current.close();
            }
        };
    }, [clearPopupInterval]);

    return {
        openPopup,
        isLoading,
        error,
    };
};
