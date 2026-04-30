#!/bin/bash
set -euo pipefail

# Usage: ./scripts/deploy.sh <app-name> [environment]
# Example: ./scripts/deploy.sh web dev
#          ./scripts/deploy.sh admin prod

# Constants
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="${1:?'App name required (web or admin)'}"
shift

# Validate app name
if [[ "$APP_NAME" != "web" && "$APP_NAME" != "admin" ]]; then
    echo "[ERROR] Invalid app name: $APP_NAME"
    echo "[ERROR] Valid app names: web, admin"
    exit 1
fi

# Load local AWS configuration if running locally (not in GitHub Actions)
load_local_config() {
    if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
        local config_file="${PROJECT_ROOT}/.env.deploy"
        if [ -f "$config_file" ]; then
            log_info "Loading local config from ${config_file}"
            # shellcheck disable=SC1090
            source "$config_file"
        else
            log_info "No local config found at ${config_file}"
            log_info "Create .env.deploy with BUCKET_NAME, AWS_PROFILE_NAME, etc."
            log_info "See README.md for details."
        fi
    fi
}

# Load VITE environment variables from .env.{env} file (local only)
load_vite_env() {
    local deploy_env="${1:-}"
    if [ "${GITHUB_ACTIONS:-}" != "true" ] && [ -n "$deploy_env" ]; then
        local env_file="${PROJECT_ROOT}/apps/${APP_NAME}/.env.${deploy_env}"
        if [ -f "$env_file" ]; then
            log_info "Loading VITE env from ${env_file}"
            set -a
            # shellcheck disable=SC1090
            source "$env_file"
            set +a
            export DEPLOY_ENV="$deploy_env"
        else
            log_error "VITE env file not found: ${env_file}"
            exit 1
        fi
    fi
}

# Simple log function for early use (before main log functions)
log_info() {
    echo "[INFO] $1"
}

# Load config before setting variables
load_local_config

# Configurable via environment variables
# Use app-specific env vars if available (e.g., ADMIN_BUCKET_NAME for admin)
APP_PREFIX=$(echo "$APP_NAME" | tr '[:lower:]' '[:upper:]')
BUCKET_VAR="${APP_PREFIX}_BUCKET_NAME"
DEV_CF_VAR="${APP_PREFIX}_DEV_CF_DISTRIBUTION_ID"
PROD_CF_VAR="${APP_PREFIX}_PROD_CF_DISTRIBUTION_ID"
BUCKET_NAME="${!BUCKET_VAR:-${BUCKET_NAME:-your-s3-bucket}}"
DEV_DISTRIBUTION_ID="${!DEV_CF_VAR:-${DEV_CF_DISTRIBUTION_ID:-}}"
PROD_DISTRIBUTION_ID="${!PROD_CF_VAR:-${PROD_CF_DISTRIBUTION_ID:-}}"
DIST_DIR="${PROJECT_ROOT}/dist/apps/${APP_NAME}"
CACHE_CONTROL_NO_CACHE="max-age=0,no-cache,no-store,must-revalidate"
CACHE_CONTROL_LOCALES="max-age=0,s-maxage=0,no-cache,no-store,must-revalidate,proxy-revalidate"
PKG_FILE="${PROJECT_ROOT}/apps/${APP_NAME}/package.json"

# Functions
log_error() {
    echo "[ERROR] $1" >&2
}

log_info() {
    echo "[INFO] $1"
}

log_success() {
    echo "[SUCCESS] $1"
}

show_usage() {
    echo "Usage: $0 <app-name> [environment]"
    echo ""
    echo "Arguments:"
    echo "  app-name       Required app name (web or admin)"
    echo "  environment    Optional deployment environment (dev or prod)"
    echo "                 If not provided, deploys to root bucket"
    echo ""
    echo "Examples:"
    echo "  $0 web             Deploy web to root bucket"
    echo "  $0 web dev         Deploy web to development environment"
    echo "  $0 admin prod      Deploy admin to PROD environment"
}

