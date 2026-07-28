import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

// Side-effect module: load the repo-root `.env.local` (gitignored) into process.env so the live/smoke
// Gemini specs can read GEMINI_API_KEY regardless of HOW vitest is invoked — a bare
// `npx vitest run <file>` from the repo root does NOT pick up libs/agent's vite config (so a config-level
// setupFiles would not run), but a spec's own import always does. Import this FIRST in any spec that needs
// the key. A no-op when the file is absent (those specs then skip) or when the var is already set.
const envLocal = fileURLToPath(new URL('../../../../.env.local', import.meta.url));
if (existsSync(envLocal)) {
    config({ path: envLocal });
}
