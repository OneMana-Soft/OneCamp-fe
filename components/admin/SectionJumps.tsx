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

export function SectionJumps({ jumps }: { jumps: Jump[] }) {
  return (
    <nav aria-label="On this page" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-muted-foreground">On this page:</span>
      {jumps.map((j) => (
        <button
          key={j.id}
          type="button"
          onClick={() => document.getElementById(j.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="rounded-sm text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {j.label}
        </button>
      ))}
    </nav>
  )
}
