import { useCallback } from "react"
import { useRouter } from "next/navigation"

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
export function useInternalLinkRouter(enabled: boolean = true) {
    const router = useRouter()

    return useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            if (!enabled) return
            if (e.defaultPrevented) return
            // Respect "open in new tab/window" and non-primary buttons.
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

            const target = e.target as HTMLElement | null
            const anchor = target?.closest("a") as HTMLAnchorElement | null
            if (!anchor) return

            // Use the raw attribute (not anchor.href, which the browser resolves
            // to an absolute URL) so we only act on genuinely internal paths.
            const href = anchor.getAttribute("href") || ""
            if (!href.startsWith("/app")) return

            e.preventDefault()
            router.push(href)
        },
        [enabled, router],
    )
}
