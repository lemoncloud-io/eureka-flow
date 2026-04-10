# i18n Admin Editor - Development Guide

Browser-based translation editor that reads/writes JSON to S3, with live preview via iframe and cross-tab sync via BroadcastChannel.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  S3 Bucket (source of truth)                            │
│  {bucket_url}/{lang}/{namespace}.json                   │
│  e.g. https://your-bucket.s3.amazonaws.com/i18n/en/common.json │
└────────────┬──────────────────────────┬─────────────────┘
             │ GET (fetch)              │ PUT (upload)
             ▼                          ▲
┌────────────────────────────────────────────────────────┐
│  Admin App                                              │
│  ┌──────────────────────┐  ┌────────────────────────┐  │
│  │  I18nPage            │  │  PreviewPage            │  │
│  │  (editor + toolbar)  │  │  (standalone preview)   │  │
│  │  ┌────────────────┐  │  │  ┌──────────────────┐  │  │
│  │  │ TranslationEditor│ │  │  │  WebPreview      │  │  │
│  │  │ (tree table)   │  │  │  │  (same component)│  │  │
│  │  └────────────────┘  │  │  └──────────────────┘  │  │
│  │  ┌────────────────┐  │  └──────────┬─────────────┘  │
│  │  │  WebPreview    │  │             │                 │
│  │  │  (iframe)      │  │    BroadcastChannel           │
│  │  └───────┬────────┘  │    (i18n-preview)             │
│  └──────────┼───────────┘             │                 │
│             │ postMessage             │                 │
│             ▼                         │                 │
│  ┌────────────────────┐               │                 │
│  │  Web App (iframe)  │◄──────────────┘                 │
│  │  i18n/index.ts     │                                 │
│  │  (message handler) │                                 │
│  └────────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### S3 Bucket Setup

1. **Create S3 bucket** with the folder structure `{lang}/{namespace}.json`
2. **Enable CORS** — the admin app makes direct browser `fetch()` calls (GET/PUT):

```json
[
    {
        "AllowedOrigins": ["https://your-admin-app.com", "http://localhost:*"],
        "AllowedMethods": ["GET", "PUT"],
        "AllowedHeaders": ["Content-Type"],
        "MaxAgeSeconds": 3600
    }
]
```

3. **Access policy** — allow public read (or presigned URLs) and write from admin origin
4. **Initial upload** — seed JSON files using the upload script:

```bash
# Usage: ./scripts/upload-i18n-to-s3.sh <dev|prod>
./scripts/upload-i18n-to-s3.sh dev
```

### Environment Variables

```bash
# Admin app & Web app (.env.local) — 로컬 개발용
VITE_I18N_BUCKET_URL=https://your-bucket.s3.ap-northeast-2.amazonaws.com/i18n

# CI/CD GitHub Secrets (dev/prod prefix로 환경 분리):
# VITE_DEV_I18N_BUCKET_URL=https://your-bucket.s3.ap-northeast-2.amazonaws.com/dev
# VITE_PROD_I18N_BUCKET_URL=https://your-bucket.s3.ap-northeast-2.amazonaws.com/prod
```

### Dependencies

```bash
# Admin app — none beyond React + Zustand (already in project)

# Web app
yarn add i18next react-i18next \
  i18next-browser-languagedetector \
  i18next-chained-backend \
  i18next-http-backend \
  i18next-localstorage-backend \
  i18next-resources-to-backend
```

## Admin App — File Structure

```
features/i18n/
├── components/
│   ├── index.ts                # barrel export
│   ├── NamespaceSelector.tsx   # tab selector with search match badges
│   ├── TranslationEditor.tsx   # tree table with inline editing + pagination
│   └── WebPreview.tsx          # iframe preview with device presets + show keys
├── consts/
│   ├── index.ts
│   ├── json-utils.ts           # flattenJson, unflattenJson, buildTranslationTree, sortObjectKeys
│   ├── namespaces.ts           # I18N_NAMESPACES definition
│   └── s3-client.ts            # fetchTranslation, uploadTranslation, isS3Configured
├── hooks/
│   ├── index.ts
│   └── usePreviewChannel.ts    # BroadcastChannel pub/sub hooks
├── pages/
│   ├── index.ts
│   ├── I18nPage.tsx            # main editor page (orchestrator)
│   └── PreviewPage.tsx         # standalone preview (opens in new tab)
├── stores/
│   ├── index.ts
│   └── useI18nStore.ts         # Zustand store: load/save S3, CRUD, dirty tracking
├── types/
│   ├── index.ts
│   └── i18n.ts                 # Language, FlatTranslations, TranslationTreeNode
└── index.ts                    # feature barrel export
```

