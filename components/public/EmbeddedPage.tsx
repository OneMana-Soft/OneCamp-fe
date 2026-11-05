import type { ReactNode } from "react"

/**
 * A page another site frames (an embed; lib/security/framing.ts lists them),
 * less what OneCamp's own shell would put on it. The shell's corner cards
 * (components/ui/CornerStack: the install prompt, tips, the demo's prompts)
 * speak for OneCamp the app, and another site's page isn't ours to put them
 * on, so inside the frame they never draw.
 *
 * Plain CSS in the page's own HTML, from its layout: it holds from the first
 * paint and in every state of the page (opening, turned off, an error), and no
 * other page pays a byte for it. It sits outside the stylesheet's layers, so it
 * wins over every corner rule in app/globals.css.
 */
export const SHELL_CORNERS = ".corner-stack"

export function EmbeddedPage({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <style>{`${SHELL_CORNERS}{display:none}`}</style>
        </>
    )
}
