"use client"

// The project's Links tool (basecamp-16): every link as a card the server read
// from its page (its site's icon, its title, its site and a few words, and its
// preview picture), each opening the page in a new tab. The project's admins
// add a link by its address, and its card appears as the server reads the
// page; they rename a link and delete one, which Undo brings back. A refusal
// is said in place, in the server's words: not a web address, a link the
// project has already, a full list, an archived project.
//
// A chunk of its own, fetched on first open. The list and what is done with
// it come from useProjectLinks as props, so this chunk imports none of the
// shared core (main's chunking rule, 30 Oct).

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { LinkCardBody, LinkCardSkeleton, linkCardClass } from "@/components/message/LinkCard"
import { LinkIconTile } from "@/components/project/LinkIconTile"
import type { ProjectLinks } from "@/hooks/useProjectLinks"
import { MoreHorizontal, Pencil, Trash2 } from "@/lib/icons"
import { typedWebAddress } from "@/lib/links/typedWebAddress"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { LINK_TITLE_MOST, linkPicture, linkWhere, type ProjectLink } from "@/lib/work/projectLinks"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"

export function ProjectLinksDialog({ projectId, links: list, onClose }: { projectId: string; links: ProjectLinks; onClose: () => void }) {
  const { links, failed, retry, canManage, add, rename, remove, http, readAgain } = list
  const id = useId()
  const [address, setAddress] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  // The add form is noValidate: the browser's own check would stop "github.com/acme/site" before
  // submit sees it. Here it gains https://, and the server's words answer the rest (V-205).
  const submit = async () => {
    const url = typedWebAddress(address)
    if (adding || !url) return
    setAdding(true)
    setError(null)
    try {
      await add(url)
      setAddress("")
    } catch (e) {
      setError(apiErrorMessage(e, "That link couldn't be added. Try again."))
    } finally {
      setAdding(false)
    }
  }
  const drop = async (link: ProjectLink) => {
    setError(null)
    try {
      await remove(link.id)
      offerUndo(deletedTitle(link.title, "link"), () => restore(http, "link", link.id, readAgain))
    } catch (e) {
      setError(apiErrorMessage(e, `“${link.title}” couldn't be deleted. Try again.`))
    }
  }

  return (
    <ResponsiveDialog
      title="Links"
      description="The tools this project's people use elsewhere, each read from its page."
      onClose={onClose}
      wide
      footer={
        canManage ? (
          <div className="grid w-full gap-1.5">
            {error && (
              <p role="alert" className="text-meta text-danger-ink">
                {error}
              </p>
            )}
            <form
              id={`${id}-add`}
              noValidate
              data-project-link-add=""
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <Input
                type="url"
                inputMode="url"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="https://"
                aria-label="Link address"
                className="min-w-0 flex-1"
                // Busy, never disabled, while the server reads the page: a disabled field drops its
                // focus, and the dialog's focus trap then rings the whole dialog (V-247). The Add
                // button's busy keeps its focus the same way.
                readOnly={adding}
                aria-busy={adding || undefined}
              />
              <Button type="submit" size="sm" busy={adding} disabled={!address.trim()}>
                Add link
              </Button>
            </form>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {links === undefined && failed ? (
        <p role="alert" className="text-ui-sm text-danger-ink">
          This project&apos;s links couldn&apos;t be read.{" "}
          <button type="button" className="underline underline-offset-2" onClick={retry}>
            Try again
          </button>
        </p>
      ) : links === undefined ? (
        <div role="status" aria-label="Loading links" className="grid gap-2">
          <LinkCardSkeleton />
          <LinkCardSkeleton />
        </div>
      ) : links.length === 0 && !adding ? (
        <div data-project-links-empty="" className="rounded-xl bg-sunken px-4 py-6 text-center">
          <p className="text-ui font-medium text-ink">No links yet</p>
          <p className="mt-1 text-meta text-ink-3">
            {canManage
              ? "Add the design file, the shared folder or the repository this project's people open every day."
              : "The project's admins add the tools its people use elsewhere here."}
          </p>
        </div>
      ) : (
        <ul data-project-links-list="" className="grid gap-2">
          {links.map((link) => (
            <li key={link.id} data-project-link={link.id} className="flex min-w-0 items-center gap-1">
              {renaming === link.id ? (
                <RenameLink link={link} onDone={() => setRenaming(null)} onSave={(title) => rename(link.id, title)} />
              ) : (
                <>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={cn(linkCardClass, "max-w-none flex-1")}>
                    <LinkCardBody
                      // The link's own tile draws the surface: light under a site's icon, in dark too.
                      icon={<LinkIconTile src={linkPicture(projectId, link, "icon")} size="card" />}
                      iconClassName=""
                      title={link.title}
                      detail={linkWhere(link)}
                      footer={link.description ? <span className="mt-0.5 line-clamp-2 text-meta text-ink-3">{link.description}</span> : undefined}
                      trailing={link.has_image ? <LinkPreview src={linkPicture(projectId, link, "image")} /> : undefined}
                    />
                  </a>
                  {canManage && (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-11 shrink-0 sm:size-9" aria-label={`Options for ${link.title}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRenaming(link.id)}>
                          <Pencil className="size-4 text-muted-foreground" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => void drop(link)}>
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </li>
          ))}
          {/* The new link's card, at its size, while the server reads its page. */}
          {adding && (
            <li aria-label="Reading the link's page">
              <LinkCardSkeleton />
            </li>
          )}
        </ul>
      )}
    </ResponsiveDialog>
  )
}

/** A link's preview picture at the card's end; gone when it can't come. */
function LinkPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- a kept picture behind the API's redirect: no optimiser on this plan
  return <img src={src} alt="" aria-hidden="true" decoding="async" data-link-preview="" className="h-10 w-14 shrink-0 rounded-md bg-sunken object-cover sm:w-16" onError={() => setFailed(true)} />
}

/** A link's title, changed in its row: saved by the server, refused in its words. */
function RenameLink({ link, onSave, onDone }: { link: ProjectLink; onSave: (title: string) => Promise<void>; onDone: () => void }) {
  const [title, setTitle] = useState(link.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const next = title.trim()
    if (saving || !next) return
    if (next === link.title) return onDone()
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      onDone()
    } catch (e) {
      setError(apiErrorMessage(e, "The link couldn't be renamed. Try again."))
      setSaving(false)
    }
  }
  return (
    <form
      data-project-link-rename=""
      className="grid w-full gap-1.5 rounded-xl bg-raised p-2 shadow-e1"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          value={title}
          maxLength={LINK_TITLE_MOST}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Link title"
          className="min-w-0 flex-1"
          autoFocus
        />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" busy={saving} disabled={!title.trim()}>
          Save
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-meta text-danger-ink">
          {error}
        </p>
      )}
    </form>
  )
}
