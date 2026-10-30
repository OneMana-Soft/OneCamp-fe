"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { PageHeader } from "@/components/ui/pageHeader"
import { useRouter, useSearchParams } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Sparkles, Workflow, Table as TableIcon, Loader2, Download, Trash2, FileText, FolderKanban, LayoutDashboard } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { hueFor } from "@/lib/campHue"
import { MiniBoard } from "@/components/projectTemplates/TemplatePicker"
import { deleteTemplate as deleteProjectTemplate, useProjectTemplates } from "@/hooks/useProjectTemplates"
import { taskCount, type TemplateSummary } from "@/lib/projectTemplates"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { templateGlyph, templateHue } from "@/lib/docTemplates"
import { docTemplatePayload } from "@/services/docHomeService"

import { cn } from "@/lib/utils/helpers/cn"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonCards } from "@/components/ui/skeletonCards"
import {
  MarketplaceTemplate,
  TemplateKind,
  installTemplate,
  deleteTemplate,
  installedPath,
} from "@/services/marketplaceService"
import { useConfirm } from "@/hooks/useConfirm"

/**
 * The gallery's kinds: the shared templates' (services/marketplaceService),
 * and a project's, which are the New project dialog's own (built in, or
 * saved from a project) and start a project there. Project templates were
 * only in that dialog, so the gallery didn't list them (PTC-57).
 */
type GalleryKind = TemplateKind | "project"

const KIND_META: Record<GalleryKind, { label: string; icon: typeof Sparkles }> = {
  doc: { label: "Doc", icon: FileText },
  board: { label: "Board", icon: LayoutDashboard },
  project: { label: "Project", icon: FolderKanban },
  agent: { label: "Agent", icon: Sparkles },
  workflow: { label: "Automation", icon: Workflow },
  table: { label: "Table", icon: TableIcon },
}

const FILTERS: { value: "" | GalleryKind; label: string }[] = [
  { value: "", label: "All" },
  { value: "doc", label: "Docs" },
  { value: "board", label: "Boards" },
  { value: "project", label: "Projects" },
  { value: "agent", label: "Agents" },
  { value: "workflow", label: "Automations" },
  { value: "table", label: "Tables" },
]

const isKind = (v: string | null): v is GalleryKind => !!v && v in KIND_META

/** A card's kind: a tag, so rounded-sm, as every chip is (app/radiusScale.test.ts). */
const kindTag = "rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"

// A doc or a board starts here: used, not installed.
const startsHere = (kind: TemplateKind) => kind === "doc" || kind === "board"

// Loaded after the cards.
const BoardTemplateDrawing = dynamic(() => import("@/components/board/teamTemplateDrawing"), { ssr: false })

/** A doc template's tile: its own hue and glyph (lib/docTemplates). */
function DocTemplateTile({ t, size = "sm" }: { t: MarketplaceTemplate; size?: "sm" | "md" }) {
  const p = docTemplatePayload(t)
  const Glyph = templateGlyph(p.glyph)
  return (
    <Tile hue={templateHue(p.hue)} size={size}>
      <Glyph />
    </Tile>
  )
}

