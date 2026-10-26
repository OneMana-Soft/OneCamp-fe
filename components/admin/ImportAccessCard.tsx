"use client"

// Admin > Import and export: what earlier imports let everyone in their
// projects see, re-checked against each import's own tool with the
// connection it was made with. Each import opens its projects, what the
// re-check changed and the tasks it couldn't settle, by id: each opens through
// the task's own page, so the admin sees only what they may. An import that
// couldn't be re-checked waits for an admin, who re-checks it with their own
// connection, keeps it as it is, or keeps its tasks to their projects' admins
// until then (offered, never the default). A re-check, or that containment,
// can be undone. Only workspace admins in the app can do any of it (the
// routes refuse a member and any token). The section is drawn only while an
// import has been re-checked, at the tab's end, so its late answer moves
// nothing above it.

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SettingsCard, SettingsCardError, SettingsSection } from "@/components/ui/settingsSection"
import { DotWord } from "@/components/admin/PeopleFrame"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import {
  IMPORT_ACCESS_KEY,
  chooseForImportAccess,
  useImportAccess,
  type ImportAccess,
  type ImportAccessChoice,
  type ImportAccessProject,
  type ImportAccessState,
} from "@/lib/importAccess"
import { format } from "date-fns"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { importProviderLabel } from "@/services/importService"

const n = (count: number) => count.toLocaleString("en")
const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${n(count)} ${many}`)
/** "left as it was" for one task, "left as they were" for more. */
const leftAsWas = (count: number) => (count === 1 ? "left as it was" : "left as they were")
/** A day as the app words it short: "9 Oct", with its year when not this year's. */
const shortDate = (d: Date, now: Date = new Date()) => format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy")
/**
 * This line's Button has no busy prop: the choice that runs wears aria-busy
 * (it dims and a press can't reach it), the others wait, disabled, and a key
 * pressed on the busy choice is let go where it lands (AccessDialog).
 */
const busyWith = (running: ImportAccessChoice | null, own: ImportAccessChoice) => ({
  "aria-busy": running === own || undefined,
  disabled: running != null && running !== own,
})

/** An import's name: its tool and site. Pure. */
export function importTitle(imp: ImportAccess): string {
  const tool = importProviderLabel(imp.provider)
  return imp.site ? `${tool} · ${imp.site}` : tool
}

/** Where an import stands, as its row's word and dot. Pure. */
export function stateWord(state: ImportAccessState): { word: string; tone: "ok" | "neutral" | "sun" | "danger" } {
  switch (state) {
    case "needs_admin":
      return { word: "Needs you", tone: "sun" }
    case "rechecking":
      return { word: "Re-checking", tone: "neutral" }
    case "contained":
      return { word: "Kept to admins", tone: "sun" }
    case "kept":
      return { word: "Kept as it is", tone: "neutral" }
    case "undone":
      return { word: "Undone", tone: "neutral" }
    default:
      return { word: "Re-checked", tone: "ok" }
  }
}

/** Why an import waits for an admin, in words. Pure. */
export function reasonWords(reason: string | undefined, provider: string): string {
  const tool = importProviderLabel(provider)
  switch (reason) {
    case "no_connection":
      return `Whoever ran it has no ${tool} connection here, so it couldn't be re-checked.`
    case "connection_expired":
      return `The ${tool} connection it was made with has expired.`
    case "owner_gone":
      return "Whoever ran it has left, so it couldn't be re-checked."
    case "other_source":
      return `The ${tool} connection it was made with now reaches a different site.`
    case "source_failing":
      return `${tool} kept failing to answer.`
    case "tasks_failing":
      return "Some of its tasks kept failing to re-check. They're listed under their projects."
    default:
      return "It couldn't be re-checked."
  }
}

