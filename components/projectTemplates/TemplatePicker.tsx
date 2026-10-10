"use client"

// "Start from" in the New project dialog: blank, the built-in templates, then
// the ones this workspace saved. It's a radio group, so the arrow keys move
// through it. A saved template can be downloaded (to start projects in
// another OneCamp) or deleted by whoever saved it or an admin, and a template
// file adds one.

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, MoreHorizontal, Trash2, Upload } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { DescribeProject } from "@/components/projectTemplates/DescribeProject"
import { useToast } from "@/hooks/use-toast"
import { addTemplate, deleteTemplate, downloadTemplate, useProjectTemplates } from "@/hooks/useProjectTemplates"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { AI_DRAFT, BLANK, previewLine, summaryOf, type ProjectTemplate, readTemplateFile, taskCount, TemplateFileError, type TemplateSummary } from "@/lib/projectTemplates"

interface TemplatePickerProps {
  value: string
  onChange: (id: string) => void
  /** The template chosen, once the list has it, for the dialog's button. */
  onChosen?: (t: TemplateSummary | null) => void
  /** A plan the AI drafted (AI edition), offered first and chosen when it arrives. */
  draft?: ProjectTemplate | null
  onDraft?: (t: ProjectTemplate) => void
}

export function TemplatePicker({ value, onChange, onChosen, draft, onDraft }: TemplatePickerProps) {
  const { templates, isLoading, isError } = useProjectTemplates()
  const { toast } = useToast()
  const labelId = React.useId()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const drafted = React.useMemo(() => (draft ? summaryOf(draft, AI_DRAFT) : null), [draft])
  const chosen = React.useMemo(
    () => (value === AI_DRAFT ? drafted : templates.find((t) => t.id === value) ?? null),
    [templates, value, drafted],
  )
  React.useEffect(() => onChosen?.(chosen), [chosen, onChosen])

  // A choice that's gone (deleted elsewhere) falls back to blank.
  React.useEffect(() => {
    if (value !== BLANK && !isLoading && templates.length > 0 && !chosen) onChange(BLANK)
  }, [value, isLoading, templates.length, chosen, onChange])

  const builtIn = templates.filter((t) => t.built_in)
  const saved = templates.filter((t) => !t.built_in)

  const fail = (title: string, e: unknown) =>
    toast({ variant: "destructive", title, description: e instanceof TemplateFileError ? e.message : apiErrorMessage(e, "Try again in a moment.") })

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      const added = await addTemplate(readTemplateFile(await file.text()))
      onChange(added.id)
      toast({ title: `Added “${added.name}”`, description: "It's chosen below, and everyone who creates projects can use it." })
    } catch (err) {
      fail("That template couldn't be added", err)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (t: TemplateSummary) => {
    setBusy(true)
    try {
      await deleteTemplate(t.id)
      if (value === t.id) onChange(BLANK)
      setConfirming(null)
    } catch (err) {
      fail("That template couldn't be deleted", err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label id={labelId}>Start from</Label>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Add a template file
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} aria-hidden tabIndex={-1} />
      </div>

      <RadioGroupPrimitive.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={onChange}
        className="grid max-h-[min(19rem,40vh)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain p-0.5 sm:grid-cols-2"
      >
        {drafted && <Choice value={AI_DRAFT} title={drafted.name} line={drafted.description || "Drafted by the AI from what you wrote"} count={drafted.task_count} selected={value === AI_DRAFT} />}
        <Choice value={BLANK} title="Blank" line="An empty project, to fill as you go." selected={value === BLANK} />
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-lg" />)}
        {builtIn.map((t) => (
          <Choice key={t.id} value={t.id} title={t.name} line={t.description} count={t.task_count} selected={value === t.id} />
        ))}
        {saved.length > 0 && <p className="col-span-full pt-1 text-xs font-medium text-muted-foreground">Saved in this workspace</p>}
        {saved.map((t) => (
          <Choice
            key={t.id}
            value={t.id}
            title={t.name}
            line={t.description || (t.created_by ? `Saved by ${t.created_by}` : "")}
            count={t.task_count}
            selected={value === t.id}
            menu={
              confirming === t.id ? null : (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`More for ${t.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => downloadTemplate(t.id).catch((err) => fail("That template couldn't be downloaded", err))}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    {t.can_delete && (
                      <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onSelect={() => setConfirming(t.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete…
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
            confirm={
              confirming === t.id && (
                <div className="col-span-full flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs">
                  <span>Delete it for everyone?</span>
                  <span className="flex gap-1">
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                    <Button type="button" size="sm" variant="destructive" className="h-6 px-2 text-xs" disabled={busy} onClick={() => onDelete(t)}>
                      Delete
                    </Button>
                  </span>
                </div>
              )
            }
          />
        ))}
      </RadioGroupPrimitive.Root>

      {onDraft && (
        <DescribeProject
          onDrafted={(t) => {
            onDraft(t)
            onChange(AI_DRAFT)
          }}
        />
      )}
      {isError && <p className="text-xs text-muted-foreground">Templates couldn&apos;t load just now. A blank project still works.</p>}
      {chosen && chosen.preview.length > 0 && (
        <p className="line-clamp-2 text-xs text-muted-foreground" aria-live="polite">
          {previewLine(chosen)}
        </p>
      )}
    </div>
  )
}

interface ChoiceProps {
  value: string
  title: string
  line: string
  count?: number
  selected: boolean
  menu?: React.ReactNode
  confirm?: React.ReactNode
}

// One choice: a card that is a radio button. A saved template's menu sits
// beside the button, not in it, since a button can't hold another.
function Choice({ value, title, line, count, selected, menu, confirm }: ChoiceProps) {
  return (
    <div className={cn("relative rounded-lg border transition-colors", selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
      <RadioGroupPrimitive.Item
        value={value}
        className={cn(
          "flex h-full min-h-[4.5rem] w-full flex-col items-start gap-1 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          menu && "pr-9",
        )}
      >
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{taskCount(count)}</span>}
        </span>
        {line && <span className="line-clamp-2 text-xs text-muted-foreground">{line}</span>}
      </RadioGroupPrimitive.Item>
      {menu && <div className="absolute right-1.5 top-1.5">{menu}</div>}
      {confirm && <div className="px-2 pb-2">{confirm}</div>}
    </div>
  )
}
