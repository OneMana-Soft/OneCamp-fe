// The credit on every page OneCamp shows to people outside the workspace:
// booking pages, forms, guest links. Every client a team invites sees it once,
// and it says where it came from (the product site counts ?ref= as an event),
// so we can tell which surface brings people to the product.
//
// The site comes from NEXT_PUBLIC_PRODUCT_SITE (.env.production), never a
// literal here: without it the credit is plain text and links nowhere.

export type PublicSurface = "booking" | "booked" | "form" | "invitation" | "guest-channel" | "guest-project" | "guest-doc" | "guest-board" | "guest-table" | "guest-meeting" | "not-found"

const site = () => (process.env.NEXT_PUBLIC_PRODUCT_SITE || "").replace(/\/$/, "")

/** Where the credit links, or "" when this build names no product site. */
const madeWithHref = (surface: PublicSurface) => (site() ? `${site()}/?ref=made-with-${surface}` : "")

/** The ring logo at 14 px: the logo's gradient ring. */
function RingMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="made-with-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--progress-from, #FF8A00)" }} />
          <stop offset="1" style={{ stopColor: "var(--progress-to, #FF3D00)" }} />
        </linearGradient>
      </defs>
      <circle cx="7" cy="7" r="5" fill="none" stroke="url(#made-with-ring)" strokeWidth="2.5" />
    </svg>
  )
}

/**
 * The credit as a badge (admin.md G1, work.md W46): a 28 px pill on e1 with
 * the ring logo and "Made with OneCamp" at 12/510 ink-2, rising to e2 under
 * the pointer, centred under the page's card. It read as a footnote.
 */
export function MadeWithOneCamp({ surface, label = "Made with OneCamp", className = "" }: { surface: PublicSurface; label?: string; className?: string }) {
  const href = madeWithHref(surface)
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-full bg-raised px-3 text-meta font-medium text-ink-2 shadow-e1"
  return (
    <p className={`flex justify-center ${className}`} data-made-with="">
      {href ? (
        <a href={href} target="_blank" rel="noopener" className={`${chip} transition-[color,box-shadow] duration-[140ms] hover:text-ink hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`} data-made-with-badge="">
          <RingMark />
          {label}
        </a>
      ) : (
        <span className={chip} data-made-with-badge="">
          <RingMark />
          {label}
        </span>
      )}
    </p>
  )
}
