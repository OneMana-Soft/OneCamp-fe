/**
 * What a full-screen overlay's own foot controls take of the screen's foot,
 * so toasts stand clear of them from sm up (app/phone.css): there toasts sit
 * bottom right, 24px off the foot, and up to ~885px wide the lightbox's
 * centred zoom controls reach under them, so a toast raised over the lightbox
 * at a tablet's width covered their right end and took their taps; a video's
 * seek bar and buttons run the stage's whole foot, at every width. The page
 * carries html[data-overlay-foot] while any overlay holds it, and
 * --overlay-foot, the highest held foot. Counted, so nested or double mounts
 * and a fast close and open are safe; it writes only its own two, never
 * --phone-floor or --mobile-drawer-h. Returns the release, safe to call twice.
 */
const feet: { value: string }[] = []
export function holdOverlayFoot(value: string): () => void {
    const mine = { value }
    feet.push(mine)
    const show = () => {
        const root = document.documentElement
        if (!feet.length) {
            root.removeAttribute("data-overlay-foot")
            root.style.removeProperty("--overlay-foot")
            return
        }
        const values = [...new Set(feet.map((f) => f.value))]
        root.style.setProperty("--overlay-foot", values.length > 1 ? `max(${values.join(", ")})` : values[0])
        root.setAttribute("data-overlay-foot", "")
    }
    show()
    let held = true
    return () => {
        if (!held) return
        held = false
        feet.splice(feet.indexOf(mine), 1)
        show()
    }
}
