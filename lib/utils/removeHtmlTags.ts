// Convert stored rich-text HTML (TipTap output, bot posts, etc.) into clean,
// display-safe PLAIN TEXT for previews, snippets, notifications, and list rows.
//
// Stored message bodies are HTML, so special characters are escaped to entities
// (' → &#39;, " → &#34;, & → &amp;, < → &lt; …). Stripping only the <tags> —
// as the old implementation did — left those entities visible, so an activity
// row read "Here&#39;s a summary" instead of "Here's a summary". This strips
// tags AND decodes entities so previews read like real prose.
//
// SAFETY: the result is intended to be rendered as TEXT (React children, which
// auto-escape), never injected as HTML. Decoding entities here is therefore
// XSS-safe: a decoded "<" is shown literally, not parsed as markup. Do NOT feed
// this output back into dangerouslySetInnerHTML.
//
// The decoder is pure and dependency-free (no DOM), so it behaves identically
// on the server (SSR) and client, and can't execute scripts.

// Common named HTML entities. Unknown names are left untouched (safe): a rare
// entity is far better shown verbatim than mangled. Numeric refs (decimal and
// hex) are handled generically below, which already covers &#39;/&#34; etc.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  laquo: "«",
  raquo: "»",
  deg: "°",
  euro: "€",
  pound: "£",
  cent: "¢",
  middot: "·",
  bull: "•",
};

// Matches a single HTML entity: numeric decimal (&#39;), numeric hex (&#x27;),
// or named (&amp;). Captures the inner token so the replacer can resolve it.
const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Decode HTML entities in a plain-text string. Pure + SSR-safe. */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(ENTITY_RE, (match, token: string) => {
    if (token[0] === "#") {
      const isHex = token[1] === "x" || token[1] === "X";
      const code = parseInt(isHex ? token.slice(2) : token.slice(1), isHex ? 16 : 10);
      // Guard against invalid / out-of-range code points; leave those as-is.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const decoded = NAMED_ENTITIES[token.toLowerCase()];
    return decoded !== undefined ? decoded : match;
  });
}

/**
 * Strip HTML tags and decode entities, yielding display-safe plain text.
 * Safe on already-plain input (near no-op). Never returns null/undefined.
 */
export function removeHtmlTags(htmlString: string | null | undefined): string {
  if (!htmlString) return "";
  const withoutTags = htmlString.replace(/<[^>]*>/g, "");
  return decodeHtmlEntities(withoutTags);
}
