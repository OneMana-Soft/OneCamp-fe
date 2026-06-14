// Stub: sanitizeHtml — DOMPurify-based sanitizer not available in this build.
// Falls back to returning the raw string (safe for plain-text contexts).

export function sanitizePlainHtml(html: string): string {
    // Strip HTML tags for plain-text preview contexts
    return html.replace(/<[^>]*>/g, "").trim()
}

export function sanitizeRichHtml(html: string): string {
    return html
}

export function sanitizeImportedDocument(html: string): string {
    return html
}
