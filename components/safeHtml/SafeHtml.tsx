"use client"

/**
 * <SafeHtml> — hydration-safe wrapper for `dangerouslySetInnerHTML`.
 *
 * Why this exists:
 *   `lib/sanitizeHtml.ts` uses plain `dompurify`, which is browser-only.
 *   On the server it returns "" (we deliberately avoid pulling JSDOM
 *   into the SSR runtime — it produces both Turbopack NFT panics and
 *   prerender ERR_REQUIRE_ESM errors, and it's pure overhead for a
 *   workload that's all client-rendered anyway).
 *
 *   That means `sanitizeRichHtml(x)` returns "" on the server. If the
 *   first client render ALSO returns "" (which it does — the dompurify
 *   call won't run before useLayoutEffect), and then we update state
 *   inside useLayoutEffect to inject the sanitised HTML, the visible
 *   result is:
 *     - SSR HTML: <div></div>
 *     - First paint: <div></div>  (matches → no hydration mismatch)
 *     - After hydration: <div>...sanitised...</div>
 *
 *   The "after hydration" pass happens inside useLayoutEffect — which
 *   runs synchronously after DOM mutation but before the browser
 *   paints — so users never see a flash of empty content.
 *
 * Migration:
 *   Replace
 *     <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(x) }} />
 *   with
 *     <SafeHtml html={x} as="div" sanitizer={sanitizeRichHtml} />
 */

import React, { useLayoutEffect, useState } from "react"

type Sanitizer = (html: string) => string

interface SafeHtmlProps extends React.HTMLAttributes<HTMLElement> {
    /** Raw, untrusted HTML. Will be passed through `sanitizer`. */
    html: string | null | undefined
    /** Which sanitizer to apply. Pulled from `lib/sanitizeHtml.ts`. */
    sanitizer: Sanitizer
    /** The element tag to render. Defaults to `div`. */
    as?: keyof React.JSX.IntrinsicElements
}

/**
 * SafeHtml renders `html` after passing it through `sanitizer`.
 *
 * The sanitisation happens inside `useLayoutEffect` so:
 *   - The server emits an empty container (no JSDOM dependency).
 *   - The first client render also emits empty (matches SSR → no
 *     hydration warning).
 *   - useLayoutEffect runs synchronously after mount but before
 *     paint — DOMPurify processes the HTML and we set state, which
 *     triggers an immediate re-render with the sanitised output.
 *
 * Net visual effect: identical to a synchronous sanitiser call. No
 * flash of unstyled content.
 */
export const SafeHtml: React.FC<SafeHtmlProps> = ({
    html,
    sanitizer,
    as = "div",
    ...rest
}) => {
    const [sanitised, setSanitised] = useState<string>("")

    // useLayoutEffect runs after DOM commit but before paint. Using
    // useLayoutEffect (not useEffect) means there is no perceptible
    // delay between hydration and the sanitised content appearing.
    useLayoutEffect(() => {
        setSanitised(html ? sanitizer(html) : "")
    }, [html, sanitizer])

    // React complains if as is a custom element. Cast to a known
    // intrinsic to keep TypeScript happy without relaxing types
    // for the consumer.
    const Tag = as as unknown as keyof React.JSX.IntrinsicElements
    return React.createElement(Tag, {
        ...rest,
        dangerouslySetInnerHTML: { __html: sanitised },
    })
}

export default SafeHtml
