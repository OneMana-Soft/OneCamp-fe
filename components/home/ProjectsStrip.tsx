"use client"

/**
 * Projects on Home (hub.md H14, H15): your two most pressing projects as cards
 * with a progress ring, then a card to start one from a template. With no
 * project at all, three template cards.
 *
 * A project card is the project's 32px tile (the one project tile), its name and "6 open
 * · 5 due this week" (overdue in danger ink), and a 28px ring in the project's
 * hue that draws itself on the first visit; hovering shows its percentage.
 * Done is a moss disc with a check. Loaded on its own (lazy).
 */
import Link from "next/link"
import { useDispatch } from "react-redux"
import { useEffect, useState } from "react"

import { HubSectionHeader } from "@/components/ui/hubRow"
import { Check, Plus } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { useProjectHue } from "@/lib/projectHue"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { cn } from "@/lib/utils/helpers/cn"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { progressOf, type ProjectOverview } from "@/lib/projectsOverview"
import { openUI } from "@/store/slice/uiSlice"
import { app_project_path } from "@/types/paths"
import { useMedia } from "@/context/MediaQueryContext"

/** At most two of your active projects, most due this week first, then the overdue. Pure. */
export function pickProjects(projects: ProjectOverview[]): ProjectOverview[] {
  return projects
    .filter((p) => p.open > 0)
    .sort((a, b) => b.due_soon - a.due_soon || b.overdue - a.overdue || b.open - a.open)
    .slice(0, 2)
}

/** The ring: a 3px press track and the arc in the project's hue, from 12 o'clock. Done is a moss disc with a check. */
export function ProjectRing({ value, hue, size = 28, draw = false }: { value: number; hue: CampHue; size?: number; draw?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  // Drawn from nothing to its value on the first visit (the rise rule), and
  // to a new value over 400ms after that.
  const [drawn, setDrawn] = useState(!draw)
  useEffect(() => {
    if (drawn) return
    const id = window.requestAnimationFrame(() => setDrawn(true))
    return () => window.cancelAnimationFrame(id)
  }, [drawn])
  if (pct >= 100) {
    return (
      <span role="img" aria-label="Done" data-project-ring="done" className="grid shrink-0 place-items-center rounded-full bg-camp-moss text-white" style={{ width: size, height: size }}>
        <Check className="size-3.5" />
      </span>
    )
  }
  const r = (size - 3) / 2
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} data-project-ring={hue} role="img" aria-label={`${pct}% done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--press)" strokeWidth={3} />
        {pct > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`var(--camp-${hue})`}
            strokeWidth={3}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ strokeDashoffset: drawn ? 1 - pct / 100 : 1, transition: `stroke-dashoffset ${draw ? 600 : 400}ms var(--ease-out)` }}
          />
        ) : null}
      </svg>
      <b className="absolute inset-0 grid place-items-center text-micro font-semibold text-ink-2 opacity-0 transition-opacity group-hover/card:opacity-100 [@media(hover:none)]:opacity-0">{pct}%</b>
    </span>
  )
}

/** The strip's columns by its own width: one, then two (the odd card out across both), then three. */
export const STRIP_COLUMNS = "@min-[560px]:grid-cols-2 @min-[860px]:grid-cols-3 @min-[560px]:@max-[860px]:[&>:last-child:nth-child(odd)]:col-span-2"

const CARD = "group/card flex items-center gap-3 rounded-lg bg-sheet px-3.5 py-3 shadow-e1 transition-[box-shadow,translate] duration-[140ms] hover:-translate-y-px hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:bg-[#18191C]"

function ProjectCard({ p, draw }: { p: ProjectOverview; draw: boolean }) {
  const hue = useProjectHue(p.project_uuid)
  return (
    <Link href={`${app_project_path}/${p.project_uuid}`} className={CARD} data-project-card="">
      <ProjectTile id={p.project_uuid} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-medium">{p.project_name}</span>
        <span className="block truncate text-meta text-ink-3">
          {p.open} open
          {p.overdue > 0 ? (
            <>
              {" · "}
              <span className="text-danger-ink">{p.overdue} overdue</span>
            </>
          ) : p.due_soon > 0 ? (
            ` · ${p.due_soon} due this week`
          ) : null}
        </span>
      </span>
      <ProjectRing value={progressOf(p)} hue={hue} draw={draw} />
    </Link>
  )
}

function TemplateCard({ title, sub, templateId }: { title: string; sub: string; templateId?: string }) {
  const dispatch = useDispatch()
  return (
    <button
      type="button"
      data-template-card=""
      onClick={() => dispatch(openUI({ key: "createProject", data: templateId ? { templateId } : null }))}
      className="flex items-center gap-3 rounded-lg px-3.5 py-3 text-left outline-1 -outline-offset-1 outline-dashed outline-line-3 transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-brand"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-hover text-ink-2">
        <Plus className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-ui font-medium">{title}</span>
        <span className="block truncate text-meta text-ink-3">{sub}</span>
      </span>
    </button>
  )
}

export function ProjectsStrip({ draw = false, className }: { draw?: boolean; className?: string }) {
  const { projects, isLoading, isError } = useProjectsOverview()
  const { isMobile } = useMedia()
  if (isError) return null
  const picked = pickProjects(projects ?? [])
  const none = !isLoading && (projects ?? []).length === 0
  return (
    <section aria-labelledby="projects-title" className={cn("@container", className)} data-projects-strip="">
      <HubSectionHeader id="projects-title" title="Projects" action={<Link href={app_project_path}>All projects</Link>} />
      {/* Three across only where three fit: each card's words need about
          150px beside its tile and ring ("Customer onboarding", "6 open · 5
          due this week"), so three want 860px of strip. At 1024 beside the
          sidebar the strip is narrower, and three cut them to "Customer
          onbo…" and "5 due this…"; two across there, the last card across
          both columns when it is alone on its row. */}
      <div className={cn("grid grid-cols-1 gap-2.5", !isMobile && STRIP_COLUMNS)}>
        {isLoading && !projects ? (
          [0, 1, 2].map((i) => <div key={i} className="h-14 animate-shimmer rounded-lg bg-press" aria-hidden />)
        ) : none ? (
          <>
            <TemplateCard title="Launch" sub="Plan, build, ship" templateId="launch" />
            <TemplateCard title="Client project" sub="Brief to sign-off" templateId="client-project" />
            <TemplateCard title="Onboarding" sub="A new person's first weeks" templateId="onboarding" />
          </>
        ) : (
          <>
            {picked.map((p) => (
              <ProjectCard key={p.project_uuid} p={p} draw={draw} />
            ))}
            <TemplateCard title="Start from a template" sub="Launch, client project, onboarding" />
          </>
        )}
      </div>
    </section>
  )
}

export default ProjectsStrip
