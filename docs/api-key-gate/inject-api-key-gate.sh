#!/bin/bash
#
# inject-api-key-gate.sh
# ─────────────────────────────────────────────────────────────
# React 샘플 앱에 API Key 입력 모달을 주입하는 스크립트.
# 앱 실행 시 localStorage에 x-api-key가 없으면 모달이 표시됨.
#
# ▸ 사용법
#   ./scripts/inject-api-key-gate.sh <target-dir>
#   ./scripts/inject-api-key-gate.sh --dry-run <target-dir>
#
# ▸ 예시
#   # AI Studio 단독 앱 (flat 구조: index.tsx가 루트에 있음)
#   ./scripts/inject-api-key-gate.sh docs/ai-blog-title-generator
#
#   # Monorepo 웹앱 (src/ 구조: src/index.tsx)
#   ./scripts/inject-api-key-gate.sh docs/codes-monorepo-samples-develop/gemini-recipe-generator-monorepo/apps/recipe-web
#
# ▸ 스크립트가 하는 일
#   Step 1. ApiKeyGate.tsx 복사  — index.tsx와 같은 디렉토리에 배치
#   Step 2. index.tsx 패치      — import 추가 + <App />을 <ApiKeyGate>로 감싸기
#   Step 3. vite.config.ts 패치 — htmlEnvInjectionPlugin 추가 (env → window.* 주입)
#   Step 4. .env.local 패치     — VITE_CODES_URL 추가
#
# ▸ 환경변수 (vite.config.ts의 htmlEnvInjectionPlugin이 window.*로 주입)
#   VITE_CODES_URL  → window.CODES_URL  (API 키 발급 페이지 URL, 기본값: https://console.eureka.codes)
#
# ▸ 저장되는 키
#   localStorage['x-api-key']  — 사용자가 입력한 API 키
#   다른 코드에서 사용: localStorage.getItem('x-api-key')
#   fetch 헤더: { 'x-api-key': localStorage.getItem('x-api-key') }
#
# ▸ 주의사항
#   - 멱등성 보장: 여러 번 실행해도 안전 (이미 패치된 파일은 SKIP)
#   - macOS / Linux 모두 지원
#   - vite.config.ts는 defineConfig(({ mode }) => { ... }) 함수 형태여야 함
#
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/templates/ApiKeyGate.tsx"

# --- Cross-platform sed in-place (macOS + Linux) ---
sedi() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# --- Parse arguments ---

DRY_RUN=false
TARGET_DIR=""

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        *) TARGET_DIR="$arg" ;;
    esac
done

if [ -z "$TARGET_DIR" ]; then
    echo "Usage: $0 [--dry-run] <target-dir>"
    echo ""
    echo "Examples:"
    echo "  $0 docs/ai-blog-title-generator"
    echo "  $0 docs/codes-monorepo-samples-develop/gemini-recipe-generator-monorepo/apps/recipe-web"
    echo "  $0 --dry-run docs/ai-blog-title-generator"
    exit 1
fi

# Resolve to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd)" || {
    echo "ERROR: Directory not found: $TARGET_DIR"
    exit 1
}

# --- Detect index.tsx location (flat vs src/) ---

INDEX_FILE=""
if [ -f "$TARGET_DIR/src/index.tsx" ]; then
    INDEX_FILE="$TARGET_DIR/src/index.tsx"
elif [ -f "$TARGET_DIR/index.tsx" ]; then
    INDEX_FILE="$TARGET_DIR/index.tsx"
else
    echo "ERROR: No index.tsx found in $TARGET_DIR or $TARGET_DIR/src/"
    exit 1
fi

VITE_CONFIG="$TARGET_DIR/vite.config.ts"
if [ ! -f "$VITE_CONFIG" ]; then
    echo "ERROR: No vite.config.ts found in $TARGET_DIR"
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "ERROR: Template not found: $TEMPLATE_FILE"
    exit 1
fi

GATE_DIR="$(dirname "$INDEX_FILE")"
GATE_FILE="$GATE_DIR/ApiKeyGate.tsx"
ENV_FILE="$TARGET_DIR/.env.local"

echo "=== API Key Gate Injection ==="
echo "Target:       $TARGET_DIR"
echo "index.tsx:    $INDEX_FILE"
echo "vite.config:  $VITE_CONFIG"
echo "Gate target:  $GATE_FILE"
echo "Dry run:      $DRY_RUN"
echo ""

action() {
    if [ "$DRY_RUN" = true ]; then
        echo "  [dry-run] $1"
    else
        echo "  $1"
    fi
}

# =================================================================
# Step 1: Copy ApiKeyGate.tsx
# =================================================================

echo "Step 1: ApiKeyGate.tsx"
if [ -f "$GATE_FILE" ]; then
    action "SKIP — already exists"
else
    action "COPY → $GATE_FILE"
    if [ "$DRY_RUN" = false ]; then
        cp "$TEMPLATE_FILE" "$GATE_FILE"
    fi
fi
echo ""

