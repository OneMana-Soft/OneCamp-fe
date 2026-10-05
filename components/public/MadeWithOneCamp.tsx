// The credit on every page OneCamp shows to people outside the workspace:
// booking pages, forms, guest links. Every client a team invites sees it once,
// and it says where it came from (the product site counts ?ref= as an event),
// so we can tell which surface brings people to the product.
//
// The site comes from NEXT_PUBLIC_PRODUCT_SITE (.env.production), never a
// literal here: without it the credit is plain text and links nowhere.

export type PublicSurface = "booking" | "booked" | "form" | "guest-channel" | "guest-project" | "guest-doc" | "guest-board" | "guest-table"

const site = () => (process.env.NEXT_PUBLIC_PRODUCT_SITE || "").replace(/\/$/, "")

/** Where the credit links, or "" when this build names no product site. */
export const madeWithHref = (surface: PublicSurface) => (site() ? `${site()}/?ref=made-with-${surface}` : "")

export function MadeWithOneCamp({ surface, label = "Made with OneCamp", className = "" }: { surface: PublicSurface; label?: string; className?: string }) {
  const href = madeWithHref(surface)
  return (
    <p className={`text-center text-xs text-muted-foreground ${className}`}>
      {href ? (
        <a href={href} target="_blank" rel="noopener" className="underline-offset-2 hover:text-foreground hover:underline">
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  )
}
