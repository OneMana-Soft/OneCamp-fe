import { celebrate } from "@/lib/celebrateSoon"
import { prefersReducedMotion } from "@/lib/reducedMotion"
/**
 * The first message in a conversation (design v3 chat, C60): the burst comes
 * from where the eye has gone, the new row's avatar, 200 ms after the row
 * starts to rise, with one ring in the logo's gradient expanding from it (the
 * ring motif, used once: the celebration's signature). Nothing under reduced
 * motion. The caller decides it is the first (isFirstMessage and
 * claimFirstMessage), as before.
 */
export function celebrateFirstMessage(scope?: Element | null): void {
    if (typeof window === "undefined" || prefersReducedMotion()) return
    window.setTimeout(() => {
        const root = scope ?? document
        const avatars = root.querySelectorAll("[data-message-row] [data-row-avatar]")
        const avatar = avatars[avatars.length - 1] as HTMLElement | undefined
        if (!avatar) return
        celebrate(avatar, { count: 10 })
        ring(avatar)
    }, 200)
}

function ring(el: HTMLElement) {
    const box = el.getBoundingClientRect()
    const r = document.createElement("div")
    r.setAttribute("aria-hidden", "true")
    r.setAttribute("data-celebrate-ring", "")
    r.style.cssText = [
        "position:fixed",
        `left:${box.left}px`,
        `top:${box.top}px`,
        `width:${box.width}px`,
        `height:${box.height}px`,
        "border-radius:9999px",
        "pointer-events:none",
        "z-index:var(--z-toast, 800)",
        "padding:2px",
        "background:linear-gradient(140deg, var(--progress-from, #FF8A00), var(--progress-to, #FF3D00))",
        "-webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        "-webkit-mask-composite:xor",
        "mask-composite:exclude",
    ].join(";")
    document.body.appendChild(r)
    if (typeof r.animate !== "function") {
        r.remove()
        return
    }
    const a = r.animate([{ transform: "scale(1)", opacity: 0.8 }, { transform: "scale(1.6)", opacity: 0 }], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" })
    a.finished.then(() => r.remove(), () => r.remove())
    window.setTimeout(() => r.remove(), 700)
}
