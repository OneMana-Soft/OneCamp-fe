import { OWN_ERRORS } from "@/lib/http/ownErrors"

/**
 * lib/axiosInstance as a test's vi.mock makes it: the test's own exports (its
 * client as `default`, say) and the module's OWN_ERRORS, so a screen that
 * passes OWN_ERRORS loads in the test as it does in the app, and an assertion
 * on a request's config reads what the app sends. Hand-made mocks left it out,
 * and what read it failed to load in those tests (the doc's comments and page
 * overlays in noFixedToolbar.test), or kept a value of their own ({} in 40),
 * which their assertions then read. OWN_ERRORS comes last so a test can't swap
 * one in, and from lib/http/ownErrors so this doesn't load the client, its
 * store and its toasts. vi.mock is hoisted above the imports, so a test reaches
 * this inside its factory:
 *
 *   vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get } }))
 */
export function axiosInstanceModule<M extends object>(exports: M) {
  return { ...exports, OWN_ERRORS }
}
