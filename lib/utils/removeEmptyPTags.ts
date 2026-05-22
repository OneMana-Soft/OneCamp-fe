/**
 * Trim leading/trailing whitespace and "empty" paragraph blocks from the HTML
 * produced by TipTap before a message is persisted or sent.
 *
 * "Empty" paragraphs include any of:
 *  - `<p></p>`
 *  - `<p><br></p>` / `<p><br/></p>` (hard-break placeholders)
 *  - `<p>&nbsp;</p>`
 *  - any combination of whitespace, `<br>` and `&nbsp;` inside `<p>`
 *
 * The function also strips a single run of trailing/leading `<br>` or `&nbsp;`
 * inside the final / opening paragraph so users don't accidentally send a
 * message that ends with several blank lines.
 *
 * Internal empty paragraphs are kept on purpose — they represent intentional
 * blank lines inside the body of a message.
 */
export function removeEmptyPTags(input: string | null | undefined): string {
    if (!input) return ''

    // Whitespace, <br>, and &nbsp; — the content we treat as "empty" inside <p>.
    const emptyContent = '(?:\\s|<br\\s*\\/?>|&nbsp;|&#160;)'
    const emptyPBlock = `<p\\b[^>]*>${emptyContent}*<\\/p>`

    let s = input

    // Strip empty paragraph blocks at the start and end. Loop because
    // multiple empty blocks may be stacked (e.g. <p></p><p><br></p>).
    const leadingRe = new RegExp(`^\\s*(?:${emptyPBlock}\\s*)+`, 'i')
    const trailingRe = new RegExp(`(?:\\s*${emptyPBlock})+\\s*$`, 'i')
    let prev: string
    do {
        prev = s
        s = s.replace(leadingRe, '').replace(trailingRe, '')
    } while (s !== prev)

    // Trim trailing <br>/&nbsp;/whitespace inside the final <p> block, and
    // matching leading garbage inside the first <p> block.
    s = s.replace(new RegExp(`(${emptyContent})+(<\\/p>\\s*)$`, 'i'), '$2')
    s = s.replace(new RegExp(`^(\\s*<p\\b[^>]*>)(${emptyContent})+`, 'i'), '$1')

    return s.trim()
}
