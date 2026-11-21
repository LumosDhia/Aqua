#!/usr/bin/env bash
# Build the frontend for the VPS API and copy it into the Electron/Capacitor wrappers.
# usage: ./link-wrappers.sh https://api.yourdomain.com
set -euo pipefail
cd "$(dirname "$0")"
API="${1:?give the API base url, e.g. https://api.yourdomain.com}"
(cd frontend && VITE_API_BASE="$API" npm run build)
rm -rf ../app/www && cp -r frontend/dist ../app/www
(cd ../app && npx cap sync android)
echo "ok: wrappers updated. Run: cd ../app && npm run desktop   (or android:build)"
