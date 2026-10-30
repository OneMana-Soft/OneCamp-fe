"use client"

import * as React from "react"
import { fieldKeyDown } from "@/lib/keys/ime"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ErrorState } from "@/components/ui/error-state"
import { ChevronDown, LayoutGrid, List, Search, Upload, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { isTyping } from "@/lib/goKeys"
import { useEntityLinks } from "@/services/entityLinkService"
import { EntityLinkPicker } from "@/components/entityLink/EntityLinkPicker"
import { LinkedItemsList } from "@/components/entityLink/LinkedItemsSection"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { FileCard, FileRow, UploadingFileCard } from "@/components/project/fileCard"
import { MenuCheck } from "@/components/ui/menuCheck"
import {
    ProjectFilesEmpty,
    ProjectFilesNoMatch,
    ProjectFilesSkeleton,
    SORTS,
    TYPE_FILTERS,
    shownFiles,
    useProjectFiles,
    type FileSort,
    type FileTypeFilter,
} from "@/components/project/projectFiles"

interface ProjectAttachmentsProps {
    projectId: string;
    /** The project's name, for "Drop to upload to Q4 launch". */
    projectName?: string;
    /** A member may link docs and boards; the server checks again. */
    canLink?: boolean;
}

const VIEW_KEY = "oc-project-files-view"

/**
 * A project's Files tab on a computer (content.md F01), in the frame every
 * tab of a project draws in: a toolbar (Type, Sort; search, list or grid,
 * Link doc or board, Upload), the files as cards or rows, then the docs and
 * boards linked to the project. The whole tab takes dropped files (F04): an
 * overlay says where they go, and each upload is a card with a ring that
 * keeps its failure on the card with Retry.
 */
export function ProjectAttachments({ projectId, projectName, canLink = false }: ProjectAttachmentsProps) {
    const p = useProjectFiles(projectId)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [type, setType] = React.useState<FileTypeFilter>("all")
    const [sort, setSort] = React.useState<FileSort>("newest")
    const [query, setQuery] = React.useState("")
    const [searching, setSearching] = React.useState(false)
    const [view, setView] = React.useState<"grid" | "list">("grid")
    React.useEffect(() => {
        try {
            if (localStorage.getItem(VIEW_KEY) === "list") setView("list")
        } catch {
            /* the grid then */
        }
    }, [])
    const chooseView = (v: "grid" | "list") => {
        setView(v)
        try {
            localStorage.setItem(VIEW_KEY, v)
        } catch {
            /* for this visit */
        }
    }

    const links = useEntityLinks("project", projectId)
    const linked = links.docs.length + links.boards.length
    const mayLink = canLink && !links.forbidden
    const loading = p.list.isLoading || (links.isLoading && linked === 0)
    const failed = !!p.list.isError && !p.list.data
    const shown = React.useMemo(() => shownFiles(p.files, type, sort, query), [p.files, type, sort, query])
    const filtering = type !== "all" || !!query.trim()
    const empty = !loading && !failed && p.files.length === 0 && p.uploading.length === 0 && linked === 0
    const pickFiles = () => fileInputRef.current?.click()

    // "U" uploads, from anywhere on the tab but a field.
    React.useEffect(() => {
        if (!p.canAdd) return
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return
            if (e.key === "u" || e.key === "U") {
                e.preventDefault()
                fileInputRef.current?.click()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [p.canAdd])

    // The drop target: files dragged over the tab show where they will go.
    const [dragging, setDragging] = React.useState(false)
    const depth = React.useRef(0)
    const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")
    const dropProps = p.canAdd
        ? {
              onDragEnter: (e: React.DragEvent) => {
                  if (!hasFiles(e)) return
                  e.preventDefault()
                  depth.current++
                  setDragging(true)
              },
              onDragOver: (e: React.DragEvent) => {
                  if (hasFiles(e)) e.preventDefault()
              },
              onDragLeave: () => {
                  depth.current = Math.max(0, depth.current - 1)
                  if (depth.current === 0) setDragging(false)
              },
              onDrop: (e: React.DragEvent) => {
                  if (!hasFiles(e)) return
                  e.preventDefault()
                  depth.current = 0
                  setDragging(false)
                  p.upload(Array.from(e.dataTransfer.files))
              },
          }
        : {}

    const menu = <T extends string>(label: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm font-[510] text-ink-2" aria-label={`${label}: ${options.find((o) => o.value === value)?.label}`}>
                    {value === options[0].value && label === "Type" ? "Type" : options.find((o) => o.value === value)?.label}
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
                {options.map((o) => (
                    <DropdownMenuItem key={o.value} onSelect={() => onPick(o.value)} aria-current={o.value === value || undefined} className="justify-between gap-4">
                        {o.label}
                        <MenuCheck checked={o.value === value} />
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )

    return (
        // data-file-over, not data-dragging: that one is the document's drag
        // (lib/ui/dnd), and a variant on it restyles the whole page.
        <div {...dropProps} data-file-over={dragging} data-files-tab="" className="group/files relative flex flex-col pb-4">
            {/* The tab frame's band (components/task/workFrame), flush under
                the tabs with 28 px controls, as on every other tab. */}
            <div data-work-toolbar="" className={workToolbar}>
                {menu("Type", type, TYPE_FILTERS, setType)}
                {menu("Sort", sort, SORTS, setSort)}
                <div className="ml-auto flex items-center gap-1">
                    {searching ? (
                        <label className="flex h-7 w-56 items-center gap-1.5 rounded-md bg-raised px-2 shadow-e1 focus-within:focus-halo">
                            <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                data-escape-own=""
                                onKeyDown={fieldKeyDown((e) => e.key === "Escape" && (setQuery(""), setSearching(false)))}
                                placeholder="Search files"
                                aria-label="Search files"
                                className="min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-3"
                            />
                            <button type="button" aria-label="Close search" onClick={() => (setQuery(""), setSearching(false))} className="text-ink-3 hover:text-ink">
                                <X className="size-3.5" />
                            </button>
                        </label>
                    ) : (
                        <Button variant="ghost" size="icon-sm" className="text-ink-2" aria-label="Search files" onClick={() => setSearching(true)}>
                            <Search className="size-3.5" />
                        </Button>
                    )}
                    <div role="radiogroup" aria-label="View" className="inline-flex h-7 items-center rounded-md bg-press p-0.5">
                        {([["grid", LayoutGrid, "Grid"], ["list", List, "List"]] as const).map(([v, Icon, name]) => (
                            <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={view === v}
                                aria-label={name}
                                onClick={() => chooseView(v)}
                                className={cn("inline-flex size-6 items-center justify-center rounded-[5px] transition-colors", view === v ? "bg-raised text-ink shadow-e1" : "text-ink-3 hover:text-ink")}
                            >
                                <Icon className="size-3.5" />
                            </button>
                        ))}
                    </div>
                    {mayLink && (
                        <EntityLinkPicker
                            onPick={(refType, refUUID) => links.addLink(refType, refUUID)}
                            isLinked={links.hasLink}
                            disabled={links.mutating}
                            triggerClassName="h-7 gap-1.5 text-ink-2 hover:text-ink"
                        />
                    )}
                    {p.canAdd && (
                        <Button size="sm" className="gap-1.5" onClick={pickFiles} aria-keyshortcuts="U">
                            <Upload className="size-3.5" aria-hidden="true" />
                            Upload
                            <kbd className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-xs bg-white/20 px-1 text-micro font-medium" aria-hidden="true">U</kbd>
                        </Button>
                    )}
                </div>
            </div>
            <div className="px-6 pt-5">
                {loading ? (
                    <ProjectFilesSkeleton view={view} />
                ) : failed ? (
                    <WorkState>
                        <ErrorState subject="the files" onRetry={() => void p.list.mutate()} />
                    </WorkState>
                ) : empty ? (
                    <ProjectFilesEmpty onAdd={p.canAdd ? pickFiles : undefined} />
                ) : (
                    <div className="space-y-8">
                        {(p.files.length > 0 || p.uploading.length > 0) && (
                            <section aria-label="Files">
                                {filtering && shown.length === 0 && p.uploading.length === 0 ? (
                                    <ProjectFilesNoMatch query={query.trim() || TYPE_FILTERS.find((t) => t.value === type)!.label.toLowerCase()} className="py-10" />
                                ) : (
                                    <div key={view} className={cn("content-view-in", view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-4" : "grid border-t border-line")} data-files-view={view}>
                                        {p.uploading.map((u) => (
                                            <UploadingFileCard
                                                key={u.key}
                                                view={view}
                                                name={u.fileName}
                                                progress={u.progress}
                                                size={u.size}
                                                failed={u.failed}
                                                onCancel={() => p.cancel(u.key)}
                                                onRetry={u.file ? () => p.retry(u.key) : undefined}
                                                onRemove={() => p.remove(u.key)}
                                            />
                                        ))}
                                        {shown.map((file) =>
                                            view === "grid" ? (
                                                <FileCard key={file.attachment_uuid} file={file} mediaPath={p.mediaPath(file.attachment_uuid)} onOpen={() => p.open(file)} canDelete={p.isAdmin} onDelete={() => p.del(file.attachment_uuid)} />
                                            ) : (
                                                <FileRow key={file.attachment_uuid} file={file} mediaPath={p.mediaPath(file.attachment_uuid)} onOpen={() => p.open(file)} canDelete={p.isAdmin} onDelete={() => p.del(file.attachment_uuid)} />
                                            ),
                                        )}
                                    </div>
                                )}
                            </section>
                        )}
                        {linked > 0 && (
                            <section aria-label="Linked docs and boards">
                                <h3 className={cn(sectionTitle, "mb-3 flex items-baseline gap-2")}>
                                    Linked docs and boards <span className="text-meta font-normal tabular-nums text-ink-3">{linked}</span>
                                </h3>
                                <div className="flex max-w-xl flex-col gap-1.5">
                                    <LinkedItemsList docs={links.docs} boards={links.boards} canEdit={mayLink} onRemove={links.removeLink} />
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
            {dragging ? (
                <div
                    aria-hidden="true"
                    data-drop-overlay=""
                    className="content-float pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-brand/[0.06] outline-2 -outline-offset-2 outline-dashed outline-brand backdrop-brightness-[.96]"
                >
                    <span className="inline-flex size-12 items-center justify-center rounded-xl bg-brand/10 text-brand-text">
                        <Upload className="size-5" />
                    </span>
                    <p className="text-heading font-semibold text-ink">Drop to upload{projectName ? ` to ${projectName}` : ""}</p>
                </div>
            ) : null}
            {p.canAdd && (
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => {
                        if (e.target.files?.length) p.upload(Array.from(e.target.files))
                        e.target.value = ""
                    }}
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                />
            )}
        </div>
    )
}