# =================================================================
# Step 2: Patch index.tsx — import + wrap <App />
# =================================================================

echo "Step 2: Patch index.tsx"
if grep -q "ApiKeyGate" "$INDEX_FILE"; then
    action "SKIP — already patched"
else
    action "ADD import { ApiKeyGate } from './ApiKeyGate'"
    action "WRAP <App /> with <ApiKeyGate>"

    if [ "$DRY_RUN" = false ]; then
        LAST_IMPORT_LINE=$(grep -n "^import " "$INDEX_FILE" | tail -1 | cut -d: -f1)

        if [ -n "$LAST_IMPORT_LINE" ]; then
            sedi "${LAST_IMPORT_LINE}a\\
import { ApiKeyGate } from './ApiKeyGate';
" "$INDEX_FILE"
        fi

        sedi 's|<App />|<ApiKeyGate><App /></ApiKeyGate>|g' "$INDEX_FILE"
        sedi 's|<App/>|<ApiKeyGate><App/></ApiKeyGate>|g' "$INDEX_FILE"
    fi
fi
echo ""

# =================================================================
# Step 3: Patch vite.config.ts — htmlEnvInjectionPlugin
#   VITE_* 환경변수를 window.* 전역변수로 주입하는 Vite 플러그인.
#   이미 monorepo 샘플에는 포함되어 있으므로 SKIP됨.
# =================================================================

echo "Step 3: Patch vite.config.ts"
if grep -q "html-env-injection" "$VITE_CONFIG"; then
    action "SKIP — already patched"
else
    action "INJECT htmlEnvInjectionPlugin"
    action "ADD plugin to plugins array"

    if [ "$DRY_RUN" = false ]; then
        # Ensure loadEnv is imported
        if ! grep -q "loadEnv" "$VITE_CONFIG"; then
            sedi 's|{ defineConfig }|{ defineConfig, loadEnv }|' "$VITE_CONFIG"
        fi

        # Warn if defineConfig doesn't use function form
        if ! grep -q "loadEnv(" "$VITE_CONFIG"; then
            echo "  WARN: vite.config.ts에 loadEnv() 호출이 없습니다."
            echo "        defineConfig를 함수 형태로 변경하세요:"
            echo "        export default defineConfig(({ mode }) => { const env = loadEnv(mode, process.cwd(), ''); return { ... }; });"
        fi

        # Insert plugin code before `export default`
        PLUGIN_CODE='// --- API Key Gate: html-env-injection ---\
const removeVitePrefix = (envVar: string) => envVar.replace('"'"'VITE_'"'"', '"'"''"'"');\
\
const htmlEnvInjectionPlugin = (env: Record<string, string>) => ({\
    name: '"'"'html-env-injection'"'"',\
    transformIndexHtml: {\
        transform(html: string) {\
            const envVars = Object.entries(env)\
                .filter(([key]) => key.startsWith('"'"'VITE_'"'"'))\
                .reduce((acc, [key, value]) => {\
                    acc[removeVitePrefix(key)] = value || '"'"''"'"';\
                    return acc;\
                }, {} as Record<string, string>);\
\
            const envScript = `<script>\
    (function() {\
      ${Object.entries(envVars)\
          .map(([key, value]) => `window.${key}="${value}";`)\
          .join('"'"'\\n'"'"')}\
    })();\
  </script>`;\
\
            return html.replace(/<body>/, `${envScript}\\n<body>`);\
        },\
    },\
});\
// --- end API Key Gate ---\
'

        sedi "/^export default/i\\
${PLUGIN_CODE}
" "$VITE_CONFIG"

        # Normalize loadEnv path
        sedi "s|loadEnv(mode, '.', '')|loadEnv(mode, process.cwd(), '')|g" "$VITE_CONFIG"

        # Add plugin to plugins array
        sedi 's|plugins: \[react()|plugins: [htmlEnvInjectionPlugin(env), react()|' "$VITE_CONFIG"
    fi
fi
echo ""

# =================================================================
# Step 4: Patch .env.local — VITE_CODES_URL
# =================================================================

echo "Step 4: Patch .env.local"
if [ -f "$ENV_FILE" ] && grep -q "VITE_CODES_URL" "$ENV_FILE"; then
    action "SKIP — VITE_CODES_URL already present"
else
    action "ADD VITE_CODES_URL=https://console.eureka.codes"
    if [ "$DRY_RUN" = false ]; then
        echo "VITE_CODES_URL=https://console.eureka.codes" >> "$ENV_FILE"
    fi
fi
echo ""

# =================================================================
# Summary
# =================================================================

echo "=== Done ==="
if [ "$DRY_RUN" = true ]; then
    echo "This was a dry run. No files were modified."
    echo "Run without --dry-run to apply changes."
else
    echo "Injection complete!"
    echo ""
    echo "Next steps:"
    echo "  1. cd $(basename "$TARGET_DIR")"
    echo "  2. npm install  (or pnpm install)"
    echo "  3. npm run dev"
    echo "  4. Open http://localhost:3000 → API Key 모달 확인"
fi
