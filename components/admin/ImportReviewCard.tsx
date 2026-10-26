"use client"

// Admin > Import and export: the people earlier Todoist and Notion imports
// added to projects, for an admin to look over. Each project opens its people:
// take someone off, keep everyone left, or take everyone left off. Nobody is
// taken off without an admin choosing to, and only workspace admins in the
// app can do any of it (the routes refuse a member and any token). The
// section is drawn only while a review exists. The admin page places it before
// the tab draws (lib/importReviews): first while anyone is left to review, at
// the tab's end once everyone is decided.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SettingsCard, SettingsCardError, SettingsSection } from "@/components/ui/settingsSection"
import { Skeleton } from "@/components/ui/skeleton"
import { DotWord } from "@/components/admin/PeopleFrame"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import {
  IMPORT_REVIEWS_KEY,
  keepEveryoneLeft,
  listImportReviewPeople,
  takeOffEveryoneLeft,
  takeOffImportReview,
  useImportReviews,
  type ImportReviewPerson,
  type ImportReviewProject,
} from "@/lib/importReviews"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { importProviderLabel } from "@/services/importService"

/** "1 person", "3 people". Pure. */
export function peopleWords(n: number): string {
  return n === 1 ? "1 person" : `${n.toLocaleString("en")} people`
}

/** The tools named in words: "Todoist", "Todoist and Notion". Pure. */
export function providerWords(providers: string[]): string {
  const names = [...new Set(providers)].map(importProviderLabel)
  if (names.length <= 1) return names[0] ?? "another tool"
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** A project's line under its name: what is left to review, or what was decided. Pure. */
export function projectLine(p: ImportReviewProject): string {
  if (p.undecided > 0) return `From ${providerWords(p.providers)} · ${p.undecided.toLocaleString("en")} to review`
  const decided = [p.kept > 0 && `${p.kept.toLocaleString("en")} kept`, p.removed > 0 && `${p.removed.toLocaleString("en")} taken off`].filter(Boolean)
  return `Reviewed · ${decided.join(", ")}`
}

const projectName = (p: ImportReviewProject) => p.project_name || "Untitled project"
const personName = (p: ImportReviewPerson) => p.user_name || "Someone"

function ProjectRow({ project, onOpen }: { project: ImportReviewProject; onOpen(): void }) {
  const name = projectName(project)
  const left = project.undecided > 0
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-review-project={project.project_uuid}>
      <ProjectTile id={project.project_uuid} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{name}</p>
        <p className="text-meta text-ink-3">{projectLine(project)}</p>
      </div>
      {/* On a phone the button takes its own line under the name, so the name
          isn't squeezed; a ghost one moves left by its padding, so its words
          start where the name's do. */}
      <div className="flex items-center max-sm:basis-full max-sm:pl-10">
        <Button
          variant={left ? "secondary" : "ghost"}
          size="sm"
          className={cn(!left && "max-sm:-ml-2.5")}
          onClick={onOpen}
          aria-label={`${left ? "Review" : "See"} ${name}'s people`}
        >
          {left ? "Review…" : "See who…"}
        </Button>
      </div>
    </li>
  )
}

function PersonRow({ person, busy, onTakeOff, project }: { person: ImportReviewPerson; busy: boolean; onTakeOff(): void; project: string }) {
  const name = personName(person)
  return (
    <li className="flex items-center gap-3 py-2.5" data-review-person={person.id}>
      <IdentityMark variant="avatar" size={28} id={avatarSeed(name)} label={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{name}</p>
        <p className="text-meta text-ink-3">From {importProviderLabel(person.provider)}</p>
      </div>
      {person.outcome ? (
        <DotWord tone={person.outcome === "removed" ? "danger" : "ok"}>{person.outcome === "removed" ? "Taken off" : "Kept"}</DotWord>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger-ink hover:text-danger-ink"
          onClick={onTakeOff}
          disabled={busy}
          aria-label={`Take ${name} off ${project}`}
        >
          Take off
        </Button>
      )}
    </li>
  )
}

/** The people rows' own shape while the first page loads. */
function PeopleSkeleton() {
  return (
    <ul role="status" aria-label="Loading who was added" className="divide-y divide-line">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} aria-hidden="true" className="flex items-center gap-3 py-2.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={i % 2 === 0 ? "h-3.5 w-36" : "h-3.5 w-28"} />
            <Skeleton className="h-3 w-24" />
          </span>
        </li>
      ))}
    </ul>
  )
}