validate_arguments() {
    if [ $# -gt 1 ]; then
        log_error "Too many arguments provided"
        show_usage
        exit 1
    fi

    if [ $# -eq 1 ]; then
        local deploy_env="$1"
        if [[ "$deploy_env" != "dev" && "$deploy_env" != "prod" ]]; then
            log_error "Invalid environment: $deploy_env"
            log_error "Valid environments: dev, prod"
            exit 1
        fi
    fi
}

setup_aws_profile() {
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
        log_info "Running in GitHub Actions - using default AWS credentials"
        AWS_PROFILE=""
    else
        # Set your AWS profile name here or use AWS_PROFILE environment variable
        local profile_name="${AWS_PROFILE_NAME:-default}"
        log_info "Using AWS profile: ${profile_name}"
        AWS_PROFILE="--profile ${profile_name}"
    fi
}

validate_environment() {
    local deploy_env="${1:-}"

    if [ ! -d "${DIST_DIR}" ]; then
        log_error "Build directory ${DIST_DIR} does not exist"
        if [ -n "$deploy_env" ]; then
            log_error "Please run 'yarn ${APP_NAME}:build:${deploy_env}' first"
        else
            log_error "Please run 'yarn ${APP_NAME}:build' first"
        fi
        exit 1
    fi

    if [ ! -f "${DIST_DIR}/index.html" ]; then
        log_error "index.html not found in ${DIST_DIR}"
        log_error "Build may have failed"
        exit 1
    fi
}

get_distribution_id() {
    local deploy_env="${1:-}"

    if [ "$deploy_env" = "dev" ]; then
        echo "$DEV_DISTRIBUTION_ID"
    elif [ "$deploy_env" = "prod" ]; then
        echo "$PROD_DISTRIBUTION_ID"
    else
        echo ""
    fi
}

print_deployment_info() {
    local deploy_env="${1:-}"
    local distribution_id="$2"

    log_info "================================"
    log_info "AWS S3 Deployment Configuration"
    log_info "================================"
    log_info "App: ${APP_NAME}"
    if [ -n "$deploy_env" ]; then
        log_info "Environment: ${deploy_env}"
        log_info "S3 Target: s3://${BUCKET_NAME}/${deploy_env}"
    else
        log_info "Environment: root (no environment)"
        log_info "S3 Target: s3://${BUCKET_NAME}/"
    fi
    log_info "Source: ${DIST_DIR}"
    if [ -n "${distribution_id}" ] && [ "${distribution_id}" != "TODO" ]; then
        log_info "CloudFront: ${distribution_id}"
    else
        log_info "CloudFront: Not configured (will skip invalidation)"
    fi
    log_info "AWS Profile: ${AWS_PROFILE:-default}"
    log_info "================================"
}

sync_static_assets() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing static assets (excluding HTML, CSS, JS, locales, version.json)..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
        --exclude "index.html" \
        --exclude "version.json" \
        --exclude "*.css" \
        --exclude "*.js" \
        --exclude "locales/*"; then
        log_error "Failed to sync static assets"
        return 1
    fi

    log_success "Static assets synced"
}

sync_css_js_files() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing CSS and JavaScript files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
        --exclude "*" \
        --include "*.css" \
        --include "*.js" \
        --exclude "assets/*"; then
        log_error "Failed to sync CSS/JS files"
        return 1
    fi

    log_success "CSS/JS files synced"
}

sync_asset_files() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}"
    else
        s3_target="s3://${BUCKET_NAME}"
    fi

    log_info "Syncing asset files..."

    if ! aws s3 ${AWS_PROFILE} sync "${DIST_DIR}" "${s3_target}" \
        --metadata-directive REPLACE \
        --acl public-read \
        --exclude "*" \
        --include "assets/*"; then
        log_error "Failed to sync asset files"
        return 1
    fi

    log_success "Asset files synced"
}

sync_locales() {
    local deploy_env="${1:-}"
    local s3_target
    local locales_dir="${DIST_DIR}/locales"

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/locales"
    else
        s3_target="s3://${BUCKET_NAME}/locales"
    fi

    if [ -d "${locales_dir}" ]; then
        log_info "Syncing locale files..."

        if ! aws s3 ${AWS_PROFILE} sync "${locales_dir}" "${s3_target}" \
            --metadata-directive REPLACE \
            --acl public-read \
            --cache-control "${CACHE_CONTROL_LOCALES}"; then
            log_error "Failed to sync locale files"
            return 1
        fi

        log_success "Locale files synced"
    else
        log_info "No locales directory found, skipping..."
    fi
}

sync_i18n_bucket() {
    local deploy_env="${1:-}"
    local locales_dir="${DIST_DIR}/locales"

    if [ -z "${VITE_I18N_BUCKET_URL:-}" ]; then
        log_info "VITE_I18N_BUCKET_URL not set, skipping i18n bucket sync..."
        return 0
    fi

    if [ ! -d "${locales_dir}" ]; then
        log_info "No locales directory found, skipping i18n bucket sync..."
        return 0
    fi

    # Parse bucket and prefix from URL: https://{bucket}.s3.{region}.amazonaws.com/{stage}
    local i18n_bucket i18n_prefix
    i18n_bucket=$(echo "$VITE_I18N_BUCKET_URL" | sed -n 's|https://\([^.]*\)\.s3\..*|\1|p')
    i18n_prefix=$(echo "$VITE_I18N_BUCKET_URL" | sed -n 's|.*/\([^/]*\)$|\1|p')

    if [ -z "${i18n_bucket}" ] || [ -z "${i18n_prefix}" ]; then
        log_info "Could not parse i18n bucket URL, skipping..."
        return 0
    fi

    log_info "Syncing locale files to i18n bucket: s3://${i18n_bucket}/${i18n_prefix}/"

    if ! aws s3 ${AWS_PROFILE} sync "${locales_dir}" "s3://${i18n_bucket}/${i18n_prefix}" \
        --metadata-directive REPLACE \
        --content-type "application/json" \
        --cache-control "${CACHE_CONTROL_LOCALES}"; then
        log_error "Failed to sync i18n bucket"
        return 1
    fi

    log_success "i18n bucket synced"
}

