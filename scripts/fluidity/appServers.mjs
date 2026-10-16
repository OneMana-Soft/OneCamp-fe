// The rule both fakes of the app's server side route by: e2e/stubbedApp.ts's
// (one browser page, every answer a fixture) and fakeApp.mjs's (contexts that
// share one collaboration server). A request that leaves the build's own
// origin is for one of the app's servers, whatever domain the build was made
// for: the demo's (onemana.dev), the public repository's placeholder
// (.env.production) or a customer's. The fluidity fake matched the demo's
// domain alone, and on the public build every call went past it: the doc
// session's tests never got past "Couldn't load your workspace".

/** A predicate for Playwright's route: true for a request that leaves the app at `appUrl`. */
export function leavesApp(appUrl) {
  const origin = new URL(String(appUrl)).origin
  return (url) => url.origin !== origin
}

/**
 * Which of the app's servers a request is for, by its subdomain on any
 * domain (onecamp-backend, onecamp-collab, onecamp-emqx): "backend",
 * "collab", "emqx"; null for anything else (the storefront's funnel).
 */
export function serverOf(url) {
  return /^onecamp-([a-z0-9-]+)\./.exec(url.hostname)?.[1] ?? null
}