function ReviewDialog({ project, onClose }: { project: ImportReviewProject; onClose(): void }) {
  const name = projectName(project)
  const left = project.undecided
  const [people, setPeople] = React.useState<ImportReviewPerson[]>([])
  const [more, setMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [moreFailed, setMoreFailed] = React.useState(false)
  // One action at a time: a person's id while they're taken off, "keep", or "all".
  const [busy, setBusy] = React.useState<string | null>(null)
  // How many are left while everyone left is taken off, a batch a call.
  const [goingLeft, setGoingLeft] = React.useState<number | null>(null)
  const [problem, setProblem] = React.useState("")
  // Closed, a run of batches stops after the call in flight. Set again on
  // each mount: a development double mount ran the cleanup once.
  const shown = React.useRef(true)
  React.useEffect(() => {
    shown.current = true
    return () => {
      shown.current = false
    }
  }, [])
  const { toast } = useToast()
  const confirm = useConfirm()

  const load = React.useCallback(
    async (after?: string) => {
      setLoading(true)
      if (after) setMoreFailed(false)
      else setFailed(false)
      try {
        const page = await listImportReviewPeople(project.project_uuid, after)
        setPeople((prev) => (after ? [...prev, ...page.people] : page.people))
        setMore(page.more)
      } catch {
        if (after) setMoreFailed(true)
        else {
          setPeople([])
          setFailed(true)
        }
      } finally {
        setLoading(false)
      }
    },
    [project.project_uuid],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  const takeOff = async (person: ImportReviewPerson) => {
    if (busy) return
    setBusy(person.id)
    setProblem("")
    try {
      await takeOffImportReview(person.id)
      setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, outcome: "removed" } : p)))
      toast({ title: `${personName(person)} was taken off ${name}` })
    } catch (e) {
      setProblem(apiErrorMessage(e, "Couldn't take them off the project. Try again."))
      // Another admin decided them meanwhile: show the list as it is now.
      if (apiErrorStatus(e) === 409) void load()
    } finally {
      setBusy(null)
      await appMutate(IMPORT_REVIEWS_KEY)
    }
  }

  const keepRest = async () => {
    if (busy) return
    setBusy("keep")
    setProblem("")
    try {
      const n = await keepEveryoneLeft(project.project_uuid)
      toast({ title: `Kept ${peopleWords(n)} in ${name}` })
      await load()
    } catch (e) {
      setProblem(apiErrorMessage(e, "Couldn't keep them. Try again."))
    } finally {
      setBusy(null)
      await appMutate(IMPORT_REVIEWS_KEY)
    }
  }

  // The server takes a batch a call, so a call ends inside a proxy's limit.
  // After the first: call again while any are left and some went, saying how
  // many are left.
  const takeOffTheRest = async (first: { removed: number; left: number }) => {
    let went = first.removed
    let stillLeft = first.left
    let moved = first.removed > 0
    setGoingLeft(stillLeft)
    try {
      while (stillLeft > 0 && moved && shown.current) {
        const step = await takeOffEveryoneLeft(project.project_uuid)
        went += step.removed
        stillLeft = step.left
        moved = step.removed > 0
        setGoingLeft(step.left)
      }
      if (went > 0) toast({ title: `Took ${peopleWords(went)} off ${name}` })
      if (stillLeft > 0 && shown.current) setProblem(`${peopleWords(stillLeft)} couldn't be taken off: a project's creator always stays in it.`)
    } catch (e) {
      setProblem(apiErrorMessage(e, "Couldn't take everyone off the project. Try again."))
    } finally {
      setBusy(null)
      setGoingLeft(null)
      await load()
      await appMutate(IMPORT_REVIEWS_KEY)
    }
  }

  const askTakeOffRest = () =>
    confirm({
      title: `Take everyone left off ${name}?`,
      description: `${left === 1 ? "The 1 person" : `The ${left.toLocaleString("en")} people`} not yet decided lose access to ${name} and everything in it. You can add anyone back from the project's people.`,
      confirmText: "Take them off",
      destructive: true,
      // The question stays open, its action busy, until the first batch is
      // answered, and says why if it's refused. One that closed at once let
      // the tap that answered it go on to a phone's sheet under it as a tap
      // outside, which closed the sheet.
      onConfirm: async () => {
        setProblem("")
        const first = await takeOffEveryoneLeft(project.project_uuid)
        setBusy("all")
        void takeOffTheRest(first)
      },
    })

  let body: React.ReactNode
  if (loading && people.length === 0) body = <PeopleSkeleton />
  else if (failed) body = <ErrorState compact subject="who was added" onRetry={() => void load()} retrying={loading} />
  else if (people.length === 0) body = <p className="py-6 text-center text-ui text-ink-2">No one is left to review here.</p>
  else
    body = (
      <>
        {/* The list's top edge: this line's overlays draw none where the body
            meets the header, so a hairline held at the body's top, which the
            rows pass under rather than running up to the description. */}
        <div aria-hidden="true" className="sticky top-0 z-10 mt-2 h-px bg-line" data-review-edge="" />
        <ul aria-label={`People added to ${name}`} className="divide-y divide-line">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} project={name} busy={busy !== null} onTakeOff={() => void takeOff(p)} />
          ))}
        </ul>
        {more ? (
          // pb-5: scrolled to its end, Show more clears a sheet footer's 12px fade.
          <div className="flex flex-col items-center gap-1 pt-2 pb-5" data-review-more="">
            {moreFailed ? (
              <p role="alert" className="text-xs text-danger-ink">
                Couldn&apos;t load more. Try again.
              </p>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load(people[people.length - 1].id)} disabled={loading}>
              {loading ? "Loading…" : "Show more"}
            </Button>
          </div>
        ) : null}
      </>
    )

  return (
    <ResponsiveDialog
      title={name}
      description={
        left > 0
          ? `An earlier import from ${providerWords(project.providers)} added these people. Take off anyone who shouldn't be here, then keep everyone left.`
          : "Everyone an earlier import added here has been kept or taken off."
      }
      onClose={onClose}
      footer={
        left > 0 || busy === "all" ? (
          <>
            <Button variant="ghost" className="text-danger-ink hover:text-danger-ink" onClick={askTakeOffRest} aria-busy={busy === "all" || undefined} disabled={busy !== null}>
              Take everyone left off
            </Button>
            <Button onClick={() => void keepRest()} aria-busy={busy === "keep" || undefined} disabled={busy !== null}>
              Keep everyone left
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Done</Button>
        )
      }
    >
      {goingLeft !== null ? (
        <p role="status" className="pb-2 text-meta text-ink-2">
          Taking people off… {peopleWords(goingLeft)} left
        </p>
      ) : null}
      {body}
      {problem ? (
        <p role="alert" className="mt-2 text-xs text-danger-ink text-pretty">
          {problem}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}

export default function ImportReviewCard() {
  const reviews = useImportReviews()
  const [openUuid, setOpenUuid] = React.useState<string | null>(null)
  const projects = reviews.data?.projects ?? []
  if (!reviews.data && !reviews.isError) return null
  if (reviews.data && projects.length === 0) return null
  const pending = reviews.data?.pending ?? 0
  const open = projects.find((p) => p.project_uuid === openUuid)
  return (
    <SettingsSection
      id="import-reviews"
      title="People earlier imports added"
      description={
        !reviews.data
          ? "Choose who stays in the projects earlier imports added people to."
          : pending > 0
            ? `Earlier imports from ${providerWords(projects.flatMap((p) => p.providers))} added people to these projects. Choose who stays in each: ${peopleWords(pending)} left to review.`
            : "All reviewed. Each project shows who was kept and who was taken off."
      }
    >
      <SettingsCard>
        {reviews.isError && !reviews.data ? (
          <SettingsCardError what="who earlier imports added" onRetry={() => void reviews.mutate()} />
        ) : (
          <ul aria-label="Projects with people to review" className="divide-y divide-line">
            {projects.map((p) => (
              <ProjectRow key={p.project_uuid} project={p} onOpen={() => setOpenUuid(p.project_uuid)} />
            ))}
          </ul>
        )}
      </SettingsCard>
      {open ? <ReviewDialog project={open} onClose={() => setOpenUuid(null)} /> : null}
    </SettingsSection>
  )
}