## Configuration — What to Customize

### Languages

```typescript
// types/i18n.ts
export type Language = 'en' | 'ko';
export const LANGUAGES: Language[] = ['en', 'ko'];
export const LANGUAGE_LABELS: Record<Language, string> = {
    en: 'English',
    ko: '한국어',
};
```

Adding a language (e.g. Japanese):

```typescript
export type Language = 'en' | 'ko' | 'ja';
export const LANGUAGES: Language[] = ['en', 'ko', 'ja'];
export const LANGUAGE_LABELS: Record<Language, string> = {
    en: 'English',
    ko: '한국어',
    ja: '日本語',
};
```

All components (TranslationEditor, WebPreview, store) dynamically iterate `LANGUAGES` — no other changes needed.

### Namespaces

```typescript
// consts/namespaces.ts
export const I18N_NAMESPACES = ['common', 'flows', 'nodes', 'landing', 'tutorial'] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];
```

### Routing

```typescript
// app.tsx
<Route path="/i18n/preview" element={<PreviewPage />} />  // outside layout (full-screen)
<Route path="/i18n" element={<I18nPage />} />              // inside layout
```

`PreviewPage` must be **outside** the admin layout so it renders full-screen for dual-monitor use.

## Data Flow

### JSON Format

S3 stores nested JSON. The editor converts to flat dot-notation for editing.

```
S3 (nested)                     Editor (flat)
{                               {
  "errors": {                     "errors.network.title": "Error",
    "network": {                  "errors.network.message": "Check connection"
      "title": "Error",        }
      "message": "Check..."
    }
  }
}
```

Key utilities in `json-utils.ts`:

- `flattenJson()` — nested → flat (on load)
- `unflattenJson()` — flat → nested (on save)
- `sortObjectKeys()` — alphabetical sort before upload (consistent diffs)
- `buildTranslationTree()` — flat → tree nodes (for collapsible UI rendering)

### S3 Client

Direct browser `fetch()` — no backend API required.

```typescript
// s3-client.ts
fetchTranslation(lng, ns); // GET  {BUCKET_URL}/{lng}/{ns}.json
uploadTranslation(lng, ns, data); // PUT  {BUCKET_URL}/{lng}/{ns}.json
isS3Configured(); // checks VITE_I18N_BUCKET_URL is set
```

### State Management (Zustand)

```typescript
interface I18nState {
    namespace: I18nNamespace;
    originals: Record<Language, FlatTranslations>; // snapshot from S3
    edited: Record<Language, FlatTranslations>; // user's working copy
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;

    isDirty: () => boolean; // originals !== edited
    loadFromS3: () => Promise<void>;
    saveToS3: () => Promise<void>;
    updateValue: (key, lang, value) => void;
    addKey: (key, values) => void;
    deleteKey: (key) => void;
    resetChanges: () => void;
}
```

Dirty tracking compares `JSON.stringify(originals[lang])` vs `JSON.stringify(edited[lang])` per language.

## Communication Protocols

### 1. postMessage — Admin iframe ↔ Web App

Used for real-time preview synchronization between the admin editor and the web app loaded in an iframe.

```
Admin (parent)                          Web App (iframe)
     │                                       │
     │  ◄───── i18n:ready ──────────────────  │  iframe loaded, i18next initialized
     │                                       │
     │  ───── i18n:update ─────────────────► │  send updated translations
     │  { namespace, language, resources }    │  → addResourceBundle(deep, overwrite)
     │                                       │
     │  ───── i18n:changeLanguage ─────────► │  switch display language
     │  { language }                         │  → i18n.changeLanguage()
     │                                       │
     │  ───── i18n:showKeys ───────────────► │  replace values with [key.name]
     │  { namespace, keys }                  │  → addResourceBundle for all langs
     │                                       │
     │  ◄───── i18n:keyClicked ────────────  │  user clicked a [key] in show-keys mode
     │  { key }                              │  → editor scrolls to key + focuses input
```

#### Admin side (WebPreview.tsx)

Sends messages via `postToIframe()`:

