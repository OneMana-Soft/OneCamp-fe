#!/usr/bin/env bash
# COOKIE-SCOPE e2e: two Cloud workspaces on one zone (acme.ws.test and
# beta.ws.test, with their APIs on acme-api and beta-api), opened in one
# browser. Each API is the real router (the backend's
# TestCookieScopeWorkspaceServer) with its own key, Postgres, Redis and Dgraph;
# the web is this repo's production build (next start).
#
# Usage: e2e/cookieScope/run.sh <backend worktree> [work dir]
#   BUILD=1 rebuilds the web even when .next exists. Run it through heavy.sh.
# Leaves logs, the TLS pair and Playwright's output in the work dir.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../.." && pwd)
backend=$(cd "${1:?usage: run.sh <backend worktree> [work dir]}" && pwd)
WORK=${2:-$(mktemp -d)}
WORK=$(mkdir -p "$WORK" && cd "$WORK" && pwd)
rm -rf "$WORK"/*.ready "$WORK/stop" "$WORK/playwright"
export WORK WEB_PORT=3107 PROXY_PORT=8443
export API_PORTS='{"acme":18101,"beta":18102}'
export COOKIE_SCOPE_E2E=1 COOKIE_SCOPE_E2E_EMAIL=sam@example.test
COOKIE_SCOPE_E2E_PASSWORD=$(openssl rand -hex 16)
export COOKIE_SCOPE_E2E_PASSWORD

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=ws.test" \
  -addext "subjectAltName=DNS:ws.test,DNS:*.ws.test" \
  -keyout "$WORK/tls.key" -out "$WORK/tls.crt" 2>/dev/null
export TLS_KEY="$WORK/tls.key" TLS_CERT="$WORK/tls.crt"

# One build for both workspaces: placeholder addresses, rewritten per host by
# the front (hostProxy.mjs).
if [ ! -f "$web/.next/BUILD_ID" ] || [ -n "${BUILD:-}" ]; then
  echo "building the web"
  (cd "$web" && env \
    NEXT_PUBLIC_BACKEND_URL=https://ws-api.placeholder.test:8443/ \
    NEXT_PUBLIC_FRONTEND_URL=https://ws-web.placeholder.test:8443/ \
    NEXT_PUBLIC_APP_URL=https://ws-web.placeholder.test:8443/ \
    NEXT_PUBLIC_ORG_NAME= NEXT_PUBLIC_DEMO_MODE=false \
    NEXT_PUBLIC_AUTH_EMAIL=true NEXT_PUBLIC_AUTH_GOOGLE=false NEXT_PUBLIC_AUTH_GITHUB=false \
    NEXT_PUBLIC_LIVEKIT_URL= NEXT_PUBLIC_COLLABORATION_URL= NEXT_PUBLIC_MQTT_HOST= NEXT_PUBLIC_MINIO_URL= \
    NEXT_PUBLIC_FIREBASE_API_KEY= NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN= NEXT_PUBLIC_FIREBASE_PROJECT_ID= \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET= NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID= NEXT_PUBLIC_FIREBASE_APP_ID= \
    NEXT_PUBLIC_FIREBASE_VAPID_KEY= NEXT_PUBLIC_FUNNEL_ENDPOINT= NEXT_PUBLIC_PRODUCT_SITE= \
    pnpm build) > "$WORK/build.log" 2>&1 || { echo "the web build failed: $WORK/build.log"; exit 1; }
fi

# Each workspace as Cloud configures one: FE_DOMAIN the zone, its own key.
serve() {
  local name=$1 port=$2
  (cd "$backend" && env JWT_SECRET="$(openssl rand -hex 32)" \
    FE_DOMAIN=ws.test FRONTEND_DOMAIN= FE_HOST_DOMAIN="$name.ws.test:$PROXY_PORT" BACKEND_DOMAIN="$name-api.ws.test:$PROXY_PORT" \
    COOKIE_SECURE= CSRF_DISABLED= CSRF_LEGACY_COOKIE= CSRF_ALLOWED_ORIGINS= \
    COOKIE_SCOPE_E2E_ADDR="127.0.0.1:$port" COOKIE_SCOPE_E2E_READY="$WORK/$name.ready" COOKIE_SCOPE_E2E_STOP="$WORK/stop" \
    go test -tags integration -count=1 -timeout 60m -v -run '^TestCookieScopeWorkspaceServer$' ./tests/integration/) > "$WORK/$name.log" 2>&1 &
}
serve acme 18101
serve beta 18102
trap 'touch "$WORK/stop"; wait' EXIT

waited=0
until [ -f "$WORK/acme.ready" ] && [ -f "$WORK/beta.ready" ]; do
  if [ "$waited" -ge 900 ]; then echo "the workspaces didn't start: $WORK/acme.log, $WORK/beta.log"; exit 1; fi
  if ! jobs -r | grep -q .; then echo "a workspace stopped: $WORK/acme.log, $WORK/beta.log"; exit 1; fi
  read -r -t 2 <> <(:) || true
  waited=$((waited + 2))
done
echo "both workspaces up"

status=0
"$HOME/bin/browser-isolated" --forward 18101 --forward 18102 bash "$here/inside.sh" || status=$?
echo "E2E_EXIT=$status"
exit "$status"