upload_index_html() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/index.html"
    else
        s3_target="s3://${BUCKET_NAME}/index.html"
    fi

    log_info "Uploading index.html with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/index.html" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "text/html" \
        --acl public-read; then
        log_error "Failed to upload index.html"
        return 1
    fi

    log_success "index.html uploaded"
}

generate_version_json() {
    log_info "Generating version.json..."

    if [ ! -f "${PKG_FILE}" ]; then
        log_error "Package.json not found: ${PKG_FILE}"
        return 1
    fi

    local version
    version=$(node -p "require('${PKG_FILE}').version")
    local build_time
    build_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "${DIST_DIR}/version.json" << EOF
{
  "version": "${version}",
  "buildTime": "${build_time}"
}
EOF

    log_success "Generated version.json with version ${version}"
}

upload_version_json() {
    local deploy_env="${1:-}"
    local s3_target

    if [ -n "$deploy_env" ]; then
        s3_target="s3://${BUCKET_NAME}/${deploy_env}/version.json"
    else
        s3_target="s3://${BUCKET_NAME}/version.json"
    fi

    if [ ! -f "${DIST_DIR}/version.json" ]; then
        log_info "version.json not found, skipping..."
        return 0
    fi

    log_info "Uploading version.json with no-cache headers..."

    if ! aws s3 ${AWS_PROFILE} cp "${DIST_DIR}/version.json" "${s3_target}" \
        --metadata-directive REPLACE \
        --cache-control "${CACHE_CONTROL_NO_CACHE}" \
        --content-type "application/json" \
        --acl public-read; then
        log_error "Failed to upload version.json"
        return 1
    fi

    log_success "version.json uploaded"
}

build_app() {
    local deploy_env="${1:-}"

    # Clean dist
    log_info "Cleaning dist directory..."
    rm -rf "${DIST_DIR}" || true

    # Load VITE env for local builds
    load_vite_env "$deploy_env"

    # Build (default to dev mode when no environment specified)
    local build_mode="${deploy_env:-dev}"
    log_info "Building ${APP_NAME} app (mode: ${build_mode})..."
    yarn "${APP_NAME}:build:${build_mode}"
}

invalidate_cloudfront() {
    local deploy_env="${1:-}"
    local distribution_id="$2"

    if [ -z "${distribution_id}" ] || [ "${distribution_id}" = "TODO" ]; then
        log_info "Skipping CloudFront invalidation (distribution ID not configured)"
        return 0
    fi

    log_info "Creating CloudFront invalidation..."

    local invalidation_output
    if invalidation_output=$(aws cloudfront ${AWS_PROFILE} create-invalidation \
        --distribution-id "${distribution_id}" \
        --paths '/*' \
        --no-cli-pager 2>&1); then
        log_success "CloudFront invalidation created"
        echo "${invalidation_output}" | grep -E "(Id|Status|CreateTime)" || true
    else
        log_error "Failed to create CloudFront invalidation"
        echo "${invalidation_output}" >&2
        return 1
    fi
}

# Main execution
main() {
    local deploy_env="${1:-}"
    local distribution_id

    log_info "AWS S3 deployment script started for ${APP_NAME}"

    # Build app (loads VITE env + builds)
    build_app "$deploy_env"

    # Setup and validation
    setup_aws_profile
    validate_environment "$deploy_env"
    distribution_id=$(get_distribution_id "$deploy_env")
    print_deployment_info "$deploy_env" "$distribution_id"

    # Execute deployment steps
    local steps=(
        "generate_version_json"
        "sync_static_assets"
        "sync_css_js_files"
        "sync_asset_files"
        "sync_locales"
        "sync_i18n_bucket"
        "upload_index_html"
        "upload_version_json"
        "invalidate_cloudfront"
    )

    for step in "${steps[@]}"; do
        if [ "$step" = "invalidate_cloudfront" ]; then
            if ! ${step} "$deploy_env" "$distribution_id"; then
                log_error "Deployment failed at step: ${step}"
                exit 1
            fi
        else
            if ! ${step} "$deploy_env"; then
                log_error "Deployment failed at step: ${step}"
                exit 1
            fi
        fi
    done

    log_success "================================"
    log_success "Deployment completed successfully!"
    log_success "App: ${APP_NAME}"
    if [ -n "$deploy_env" ]; then
        log_success "Environment: ${deploy_env}"
        log_success "S3 URL: http://${BUCKET_NAME}.s3-website.ap-northeast-2.amazonaws.com/${deploy_env}/index.html"
    else
        log_success "Environment: root (no environment)"
        log_success "S3 URL: http://${BUCKET_NAME}.s3-website.ap-northeast-2.amazonaws.com/index.html"
    fi
    log_success "================================"
}

# Validate arguments and run main function
validate_arguments "$@"
main "${1:-}"