/** What the re-check did in a project, a line for each count that isn't zero. Pure. */
export function countLines(p: ImportAccessProject, provider: string): string[] {
  const tool = importProviderLabel(provider)
  return [
    p.restricted > 0 && `${plural(p.restricted, "task", "tasks")} kept to the people ${tool} lets in`,
    p.unassigned > 0 && `${plural(p.unassigned, "assignee", "assignees")} taken off a task they can't see`,
    p.comments_hidden > 0 && `${plural(p.comments_hidden, "comment", "comments")} hidden`,
    p.opened > 0 && `${plural(p.opened, "task", "tasks")} ${tool} shows to everyone, opened again`,
    p.already_restricted > 0 && `${plural(p.already_restricted, "task", "tasks")} someone here had restricted already, ${leftAsWas(p.already_restricted)}`,
    p.opened_since > 0 && `${plural(p.opened_since, "task", "tasks")} someone opened since, left open`,
  ].filter((line): line is string => Boolean(line))
}

/**
 * The tasks a project's re-check names for the admin, by why, each list
 * labelled with how many tasks it stands for: the server names at most the
 * first 50 of a list, so a label says when only those are listed (a failed
 * task has no count beyond its list). Pure.
 */
export function taskLists(p: ImportAccessProject, provider: string): { label: string; ids: string[] }[] {
  const tool = importProviderLabel(provider)
  const failed = p.failed ?? []
  return [
    // Gone at the tool, or hidden there from whoever ran it: either way it no longer shows them.
    { what: `${tool} no longer shows whoever ran it, ${leftAsWas(p.gone_or_hidden)}`, count: p.gone_or_hidden, ids: p.gone_or_hidden_tasks ?? [] },
    { what: `made by someone ${tool} doesn't let in`, count: p.creator_outside, ids: p.creator_outside_tasks ?? [] },
    { what: `assigned to someone ${tool} doesn't let in`, count: p.assignee_outside, ids: p.assignee_outside_tasks ?? [] },
    { what: "kept failing to re-check", count: failed.length, ids: failed },
  ]
    .filter((l) => l.ids.length > 0)
    .map(({ what, count, ids }) => ({
      label: `${plural(count, "task", "tasks")} ${what}${ids.length < count ? ` · the first ${n(ids.length)} listed` : ""}`,
      ids,
    }))
}

/** Who ran an import and when, as its row and its sheet say it: "Imported by Ada on 3 May". Pure. */
export function importedLine(imp: ImportAccess): string {
  return `${imp.ran_by ? `Imported by ${imp.ran_by}` : "Imported"} on ${shortDate(new Date(imp.ran_at))}`
}

function ImportRow({ imp, onOpen }: { imp: ImportAccess; onOpen(): void }) {
  const title = importTitle(imp)
  const { word, tone } = stateWord(imp.state)
  const waits = imp.state === "needs_admin"
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-access-import={imp.import_id}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{title}</p>
        <p className="text-meta text-ink-3">
          {importedLine(imp)} · {plural(imp.projects.length, "project", "projects")}
        </p>
      </div>
      {/* One column for the states and one width for the buttons, so each row's
          dot sits under the one above whatever its word or button says. */}
      <div className="flex items-center gap-3 max-sm:basis-full max-sm:justify-between">
        <div className="sm:w-32">
          <DotWord tone={tone}>{word}</DotWord>
        </div>
        {/* Its date in its name: two imports of one site read alike otherwise. */}
        <Button
          variant={waits ? "secondary" : "ghost"}
          size="sm"
          className="min-w-[4.75rem]"
          onClick={onOpen}
          aria-label={`${waits ? "Review" : "See"} ${title}, imported ${shortDate(new Date(imp.ran_at))}`}
        >
          {waits ? "Review…" : "See…"}
        </Button>
      </div>
    </li>
  )
}

/**
 * A project's line for where it stands, above what its re-check did; none for
 * a re-checked project whose changes say it all. A project waiting for an
 * admin, or kept as it is, may carry what a re-check did before it stopped:
 * that part was re-checked. Pure.
 */
export function projectLine(p: ImportAccessProject, provider: string): string | null {
  const changed = countLines(p, provider).length > 0
  const partly = changed || taskLists(p, provider).length > 0
  switch (p.state) {
    case "rechecking":
      return "Being re-checked…"
    case "needs_admin":
      return partly ? "Re-checked in part." : "Not re-checked yet."
    case "kept":
      return partly ? "Re-checked in part, then kept as it is." : "Not re-checked, kept as it is."
    case "contained":
      return "Its tasks are kept to the project's admins."
    case "undone":
      return "Put back as it was, where nobody had changed it since."
    default:
      return changed ? null : "Nothing here needed changing."
  }
}

