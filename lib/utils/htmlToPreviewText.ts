// htmlToPreviewText converts a rich-text (HTML) message body into a short,
// single-line plain-text snippet suitable for a reply pill / preview label.
// It is intentionally lightweight (no DOM, SSR-safe): strip tags, decode the
// handful of entities the editor emits, collapse whitespace, and cap length.
// Not a sanitizer — output is rendered as text, never as HTML.
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
}

const MAX_PREVIEW_LENGTH = 140

export function htmlToPreviewText(html?: string, maxLength: number = MAX_PREVIEW_LENGTH): string {
  if (!html) return ""

  const text = html
    // Block-level boundaries become spaces so words don't run together.
    .replace(/<\/(p|div|li|h[1-6]|blockquote|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    // Drop every remaining tag.
    .replace(/<[^>]*>/g, "")
    // Decode the common entities.
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY_MAP[m] ?? m)
    // Collapse runs of whitespace to a single space.
    .replace(/\s+/g, " ")
    .trim()

  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + "…"
}
