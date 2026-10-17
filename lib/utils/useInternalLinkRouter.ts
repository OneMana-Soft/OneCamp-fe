import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { isPlainLeftClick } from "@/lib/ui/linkClick"

// useInternalLinkRouter returns a click handler that intercepts clicks on
// INTERNAL app links (same-origin paths beginning with "/app") inside rendered
// message content and routes them through Next.js client navigation instead of
// a full page reload. This is what makes deep-linked citations (and any pasted
// OneCamp link) actually open their target: the shared rich-text renderer marks
// links up as <a href> but is configured with openOnClick:false, so without
// this the anchors are inert.
//
// It deliberately does nothing for:
//   - non-link clicks (no enclosing <a>),
//   - external links (http(s)://, mailto:, "#", etc.) — left to the browser,
//   - modifier / non-primary clicks (cmd/ctrl/shift/alt or middle-click) so
//     "open in new tab" keeps working,
//   - already-handled events (defaultPrevented),
//   - while disabled (e.g. the message is being edited).
//
// Attach via onClickCapture so it runs before the editor's own click handling.
/** The in-app path an href opens, or null for one that leaves the app. Pure for a given origin. */
export function inAppPath(href: string, origin: string = typeof window !== "undefined" ? window.location.origin : ""): string | null {
    if (href.startsWith("/app")) return href
    if (!/^https?:\/\//i.test(href)) return null
    try {
        const url = new URL(href)
        return url.origin === origin && url.pathname.startsWith("/app") ? url.pathname + url.search + url.hash : null
    } catch {
        return null
    }
}

export function useInternalLinkRouter(enabled: boolean = true) {
    const router = useRouter()

    return useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            if (!enabled) return
            if (e.defaultPrevented) return
            // Respect "open in new tab/window" and non-primary buttons.
            if (!isPlainLeftClick(e)) return

            const target = e.target as HTMLElement | null
            const anchor = target?.closest("a") as HTMLAnchorElement | null
            if (!anchor) return

            // The raw attribute: the app's own paths ("/app/…"), or an address
            // on this origin someone pasted whole ("https://<this app>/app/…").
            const href = anchor.getAttribute("href") || ""
            const path = inAppPath(href)
            if (!path) return

            e.preventDefault()
            router.push(path)
        },
        [enabled, router],
    )
}
