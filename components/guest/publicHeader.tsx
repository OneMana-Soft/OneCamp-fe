// PublicFrame's band and header, light enough for the member door (calls HU13).
import * as React from "react"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"
import { GUEST_HUE } from "./guestUi"
import { namedWorkspace } from "@/lib/workspaceName"

/**
 * The workspace a public page belongs to (G1, content.md rule 6): the
 * server's name for it (the guest answers' `workspace_name`), else this
 * build's org name, else none (the mark alone). Pure but for the build.
 */
export function publicWorkspaceName(fromServer?: string | null): string | undefined {
  return namedWorkspace(fromServer) || undefined
}

/** The workspace's mark: a tile in its hue holding the ring. */
export function WorkspaceMark({ size = 24, className }: { size?: 16 | 24; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-workspace-mark=""
      className={cn(
        HUE_CLASS[GUEST_HUE],
        "inline-flex shrink-0 items-center justify-center bg-hue text-white",
        size === 24 ? "size-6 rounded-lg" : "size-4 rounded-[5px]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className={size === 24 ? "size-3.5" : "size-2.5"} fill="none" stroke="currentColor" strokeWidth={size === 24 ? 3.4 : 4}>
        <circle cx="12" cy="12" r="7" />
      </svg>
    </span>
  )
}

export function PublicHeader({ title, titleFromSm, workspaceName, actions, header = true, band = true }: { title?: React.ReactNode; titleFromSm?: boolean; workspaceName?: string; actions?: React.ReactNode; header?: boolean; band?: boolean }) {
  const [scrolled, setScrolled] = React.useState(false)
  const name = publicWorkspaceName(workspaceName)
  React.useEffect(() => {
    if (!header) return
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [header])
  return (
    <>
      {band && <div aria-hidden="true" data-guest-band="" className={cn(HUE_CLASS[GUEST_HUE], "h-1 w-full shrink-0 bg-hue")} />}
      {header ? (
        <header
          data-scrolled={scrolled}
          className="public-header sticky top-0 z-10 flex h-[52px] items-center gap-3 px-4 transition-[background-color,box-shadow] sm:h-14 sm:px-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <WorkspaceMark />
            {/* Whose page this is, then what it is (G1): the name goes first
                when a phone runs short, the page's title keeps its room. */}
            {name ? (
              <span data-workspace-name="" className="min-w-0 shrink-[2] truncate text-ui font-semibold text-ink">
                {name}
              </span>
            ) : null}
            {title ? (
              <>
                {name ? <span aria-hidden="true" className={cn("mx-1 h-4 w-px shrink-0 bg-line-2", titleFromSm && "max-sm:hidden")} /> : null}
                <h1 className={cn("min-w-0 truncate text-ui font-medium text-ink-2", titleFromSm && "max-sm:hidden")}>{title}</h1>
              </>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
    </>
  )
}
