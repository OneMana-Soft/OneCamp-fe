/**
 * The embed code of a share link another site may frame (miro-34): the HTML a
 * person pastes into their own site to show a board there, live and read only.
 * It frames <link>/embed (app/guest/b/[token]/embed), the one kind of page
 * another site may frame (lib/security/framing.ts). The reverse of
 * providers.ts, which says what OneCamp frames.
 *
 * The title is the board's name, for the frame's accessible name. It goes into
 * someone else's page, so it is escaped: a name with a quote or a tag in it
 * stays text there.
 */
export function embedCode(link: string, title: string): string {
    const src = `${link.replace(/\/+$/, "")}/embed`
    return `<iframe src="${attr(src)}" title="${attr(title)}" width="100%" height="480" style="border:0" loading="lazy" allowfullscreen></iframe>`
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