```typescript
const postToIframe = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
}, []);
```

Listens for `i18n:ready` and `i18n:keyClicked`:

```typescript
window.addEventListener('message', handler);
```

#### Web app side (i18n/index.ts)

Only activates when embedded in iframe:

```typescript
const isEmbeddedInIframe = window.parent !== window;

if (isEmbeddedInIframe) {
    // 1. Listen for admin messages
    window.addEventListener('message', event => {
        switch (event.data.type) {
            case 'i18n:update': // update bundle with edited values
            case 'i18n:changeLanguage': // switch language
            case 'i18n:showKeys': // show [key.name] overlay
        }
    });

    // 2. Click detection for show-keys mode
    document.addEventListener(
        'click',
        e => {
            // detect [key.name] text → postMessage to parent
        },
        true
    ); // capture phase

    // 3. Notify admin when ready
    window.parent.postMessage({ type: 'i18n:ready' }, '*');
}
```

**Critical i18next config for iframe mode**:

```typescript
react: {
    useSuspense: true,
    // Subscribe to store events so addResourceBundle triggers re-renders
    ...(isEmbeddedInIframe ? { bindI18nStore: 'added removed' } : {}),
}
```

Without `bindI18nStore: 'added removed'`, calling `addResourceBundle()` does NOT trigger React re-renders.

### 2. BroadcastChannel — Editor Tab ↔ Preview Tab

Used for dual-monitor workflow: editor in one tab, full-screen preview in another.

```
Editor Tab (I18nPage)                  Preview Tab (PreviewPage)
     │                                       │
     │  ───── i18n:sync ──────────────────► │  full state sync (debounced 300ms)
     │  { namespace, edited }                │  → WebPreview renders with externalData
     │                                       │
     │  ◄───── i18n:keyClicked ────────────  │  key clicked in preview
     │  { key }                              │  → editor scrolls to key
```

#### Publisher (usePreviewPublisher)

```typescript
export const usePreviewPublisher = () => {
    const channelRef = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        channelRef.current = new BroadcastChannel('i18n-preview');
        return () => {
            channelRef.current?.close();
        };
    }, []);
    const broadcast = useCallback((msg: PreviewMessage) => {
        channelRef.current?.postMessage(msg);
    }, []);
    return { broadcast };
};
```

#### Subscriber (usePreviewSubscriber)

```typescript
export const usePreviewSubscriber = (onMessage: (msg: PreviewMessage) => void) => {
    const callbackRef = useRef(onMessage);
    callbackRef.current = onMessage; // avoid stale closures
    useEffect(() => {
        const channel = new BroadcastChannel('i18n-preview');
        channel.onmessage = e => callbackRef.current(e.data);
        return () => channel.close();
    }, []);
};
```

**Key detail**: `callbackRef` pattern prevents stale closure issues — the subscriber hook has empty deps (`[]`) but always calls the latest callback.

#### Debounced Broadcasting (I18nPage)

```typescript
useEffect(() => {
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
        broadcast({ type: 'i18n:sync', namespace, edited });
    }, 300); // 300ms debounce to avoid per-keystroke serialization
    return () => {
        if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    };
}, [namespace, edited, broadcast]);
```

## Web App i18n Setup — ChainedBackend Strategy

```
[0] localStorage cache (fast, instant render)
 │  ↓ miss
[1] S3/HTTP (authoritative, network fetch)
 │  ↓ miss
[2] bundled fallback (offline safety net, from public/locales/)
```

With `cacheHitMode: 'refresh'`, when localStorage hits, the app renders instantly **and** fetches from S3 in background to update the cache for next load.

### Cache Versioning

```typescript
const I18N_VERSION = process.env.I18N_VERSION || 'fallback';

// localStorage key prefix includes version
prefix: `i18next_res_${I18N_VERSION}_`;

// HTTP requests include version as query param
loadPath: `${S3_BUCKET_URL}/{{lng}}/{{ns}}.json?v=${I18N_VERSION}`;
```

On app load, old version caches are cleaned:

```typescript
if (!isDevelopment) {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('i18next_res_') && !key.startsWith(currentPrefix)) {
            localStorage.removeItem(key);
        }
    });
}
```

## Feature Details

### Show Keys Mode

Replaces all translation values with `[key.name]` in the preview for visual debugging.

