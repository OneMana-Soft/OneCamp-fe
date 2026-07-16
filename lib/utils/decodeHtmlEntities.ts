/**
 * decodeHtmlEntities — decode the HTML entities that survive tag-stripping, for
 * PLAIN-TEXT contexts (list previews, notifications) where the string is
 * rendered as text (React/JSX shows entities literally, so "&#39;" would
 * otherwise appear verbatim). SSR-safe and dependency-free: it does not touch
 * the DOM, so it works server-side, in tests, and in web workers.
 *
 * Only the common entities are handled (named + numeric/hex); that covers
 * everything our composer-produced HTML emits (apostrophes -> &#39;, quotes,
 * ampersands, angle brackets, nbsp). &amp; is decoded LAST so a double-encoded
 * sequence like "&amp;#39;" resolves correctly rather than turning into "'".
 */

function fromCodePoint(cp: number): string {
    // Guard against invalid/out-of-range code points so a malformed entity can
    // never throw; leave it as-is by returning an empty string in that case.
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
    try {
        return String.fromCodePoint(cp);
    } catch {
        return "";
    }
}

export function decodeHtmlEntities(input: string | null | undefined): string {
    if (!input) return "";
    return input
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
