/**
 * ApiKeyGate — Self-contained API key gate component.
 *
 * Injected by `scripts/inject-api-key-gate.sh` into sample React apps.
 * Blocks app content until the user provides an `x-api-key` via localStorage.
 *
 * Requirements:
 *   - Pure React (no external dependencies)
 *   - Inline styles only (theme-agnostic)
 *   - Self-contained in a single file
 *
 * Usage in other code:
 *   The stored key can be read via `localStorage.getItem('x-api-key')`.
 *   To inject it into API calls, add it as a header:
 *     fetch(url, { headers: { 'x-api-key': localStorage.getItem('x-api-key') ?? '' } })
 */

import React, { useState } from 'react';

const STORAGE_KEY = 'x-api-key';

const getStoredKey = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

const setStoredKey = (key: string): void => {
    try {
        localStorage.setItem(STORAGE_KEY, key);
    } catch (e) {
        console.warn('[ApiKeyGate] Failed to save key to localStorage:', e);
    }
};

// --- Inline SVG icons (no lucide dependency) ---

const EyeIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
        <path d="m2 2 20 20" />
    </svg>
);

const ExternalLinkIcon = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
);

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: '28px 24px',
        width: '100%',
        maxWidth: 400,
        margin: '0 16px',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 600,
        color: '#111827',
    },
    description: {
        margin: '6px 0 0',
        fontSize: 13,
        color: '#6b7280',
        lineHeight: 1.4,
    },
    inputWrapper: {
        position: 'relative',
        marginTop: 16,
    },
    input: {
        width: '100%',
        height: 44,
        padding: '0 40px 0 12px',
        fontSize: 14,
        border: '1px solid #d1d5db',
        borderRadius: 8,
        outline: 'none',
        color: '#111827',
        backgroundColor: '#ffffff',
        boxSizing: 'border-box',
    },
    eyeButton: {
        position: 'absolute',
        right: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        color: '#9ca3af',
        display: 'flex',
        alignItems: 'center',
    },
    submitButton: {
        width: '100%',
        height: 44,
        marginTop: 12,
        border: 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
    },
    linkButton: {
        width: '100%',
        height: 44,
        marginTop: 8,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        backgroundColor: '#ffffff',
        color: '#374151',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        textDecoration: 'none',
    },
    hint: {
        marginTop: 12,
        fontSize: 11,
        color: '#9ca3af',
        textAlign: 'center',
        lineHeight: 1.4,
    },
};

// --- Component ---

const CODES_URL =
    ((window as Record<string, unknown>).CODES_URL as string | undefined) || 'https://console.eureka.codes';

export const ApiKeyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(() => !!getStoredKey());
    const [apiKey, setApiKey] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const isSubmitDisabled = !apiKey.trim();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = apiKey.trim();
        if (!trimmed) return;
        setStoredKey(trimmed);
        setIsAuthenticated(true);
    };

    if (isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <>
            {children}
            <div style={styles.backdrop}>
                <div style={styles.card}>
                    <h2 style={styles.title}>API Key Required</h2>
                    <p style={styles.description}>Enter your Eureka Codes API key to start building workflows.</p>

                    <form onSubmit={handleSubmit}>
                        <div style={styles.inputWrapper}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Enter API key"
                                value={apiKey}
                                onChange={e => setApiKey(e.target.value)}
                                style={styles.input}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(prev => !prev)}
                                style={styles.eyeButton}
                                aria-label={showPassword ? 'Hide API key' : 'Show API key'}
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitDisabled}
                            style={{
                                ...styles.submitButton,
                                backgroundColor: isSubmitDisabled ? '#d1d5db' : '#8B5CF6',
                                color: isSubmitDisabled ? '#9ca3af' : '#ffffff',
                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Continue
                        </button>
                    </form>

                    <a
                        href={`${CODES_URL}/codes-keys`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.linkButton}
                    >
                        <ExternalLinkIcon />
                        Get Free Key from Codes
                    </a>

                    <p style={styles.hint}>Don't have a key? Click above to create one for free from Eureka Codes.</p>
                </div>
            </div>
        </>
    );
};
