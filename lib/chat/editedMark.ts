const ESCAPE_ATTR: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * "(edited)" after a message's last word (design v3 chat, C27), with the times
 * as its tooltip. Added to the HTML after it was sanitised, from text this
 * component wrote (escaped), so nothing a message holds can reach it.
 */
export function withEditedMark(html: string, title?: string): string {
    if (!title) return html;
    const mark = `<span class="msg-edited" title="${title.replace(/[&<>"]/g, (c) => ESCAPE_ATTR[c])}">(edited)</span>`;
    const at = html.lastIndexOf("</p>");
    // Inside the last paragraph when it closes the body; after it otherwise
    // (a list or a code block last), where it still reads as the message's.
    if (at >= 0 && html.slice(at + 4).trim() === "") return html.slice(0, at) + mark + html.slice(at);
    return html + `<p>${mark}</p>`;
}

