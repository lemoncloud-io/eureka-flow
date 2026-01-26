const { join } = require('path');

const { createGlobPatternsForDependencies } = require('@nx/react/tailwind');

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
        join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
        ...createGlobPatternsForDependencies(__dirname),
    ],
    prefix: '',
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px',
            },
        },
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                /* Point color (alias for primary - used in UI kit) */
                point: 'hsl(var(--point))',
                /* Semantic State Colors */
                success: {
                    DEFAULT: 'hsl(var(--success))',
                    foreground: 'hsl(var(--success-foreground))',
                },
                warning: {
                    DEFAULT: 'hsl(var(--warning))',
                    foreground: 'hsl(var(--warning-foreground))',
                },
                info: {
                    DEFAULT: 'hsl(var(--info))',
                    foreground: 'hsl(var(--info-foreground))',
                },
                /* Status Colors for Flow Editor */
                status: {
                    running: 'hsl(var(--status-running))',
                    'running-bg': 'hsl(var(--status-running-bg))',
                    'running-border': 'hsl(var(--status-running-border))',
                    completed: 'hsl(var(--status-completed))',
                    'completed-bg': 'hsl(var(--status-completed-bg))',
                    'completed-border': 'hsl(var(--status-completed-border))',
                    error: 'hsl(var(--status-error))',
                    'error-bg': 'hsl(var(--status-error-bg))',
                    'error-border': 'hsl(var(--status-error-border))',
                },
                /* Flow Editor Semantic Colors */
                surface: {
                    DEFAULT: 'hsl(var(--surface))',
                    elevated: 'hsl(var(--surface-elevated))',
                    overlay: 'hsl(var(--surface-overlay))',
                },
                canvas: 'hsl(var(--canvas-bg))',
                node: {
                    bg: 'hsl(var(--node-bg))',
                    border: 'hsl(var(--node-border))',
                    header: 'hsl(var(--node-header))',
                },
                sidebar: 'hsl(var(--sidebar-bg))',
                header: 'hsl(var(--header-bg))',
                toolbar: 'hsl(var(--toolbar-bg))',
                connection: {
                    DEFAULT: 'hsl(var(--connection-line))',
                    active: 'hsl(var(--connection-active))',
                },
                port: {
                    empty: 'hsl(var(--port-empty))',
                    input: 'hsl(var(--port-filled-input))',
                    output: 'hsl(var(--port-filled-output))',
                    text: 'hsl(var(--port-type-text))',
                    image: 'hsl(var(--port-type-image))',
                    number: 'hsl(var(--port-type-number))',
                    any: 'hsl(var(--port-type-any))',
                },
                /* Glassmorphism */
                glass: {
                    bg: 'hsl(var(--glass-bg))',
                    border: 'hsl(var(--glass-border))',
                },
            },
            boxShadow: {
                node: 'var(--shadow-node)',
                'node-selected': 'var(--shadow-node-selected)',
                floating: 'var(--shadow-floating)',
            },
            backdropBlur: {
                glass: 'var(--glass-blur)',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [],
};
