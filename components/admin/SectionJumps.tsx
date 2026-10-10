"use client"

// A row of jumps to the cards of one long admin section.
//
// AI & agents stacks six cards, several of them long, so reaching MCP servers
// or the activity log meant scrolling past everything above it. Buttons, not
// links: the address holds which section is open, and a #fragment there is
// already read as a deep link (?tab=settings#audit-log).


interface Jump {
  id: string
  label: string
}

/**
 * Scrolls to the section and puts focus on its heading.
 *
 * Smooth only when the person hasn't asked for less motion: it always
 * scrolled smoothly. And focus follows the jump, so the next Tab carries on
 * from the section rather than from the jump row back at the top.
 */
function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  const heading = target.querySelector<HTMLElement>("h2, h3") ?? target
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
  heading.focus({ preventScroll: true })
}

export function SectionJumps({ jumps }: { jumps: Jump[] }) {
  return (
    <nav aria-label="On this page" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">On this page:</span>
      {jumps.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => jumpTo(j.id)}
          className="rounded-sm text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {j.label}
        </button>
      ))}
    </nav>
  )
}
