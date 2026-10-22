#!/usr/bin/env bash
# Inside browser-isolated (run.sh): the web's production build, the TLS front
# and Playwright, in a network namespace Docker's churn can't reach. The two
# API processes run outside; their ports are forwarded in.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
web=$(cd "$here/../.." && pwd)
cd "$web"
./node_modules/.bin/next start -p "$WEB_PORT" -H 127.0.0.1 > "$WORK/next.log" 2>&1 &
node "$here/hostProxy.mjs" > "$WORK/front.log" 2>&1 &
curl -s -o /dev/null --retry 90 --retry-delay 1 --retry-connrefused "http://127.0.0.1:$WEB_PORT/" || { echo "next start didn't answer"; exit 1; }
for name in acme beta; do
  curl -sk -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused --resolve "$name-api.ws.test:$PROXY_PORT:127.0.0.1" "https://$name-api.ws.test:$PROXY_PORT/auth/providers" || { echo "$name's API didn't answer through the front"; exit 1; }
done
./node_modules/.bin/playwright test -c e2e/cookieScope/playwright.config.ts