export default function TemplatesPage() {
  const { toast } = useToast()
  const router = useRouter()
  const confirm = useConfirm()
  // "All templates" from the docs home opens on the doc templates (?kind=doc).
  const searchParams = useSearchParams()
  const [kind, setKind] = React.useState<"" | GalleryKind>(() => {
    const k = searchParams.get("kind")
    return isKind(k) ? k : ""
  })
  const [selected, setSelected] = React.useState<MarketplaceTemplate | null>(null)
  const [selectedProject, setSelectedProject] = React.useState<TemplateSummary | null>(null)

  // Projects alone read only the project templates; All reads both.
  const shared = kind !== "project"
  const query = !shared ? "" : kind ? `${ProjectsGet.GetMarketplaceTemplates}?kind=${kind}` : ProjectsGet.GetMarketplaceTemplates
  // A newly chosen kind keeps the last grid on screen until its own arrives:
  // each switch drew six skeleton cards about 94px tall where the cards are
  // about 170px, and the grid jumped twice.
  const { data, isLoading, isError: sharedFailed, mutate } = useFetch<{ data: MarketplaceTemplate[] }>(query, undefined, { keepPreviousData: true })
  const projectTemplates = useProjectTemplates(kind === "" || kind === "project")
  // A body that isn't a list (an older server's, a proxy's) lists nothing rather than crashing the page.
  const templates = shared && Array.isArray(data?.data) ? data.data : []
  const projects = projectTemplates.templates
  const firstLoad = (shared && isLoading && !data) || (!shared && projectTemplates.isLoading)
  // Either read failing says so: a gallery missing half of itself would say
  // nothing about why.
  const isError = (shared && !!sharedFailed) || projectTemplates.isError
  const retry = () => {
    if (shared) void mutate()
    projectTemplates.retry()
  }

  const [busyId, setBusyId] = React.useState<string | null>(null)

  const handleInstall = async (t: MarketplaceTemplate) => {
    setBusyId(t.id)
    try {
      const res = await installTemplate(t.id)
      toast(startsHere(res.kind) ? { title: `Started “${res.name}”`, description: "Opening it now." } : { title: `Installed "${res.name}"`, description: "Opening it now." })
      setSelected(null)
      router.push(installedPath(res, t.id))
    } catch {
      // surfaced by interceptor
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (t: MarketplaceTemplate) => {
    confirm({
      title: `Remove the template "${t.name}"?`,
      description: "It is taken out of the templates gallery for everyone.",
      confirmText: "Remove template",
      destructive: true,
      onConfirm: async () => {
        setBusyId(t.id)
        try {
          await deleteTemplate(t.id)
          toast({ title: "Template removed" })
          setSelected(null)
          mutate()
        } catch {
          // surfaced
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <PageHeader eyebrow="Shared by your team" title="Templates" className="mb-6">
        <p className="text-sm text-muted-foreground">
          Docs, boards and projects to start from, and agents, automations and tables, ready to install as your own copy.
        </p>
      </PageHeader>

      {/* On a touch screen wrapped rows sit 14px apart (44 less their 30). */}
      <div className="mb-5 flex flex-wrap gap-1.5 pointer-coarse:gap-y-3.5">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            aria-pressed={kind === f.value}
            data-touch-target=""
            onClick={() => setKind(f.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              kind === f.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {firstLoad ? (
        // Mirrors the real grid and its cards' height, badge line included.
        <div role="status" aria-label="Loading templates">
          <SkeletonCards
            cards={6}
            gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            cardClassName="min-h-[10.5rem] rounded-xl border border-border/60 p-4"
            meta
          />
        </div>
      ) : isError ? (
        // Ahead of the empty check: a failed fetch also yields an empty list, and
        // "No templates yet" would be a claim about the workspace rather than
        // about the request.
        <ErrorState
          subject="templates"
          onRetry={retry}
          className="rounded-2xl border border-border/60 px-6 py-16"
        />
      ) : templates.length + projects.length === 0 ? (
        <EmptyState
          tone="accent"
          icon={Sparkles}
          // An empty kind names itself: "No templates yet" under Tables read as
          // though the whole gallery were empty.
          title={kind ? `No ${KIND_META[kind].label.toLowerCase()} templates yet` : "No templates yet"}
          description={
            kind === "project"
              ? "Save a project as a template from its menu, and everyone who creates projects can start from it."
              : kind === "board"
                ? "Save a board as a template from its More menu, and anyone in the workspace can start a board from it."
                : "Publish an agent, automation, or table you built so your team can install it in one click."
          }
          className="rounded-2xl border border-border/60 px-6 py-16"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const meta = KIND_META[t.kind]
            const Icon = meta?.icon || Sparkles
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                data-template-card={t.kind}
                className="flex flex-col gap-2 rounded-xl border border-border/60 p-4 text-left transition-colors hover:border-border"
              >
                <div className="flex items-center gap-2">
                  {t.kind === "doc" ? (
                    <DocTemplateTile t={t} />
                  ) : t.kind === "board" ? (
                    <span className="relative block h-9 w-12 shrink-0 overflow-hidden rounded-md bg-sunken shadow-e1" aria-hidden="true">
                      <BoardTemplateDrawing template={t} height={36} pad={4} className="rounded-md" />
                    </span>
                  ) : (
                    <span className="text-lg">{t.icon || <Icon className="h-5 w-5 text-muted-foreground" />}</span>
                  )}
                  <span className={kindTag}>
                    {t.kind === "doc" ? docTemplatePayload(t).category || meta.label : meta?.label || t.kind}
                  </span>
                </div>
                <p className="font-medium leading-tight">{t.name}</p>
                {t.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                )}
                {t.author_name && (
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">by {t.author_name}</p>
                )}
              </button>
            )
          })}
          {projects.map((t) => (
            <button
              key={`project-${t.id}`}
              onClick={() => setSelectedProject(t)}
              data-template-card="project"
              className="flex flex-col gap-2 rounded-xl border border-border/60 p-4 text-left transition-colors hover:border-border"
            >
              <div className="flex items-center gap-2">
                <Tile hue={hueFor(t.id)} size="sm">
                  <FolderKanban />
                </Tile>
                <span className={kindTag}>{KIND_META.project.label}</span>
              </div>
              <p className="font-medium leading-tight">{t.name}</p>
              {t.description && <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-auto pt-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{taskCount(t.task_count)}</span>
                {!t.built_in && t.created_by ? ` · by ${t.created_by}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      <ProjectTemplateDialog template={selectedProject} onClose={() => setSelectedProject(null)} />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.kind === "doc" ? (
                    <DocTemplateTile t={selected} />
                  ) : (
                    <span className="text-xl">{selected.icon || <Sparkles className="h-5 w-5 text-primary" />}</span>
                  )}
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {KIND_META[selected.kind]?.label} · by {selected.author_name || "a teammate"}
                </DialogDescription>
              </DialogHeader>

              {selected.description && (
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              )}
              {selected.kind === "board" && (
                <div className="group/tpl rounded-lg bg-sunken p-4" data-board-template-preview={selected.id}>
                  <BoardTemplateDrawing template={selected} height={220} className="rounded-md" count />
                </div>
              )}
              {selected.kind === "doc" && docTemplatePayload(selected).preview && (
                // How a doc from it starts: the server's preview, cleaned again here.
                <div className="max-h-64 overflow-hidden rounded-lg bg-sunken p-4" data-template-preview={selected.id}>
                  <SafeHtml
                    as="div"
                    html={docTemplatePayload(selected).preview}
                    sanitizer={sanitizeRichHtml}
                    className="pointer-events-none select-none rounded-md bg-sheet px-5 py-4 text-ui-sm leading-5 text-ink-2 shadow-e1 [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_strong]:text-ink [&_ul]:list-disc"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={() => handleInstall(selected)} busy={busyId === selected.id} className="gap-1.5">
                  {selected.kind === "doc" ? (
                    <FileText className="h-4 w-4" />
                  ) : selected.kind === "board" ? (
                    <LayoutDashboard className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {startsHere(selected.kind) ? "Use template" : "Install"}
                </Button>
                {/* OneCamp's own doc templates are every workspace's: nobody removes them. */}
                {!(selected.kind === "doc" && docTemplatePayload(selected).builtin) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-ink"
                    onClick={() => handleDelete(selected)}
                    disabled={busyId === selected.id}
                    title="Remove (author or admin only)"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * A project template, opened from the gallery: its shape (the New project
 * dialog's mini board), its first tasks, and Use template, which opens New
 * project with it chosen, since a project needs a team and a name first.
 */
function ProjectTemplateDialog({ template: t, onClose }: { template: TemplateSummary | null; onClose: () => void }) {
  const dispatch = useDispatch()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)

  const use = (id: string) => {
    onClose()
    dispatch(openUI({ key: "createProject", data: { templateId: id } }))
  }

  const remove = (t: TemplateSummary) =>
    confirm({
      title: `Delete the template "${t.name}"?`,
      description: "Nobody can start a project from it any more. Projects made from it stay as they are.",
      confirmText: "Delete template",
      destructive: true,
      onConfirm: async () => {
        setBusy(true)
        try {
          await deleteProjectTemplate(t.id)
          toast({ title: "Template deleted" })
          onClose()
        } catch (err) {
          toast({ variant: "destructive", title: "That template couldn't be deleted", description: apiErrorMessage(err, "Try again in a moment.") })
        } finally {
          setBusy(false)
        }
      },
    })

  const more = t ? t.task_count - t.preview.length : 0
  return (
    <Dialog open={!!t} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {t && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tile hue={hueFor(t.id)} size="sm">
                  <FolderKanban />
                </Tile>
                {t.name}
              </DialogTitle>
              <DialogDescription>
                {KIND_META.project.label} · {taskCount(t.task_count)}
                {t.built_in ? "" : ` · by ${t.created_by || "a teammate"}`}
              </DialogDescription>
            </DialogHeader>

            {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            <div className="rounded-lg bg-sunken p-4" data-template-preview={t.id}>
              <MiniBoard id={t.id} tasks={t.task_count} />
              {t.preview.length > 0 && (
                <ul className="mt-3 space-y-1 text-ui-sm text-ink-2" aria-label="Its first tasks">
                  {t.preview.map((name, i) => (
                    <li key={i} className="truncate">
                      {name}
                    </li>
                  ))}
                  {more > 0 && <li className="tabular-nums text-ink-3">and {more} more</li>}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => use(t.id)} busy={busy} className="gap-1.5">
                <FolderKanban className="h-4 w-4" />
                Use template
              </Button>
              {t.can_delete && (
                <Button variant="ghost" size="sm" className="text-danger-ink" onClick={() => remove(t)} disabled={busy}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Delete
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