1. Admin fetches ALL namespace keys from S3
2. Builds key overlay: `{ "hero.title": "[hero.title]" }`
3. Sends `i18n:showKeys` for each namespace → iframe replaces values
4. Click on `[hero.title]` in iframe → sends `i18n:keyClicked` → editor auto-scrolls to that key
5. Toggle off → restores cached S3 values for all namespaces

### Cross-Namespace Search

- On mount, loads ALL namespace translations from S3 (`allNsData`)
- Search query matches against keys and values across all namespaces
- Match count badges shown on namespace tabs via `searchMatchCounts`
- Clicking a key from preview auto-switches namespace if the key belongs to a different one

### Focus Key (Preview → Editor Navigation)

When a key is clicked in the preview:

1. `handleKeySearch(key)` finds which namespace owns the key
2. Switches namespace if needed (with unsaved changes warning)
3. Sets `searchQuery` (filters editor) + `focusKey` (scroll target)
4. `TranslationEditor` finds the key in `filteredLeaves`, jumps to correct page
5. `scrollIntoView({ behavior: 'smooth', block: 'center' })` + `input.focus()`
6. 1.5s ring highlight animation, then `onFocusHandled()` clears the state

### Device Presets (Preview)

```typescript
const DEVICE_PRESETS = [
    { name: 'Mobile', width: 375, height: 667, icon: Smartphone },
    { name: 'Tablet', width: 768, height: 1024, icon: Tablet },
    { name: 'Desktop', width: 1280, height: 800, icon: Monitor },
];
```

Uses CSS `transform: scale()` to fit the preset width into the preview container. `ResizeObserver` with `requestAnimationFrame` throttling tracks container width.

## Applying to Another Project

### Step 1: Copy Admin Feature

Copy `features/i18n/` folder. Update:

- `LANGUAGES` in `types/i18n.ts`
- `I18N_NAMESPACES` in `consts/namespaces.ts`
- `VITE_I18N_BUCKET_URL` env var

### Step 2: Add Web App Receiver

In the web app's i18n init file, add the iframe mode block:

```typescript
const isEmbeddedInIframe = window.parent !== window;

// i18next init config
react: {
    useSuspense: true,
    ...(isEmbeddedInIframe ? { bindI18nStore: 'added removed' } : {}),
}

if (isEmbeddedInIframe) {
    const updateBundle = (lng, ns, resources) => {
        i18n.addResourceBundle(lng, ns, resources, true, true);
        i18n.emit('languageChanged', i18n.language);
    };

    window.addEventListener('message', (event) => { /* handle i18n:update, changeLanguage, showKeys */ });

    // Key click detection for show-keys mode
    let showKeysActive = false;
    // ... (see full implementation in apps/web/src/i18n/index.ts)

    // Notify parent when ready
    window.parent.postMessage({ type: 'i18n:ready' }, '*');
}
```

### Step 3: Add Routes

```typescript
<Route path="/i18n/preview" element={<PreviewPage />} />  // outside layout
<Route path="/i18n" element={<I18nPage />} />              // inside admin layout
```

### Step 4: Set Up S3

1. Create bucket with `{lang}/{namespace}.json` structure
2. Enable CORS for admin app origin
3. Set `VITE_I18N_BUCKET_URL` env var
4. Upload initial JSON files via script

### Step 5: Update Preview URL

```typescript
// WebPreview.tsx
const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL as string | undefined;
const PREVIEW_URL = WEB_APP_URL || 'http://localhost:3000';
```

Set `VITE_WEB_APP_URL` to the web app's URL for the iframe preview.

## Gotchas

1. **`bindI18nStore` is required** — without it, `addResourceBundle()` won't trigger React re-renders in the iframe
2. **`addResourceBundle(lng, ns, resources, true, true)`** — both `deep` and `overwrite` must be `true` for partial updates to merge correctly
3. **BroadcastChannel same-origin only** — admin app tabs must be on the same origin for cross-tab sync to work
4. **S3 CORS** — both GET and PUT must be allowed; missing CORS headers will silently fail
5. **Show Keys toggle-off** — must restore ALL namespace values (not just current), otherwise other namespaces stay as `[key]` text
6. **Debounce BroadcastChannel** — serializing the full `edited` object on every keystroke is expensive; 300ms debounce is essential
7. **`callbackRef` pattern** — BroadcastChannel subscriber must use `callbackRef` to avoid stale closures since the effect has `[]` deps
