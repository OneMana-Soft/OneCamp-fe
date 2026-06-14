/**
 * Single source of truth for HTML sanitisation on the client.
 *
 * Every `dangerouslySetInnerHTML` site in the app must funnel through
 * one of the helpers exported here. We use plain `dompurify`
 * (browser-only) plus the <SafeHtml> component for hydration safety.
 *
 * Why plain dompurify, not isomorphic-dompurify:
 *   isomorphic-dompurify bundles JSDOM, which uses
 *   `node:worker_threads`. Two failure modes follow:
 *     1. Turbopack 16's NFT (Node File Tracing) panics on the
 *        `node:` import scheme during `next build`.
 *     2. Even with `serverExternalPackages`, JSDOM transitively
 *        require()s `html-encoding-sniffer` which has CJS/ESM
 *        interop bugs on Node 22+, producing prerender errors
 *        that pollute the build log.
 *
 *   Plain dompurify is browser-only — zero server-side footprint,
 *   zero bundler issues. Server-side renders return an empty string
 *   and the <SafeHtml> wrapper component injects sanitised content
 *   on mount via useLayoutEffect, avoiding hydration mismatches.
 *
 * Why three exported variants instead of one knob with a giant config:
 *   - Each call site has a clear intent (rich-text body, lightweight
 *     preview, search-highlight). Naming them keeps the policy
 *     reviewable.
 *   - DOMPurify is fast enough that a small fixed cost per call is
 *     fine. Memoisation isn't worth the cache key complexity.
 *
 * SECURITY POSTURE
 *   - All variants drop <script>, <iframe>, <object>, <embed>, on*
 *     event-handler attributes, and `javascript:` URLs.
 *   - Anchor targets get `rel="noopener noreferrer"` enforced via a
 *     DOMPurify hook below.
 *   - SVG is BLOCKED. SVG can carry inline JavaScript and is the
 *     classic stored-XSS vector for "image" uploads.
 */

import DOMPurify from "dompurify"

// dompurify is browser-only. On the server we return "" so that:
//   - the SSR HTML for any sanitised div is empty
//   - the <SafeHtml> wrapper (or a manual useEffect) replaces it on
//     mount with the proper sanitised HTML
//   - there is no hydration mismatch because the server emits "" and
//     the first client render also emits "" before useLayoutEffect
//     fires.
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined"

let hooksInstalled = false
function ensureHooks() {
    if (hooksInstalled || !isBrowser) return
    hooksInstalled = true

    // Force every external link to open in a new tab with security
    // attributes — protects against tabnabbing attacks where the new
    // page can rewrite window.opener.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A") {
            const a = node as HTMLAnchorElement
            const href = a.getAttribute("href") || ""
            if (/^\s*(javascript|vbscript|data|file):/i.test(href)) {
                a.removeAttribute("href")
            }
            if (a.hasAttribute("href")) {
                a.setAttribute("target", "_blank")
                a.setAttribute("rel", "noopener noreferrer nofollow")
            }
        }
    })
}

/**
 * sanitizeRichHtml — the default for user-authored bodies (event
 * descriptions, doc bodies, post content, comments). Allows the same
 * shape Tiptap produces.
 */
export function sanitizeRichHtml(html: string): string {
    if (!html) return ""
    if (!isBrowser) return ""
    ensureHooks()
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
            "h1", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "li",
            "blockquote", "hr",
            "a", "img",
            "table", "thead", "tbody", "tr", "th", "td",
            "span", "div",
        ],
        ALLOWED_ATTR: [
            "href", "src", "alt", "title", "class",
            "data-id", "data-checked",
            "colspan", "rowspan",
            "target", "rel",
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#|\/)/i,
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg", "math", "form", "input", "button", "textarea", "select", "option", "link", "meta"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    })
}

/**
 * sanitizePlainHtml — strict allowlist for places that should only
 * carry text + minimal structure (search highlights). Inline marks
 * only; no block elements, no links.
 */
export function sanitizePlainHtml(html: string): string {
    if (!html) return ""
    if (!isBrowser) return ""
    ensureHooks()
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "s", "del", "mark", "code", "br", "span"],
        ALLOWED_ATTR: ["class"],
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg", "form"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
    })
}

/**
 * sanitizeImportedDocument — used for output of mammoth (DOCX) and
 * XLSX-to-HTML. These libraries faithfully convert the source
 * document, including any embedded `<script>` or `<style>` payloads.
 */
export function sanitizeImportedDocument(html: string): string {
    if (!html) return ""
    if (!isBrowser) return ""
    ensureHooks()
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            "p", "br", "strong", "b", "em", "i", "u", "s", "del", "code", "pre",
            "h1", "h2", "h3", "h4", "h5", "h6",
            "ul", "ol", "li",
            "blockquote", "hr",
            "a", "img",
            "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "col", "colgroup",
            "span", "div",
        ],
        ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "colspan", "rowspan", "target", "rel"],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#)/i,
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg", "form", "input", "button", "link", "meta"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover"],
    })
}