function ProjectBlock({ project, provider }: { project: ImportAccessProject; provider: string }) {
  // An undone project's counts say what its re-check did, which was put back.
  const lines = project.state === "undone" ? [] : countLines(project, provider)
  const lists = taskLists(project, provider)
  const line = projectLine(project, provider)
  const listId = React.useId()
  return (
    <li className="py-3" data-access-project={project.project_uuid}>
      <p className="flex items-center gap-2 text-ui font-medium text-ink">
        <span className="truncate">{project.name || "Untitled project"}</span>
        {project.archived ? <span className="shrink-0 rounded-sm bg-hover px-1.5 text-meta text-ink-3">Archived</span> : null}
      </p>
      {line ? <p className="mt-1 text-meta text-ink-3">{line}</p> : null}
      {lines.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-meta text-ink-2">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {lists.map((l, k) => (
        <div key={l.label} className="mt-2">
          <p id={`${listId}-${k}`} className="text-meta text-ink-3">
            {l.label}
          </p>
          <ul aria-labelledby={`${listId}-${k}`} className="-ml-2 flex flex-wrap">
            {l.ids.map((id, i) => (
              <li key={id}>
                <Link href={`/app/task/${id}`} className="inline-flex h-11 items-center rounded-md px-2 text-xs font-medium text-brand-text md:h-7">
                  Task {i + 1}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </li>
  )
}

/** The import's state, in a sentence under its name. Pure. */
export function importLine(imp: ImportAccess): string {
  const tool = importProviderLabel(imp.provider)
  const by = imp.decided_by ? ` by ${imp.decided_by}` : ""
  switch (imp.state) {
    case "needs_admin":
      return reasonWords(imp.reason, imp.provider)
    case "rechecking":
      return `Being re-checked against ${tool}…`
    case "contained":
      return `Its tasks are kept to their projects' admins${by} until it is re-checked.`
    case "kept":
      return `Kept as it is${by}.`
    case "undone":
      return `Its re-check was undone${by}.`
    default:
      // Only an admin's re-check records who decided: it used their connection.
      return imp.decided_by
        ? `Re-checked against ${tool} with ${imp.decided_by}'s connection.`
        : `Re-checked against ${tool} with the connection it was made with.`
  }
}

const QUESTIONS: Record<Exclude<ImportAccessChoice, "recheck">, { title: string; description: string; confirmText: string; destructive: boolean }> = {
  keep: {
    title: "Keep it as it is?",
    description: "Everyone in its projects keeps seeing what it brought. Nothing it brought is narrowed.",
    confirmText: "Keep as it is",
    destructive: false,
  },
  contain: {
    title: "Keep its tasks to their projects' admins?",
    description: "Until it is re-checked, only each project's admins, and each task's creator and assignee, see its tasks. Their people may lose most of a project. You can undo this.",
    confirmText: "Keep to admins",
    destructive: true,
  },
  undo: {
    title: "Undo its changes?",
    description: "What it changed in the last 30 days is put back as it was, where nobody has changed it since.",
    confirmText: "Undo changes",
    destructive: true,
  },
}

function AccessDialog({ imp, onClose }: { imp: ImportAccess; onClose(): void }) {
  const title = importTitle(imp)
  const [busy, setBusy] = React.useState<ImportAccessChoice | null>(null)
  const [problem, setProblem] = React.useState("")
  const { toast } = useToast()
  const confirm = useConfirm()

  const choose = async (choice: ImportAccessChoice) => {
    if (busy) return
    setBusy(choice)
    setProblem("")
    try {
      toast({ title: await chooseForImportAccess(imp.import_id, choice) })
      onClose()
    } catch (e) {
      setProblem(apiErrorMessage(e, "Couldn't do that. Try again."))
    } finally {
      setBusy(null)
      await appMutate(IMPORT_ACCESS_KEY)
    }
  }
  const ask = (choice: Exclude<ImportAccessChoice, "recheck">) => {
    if (busy) return
    confirm({ ...QUESTIONS[choice], onConfirm: () => choose(choice) })
  }

  const undoable = imp.state === "rechecked" || imp.state === "contained"
  const recheckable = imp.state === "needs_admin" || imp.state === "contained"
  // The dialog's wide width holds a waiting import's three choices in one row
  // (at 400px they ran off its start), its ghost choice apart at the row's
  // start; on a phone they stack in the sheet's foot.
  return (
    <ResponsiveDialog
      title={title}
      description={`${importedLine(imp)}. ${importLine(imp)}`}
      onClose={onClose}
      wide
      footer={
        recheckable || undoable ? (
          <>
            {imp.state === "needs_admin" ? (
              <Button variant="ghost" className="sm:mr-auto" onClick={() => ask("contain")} {...busyWith(busy, "contain")}>
                Keep to admins
              </Button>
            ) : null}
            {undoable ? (
              <Button variant="ghost" className="text-danger-ink hover:text-danger-ink sm:mr-auto" onClick={() => ask("undo")} {...busyWith(busy, "undo")}>
                Undo changes
              </Button>
            ) : null}
            {imp.state === "needs_admin" ? (
              <Button variant="secondary" onClick={() => ask("keep")} {...busyWith(busy, "keep")}>
                Keep as it is
              </Button>
            ) : null}
            {recheckable ? (
              <Button onClick={() => void choose("recheck")} {...busyWith(busy, "recheck")}>
                Re-check with my connection
              </Button>
            ) : (
              <Button onClick={onClose}>Done</Button>
            )}
          </>
        ) : (
          <Button onClick={onClose}>Done</Button>
        )
      }
    >
      <ul aria-label={`Projects ${title} made`} className="divide-y divide-line">
        {imp.projects.map((p) => (
          <ProjectBlock key={p.project_uuid} project={p} provider={imp.provider} />
        ))}
      </ul>
      {problem ? (
        <p role="alert" className="mt-2 text-xs text-danger-ink text-pretty">
          {problem}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}

// An import whose connection no longer works waits for an admin instead (its
// row says so), as the admins' notice words it.
const OWN_CONNECTION = "with the connection it was made with, where that still works"

// The section's id: the admins' notice links to /app/admin?tab=import#import-access.
// The section draws once its own read answers, maybe after the page first
// looked for it; the page's jump watches for it until then (hooks/useJumpFlash).
const SECTION_ID = "import-access"

export default function ImportAccessCard() {
  const access = useImportAccess()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const imports = access.data?.imports ?? []
  if (!access.data && !access.isError) return null
  if (access.data && imports.length === 0) return null
  const needYou = imports.filter((i) => i.state === "needs_admin").length
  const open = imports.find((i) => i.import_id === openId)
  return (
    <SettingsSection
      id={SECTION_ID}
      title="Earlier imports re-checked"
      description={
        !access.data
          ? "What earlier imports let everyone in their projects see, re-checked against each import's tool."
          : needYou > 0
            ? `Each was re-checked against its tool ${OWN_CONNECTION}. ${needYou === 1 ? "1 needs" : `${n(needYou)} need`} you: choose what happens to ${needYou === 1 ? "it" : "each"}.`
            : imports.some((i) => i.state === "rechecking")
              ? `Re-checking each against its tool ${OWN_CONNECTION}…`
              : `Each was re-checked against its tool ${OWN_CONNECTION}.`
      }
    >
      <SettingsCard>
        {access.isError && !access.data ? (
          <SettingsCardError what="the earlier imports' re-check" onRetry={() => void access.mutate()} />
        ) : (
          <ul aria-label="Earlier imports re-checked" className="divide-y divide-line">
            {imports.map((i) => (
              <ImportRow key={i.import_id} imp={i} onOpen={() => setOpenId(i.import_id)} />
            ))}
          </ul>
        )}
      </SettingsCard>
      {open ? <AccessDialog imp={open} onClose={() => setOpenId(null)} /> : null}
    </SettingsSection>
  )
}
