/**
 * Which pages another site may frame (miro-34).
 *
 * Every page sends X-Frame-Options: SAMEORIGIN, and its report-only policy
 * says frame-ancestors 'self': OneCamp frames its own previews, and no other
 * site frames OneCamp. The pages listed here are the one exception: the
 * public, read-only view a share link opens, which a person pastes into
 * another site as an embed code (a board's is <link>/embed). They:
 * - drop X-Frame-Options;
 * - send an ENFORCED `Content-Security-Policy: frame-ancestors *`, which a
 *   browser obeys over X-Frame-Options;
 * - keep the report-only policy without its frame-ancestors, so its reports
 *   stay about what it checks.
 * Any site may frame them: there is no per-workspace list of the sites
 * allowed to (Miro Enterprise has one).
 *
 * Each entry is a next.config `headers()` source. framing.test.ts puts every
 * route of the app through next.config's own rules and fails when any page
 * but these may be framed.
 */
export const EMBEDDABLE_PAGES = ["/guest/b/:token/embed"] as const

/** The enforced policy an embeddable page sends. */
export const EMBED_FRAME_POLICY = "frame-ancestors *"

const ENFORCED = "content-security-policy"
const REPORT_ONLY = "content-security-policy-report-only"

/** One embeddable page as a regular expression without its leading slash: a :param is one segment. */
function pagePattern(page: string): string {
    return page
        .slice(1)
        .split("/")
        .map((s) => (s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/")
}

/**
 * The source of every path BUT the embeddable pages, for the rule that sends
 * X-Frame-Options: a negative lookahead inside a param, the form Next
 * documents ("/:path((?!another-page$).*)"). A trailing slash is the same
 * page, so the two rules share no path.
 */
export const NOT_EMBEDDABLE = `/:path((?!(?:${EMBEDDABLE_PAGES.map(pagePattern).join("|")})/?$).*)`

type Header = { key: string; value: string }

/**
 * The headers an embeddable page sends, from the ones every page sends: the
 * same, less X-Frame-Options, with `framablePolicy` (the policy built without
 * its frame-ancestors) in place of each policy, and frame-ancestors * enforced.
 */
export function embeddableHeaders(headers: readonly Header[], framablePolicy: string): Header[] {
    const enforced = headers.some((h) => h.key.toLowerCase() === ENFORCED)
    const out = headers
        .filter((h) => h.key.toLowerCase() !== "x-frame-options")
        .map((h) => {
            const key = h.key.toLowerCase()
            // Once the policy is enforced (next.config), frame-ancestors * joins it: a second header of one name would replace it.
            if (key === ENFORCED) return { key: h.key, value: `${framablePolicy}; ${EMBED_FRAME_POLICY}` }
            if (key === REPORT_ONLY) return { key: h.key, value: framablePolicy }
            return h
        })
    return enforced ? out : [...out, { key: "Content-Security-Policy", value: EMBED_FRAME_POLICY }]
}
