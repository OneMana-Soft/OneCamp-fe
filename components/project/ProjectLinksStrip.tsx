"use client"

// A project's links on its home (basecamp-16). On a computer, the first three
// beside the project's name, each with its site's icon, opening its page in a
// new tab, and "All", which opens the Links tool. On a phone, one chip in the
// header's row of chips that opens it: the icons stacked and the count, named
// "4 links", so it fits beside the update and forecast chips on a 390 screen
// (with the word, it ran past the edge), built as the update chip beside it is
// (the shared chip at h-6), so the row's chips stand level. Nothing
// shows until the project has a link, and each sits where a row's height is
// already set, so the page never moves when they come. For the project's
// members and admins, who have the tool.

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LinkIconTile } from "@/components/project/LinkIconTile"
import { useProjectLinks } from "@/hooks/useProjectLinks"
import { cn } from "@/lib/utils/helpers/cn"
import { linkPicture, linksWord } from "@/lib/work/projectLinks"

/** How many links the computer's strip names before "All". */
const SHOWN = 3

/** Opens the project's Links tool: ?tool=links, which the project's tools read (ProjectToolButtons). */
function useOpenLinks() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return () => {
    const q = new URLSearchParams(params?.toString() ?? "")
    q.set("tool", "links")
    router.replace(`${pathname}?${q}`, { scroll: false })
  }
}

/** The shared chip. The computer's strip, alone on the title's row, sets it level with the name at h-7; the phone's chip takes the update chip's h-6. */
const chip = "chip min-w-0 gap-1.5 text-ink-2 transition-colors hover:bg-press hover:text-foreground"

export function ProjectLinksStrip({ projectId, canOpen, className }: { projectId: string; canOpen: boolean; className?: string }) {
  const { links } = useProjectLinks(canOpen ? projectId : undefined)
  const open = useOpenLinks()
  if (!links?.length) return null
  const more = links.length > SHOWN
  return (
    <nav aria-label="Project links" data-project-links="" className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {links.slice(0, SHOWN).map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" title={l.title} className={cn(chip, "h-7 max-w-[160px]")}>
          <LinkIconTile src={linkPicture(projectId, l, "icon")} />
          <span className="truncate">{l.title}</span>
        </a>
      ))}
      <button type="button" onClick={open} aria-label={more ? `All ${linksWord(links.length)}` : undefined} className={cn(chip, "h-7 shrink-0 font-medium")}>
        {more ? `All ${links.length}` : "All links"}
      </button>
    </nav>
  )
}

export function ProjectLinksChip({ projectId, canOpen, className }: { projectId: string; canOpen: boolean; className?: string }) {
  const { links } = useProjectLinks(canOpen ? projectId : undefined)
  const open = useOpenLinks()
  if (!links?.length) return null
  return (
    <button type="button" onClick={open} aria-label={linksWord(links.length)} title={linksWord(links.length)} data-project-links-chip="" className={cn(chip, "h-6", className)}>
      <span className="flex -space-x-1" aria-hidden="true">
        {links.slice(0, SHOWN).map((l) => (
          <LinkIconTile key={l.id} src={linkPicture(projectId, l, "icon")} />
        ))}
      </span>
      <span className="tabular-nums">{links.length}</span>
    </button>
  )
}
