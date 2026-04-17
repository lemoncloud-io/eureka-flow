#!/bin/bash
# Upload local i18n JSON files to S3 bucket.
# Usage: ./scripts/upload-i18n-to-s3.sh <env>
# Example:
#   ./scripts/upload-i18n-to-s3.sh dev   → s3://eureka-flows-i18n/dev/
#   ./scripts/upload-i18n-to-s3.sh prod  → s3://eureka-flows-i18n/prod/
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - S3 bucket 'eureka-flows-i18n' exists

set -euo pipefail

ENV="${1:?Usage: $0 <dev|prod>}"

if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
    echo "Error: env must be 'dev' or 'prod'"
    exit 1
fi

BUCKET="eureka-flows-i18n"
LOCALES_DIR="$(dirname "$0")/../apps/web/public/locales"

if [ ! -d "$LOCALES_DIR" ]; then
    echo "Error: Locales directory not found: $LOCALES_DIR"
    exit 1
fi

LANGUAGES=("en" "ko")
NAMESPACES=("common" "flows" "nodes" "landing" "tutorial")

echo "Uploading i18n files to: s3://$BUCKET/$ENV/"
echo "Source: $LOCALES_DIR"
echo ""

for lng in "${LANGUAGES[@]}"; do
    for ns in "${NAMESPACES[@]}"; do
        local_file="$LOCALES_DIR/$lng/$ns.json"
        if [ -f "$local_file" ]; then
            echo "  $lng/$ns.json → s3://$BUCKET/$ENV/$lng/$ns.json"
            aws s3 cp "$local_file" "s3://$BUCKET/$ENV/$lng/$ns.json" \
                --content-type "application/json" \
                --cache-control "no-cache, must-revalidate"
        else
            echo "  SKIP $lng/$ns.json (not found)"
        fi
    done
done

echo ""
echo "Done! Uploaded i18n files to s3://$BUCKET/$ENV/"
