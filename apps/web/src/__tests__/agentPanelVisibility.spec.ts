import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ROLE_PERMISSIONS } from '@flows/flows';

import type { FlowRole } from '@flows/flows';

/**
 * Who gets the assistant. Until the PROD release the panel was gated on the environment
 * (`import.meta.env.DEV || VITE_ENV === 'DEV'`), which hid a second question the gate was also
 * answering: *which role* sees it. `FlowAgentPanel`'s own `permissions` prop is the executor's
 * ceiling on each tool, not a gate on the panel — so with the env gate gone and nothing in its
 * place, a viewer on someone else's flow gets a working assistant (the tool calls are denied, the
 * model call is not), and an anonymous visitor to a public flow gets a launcher whose every send
 * 403s.
 *
 * The rule is owner + editor, expressed as `permissions.canModifyCanvas`. These two tests are the
 * two ways it can silently break: the permission table drifting, or the gate disappearing from the
 * render site.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const ROLES: FlowRole[] = ['owner', 'editor', 'viewer', 'anonymous'];

/** The roles the assistant is meant for — everyone else must not even see the launcher. */
const ROLES_WITH_ASSISTANT: FlowRole[] = ['owner', 'editor'];

describe('assistant panel visibility', () => {
    it.each(ROLES)('%s sees the assistant only if it is owner or editor', role => {
        expect(ROLE_PERMISSIONS[role].canModifyCanvas).toBe(ROLES_WITH_ASSISTANT.includes(role));
    });

    it('gates the render site on that permission, not just on a flow being open', () => {
        const source = readFileSync(
            resolve(REPO_ROOT, 'apps/web/src/app/features/flows/pages/FlowEditorPage.tsx'),
            'utf-8'
        );
        const renderSite = /\{[^{}]*<FlowAgentPanel/.exec(source)?.[0];

        expect(renderSite).toBeDefined();
        expect(renderSite).toContain('permissions.canModifyCanvas');
    });
});
