"use client"

/**
 * A spreadsheet into tables (tables S1, step 7): a .csv, .tsv, .xlsx, .xlsm
 * or .ods file becomes tables of the person's own, a table a sheet, or comes
 * into a table they have, its rows added or matched by a column. The server
 * reads the file and guesses each column's kind (business/DataTable
 * sheetImport.go); here the person sees what it found and chooses, then the
 * import runs as one job. A sheet on a phone, its actions pinned below.
 *
 * Who may: anyone signed in to the workspace makes tables of their own (they
 * come private); a sheet comes into a table only for someone who may write
 * its rows. The server holds both; a refusal is shown in its own words.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImportDropZone } from "@/components/common/importDropZone"
import { chooseImport, getJob, jobIsAtRest, loadCapabilities, startImport, type ContentIOCapabilities, type ContentIOJob } from "@/lib/export/contentIO"
import { extensionOf, megabytes, useJobFollow } from "@/lib/export/useImportJobs"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { formatLocale } from "@/lib/tables/numberFormat"
import { tablePath } from "@/lib/tables/route"
import {
  SHEET_EXTENSIONS,
  SHEET_KINDS,
  choicesOf,
  fillableFields,
  matchColumns,
  readPreview,
  rowsToCome,
  withColumn,
  withSheet,
  type PreviewSheet,
  type SheetChoice,
  type SheetChoices,
  type SheetPreview,
} from "@/lib/tables/sheetImport"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { orList } from "@/lib/utils/format/orList"
import { browserTZ } from "@/lib/utils/timeZone"
import { ix } from "@/lib/ui/interactive"
import { useFetch } from "@/hooks/useFetch"
import { tableFieldsKey, type FieldType, type TableField } from "@/services/tableService"

const LEAVE = "__leave"
const NO_MATCH = "__none"
/** The files it reads, as its words name them. */
const SHEET_FILES = orList(SHEET_EXTENSIONS)

/** The table a sheet comes into, from its page. */
export interface ImportTarget {
  id: string
  name: string
}

type Phase = "pick" | "reading" | "choosing" | "importing" | "done" | "failed"

export function ImportSheetDialog({ into, onClose, onDone }: { into?: ImportTarget; onClose(): void; /** Once its rows are in: the page reads them. */ onDone?: () => void }) {
  const router = useRouter()
  const [caps, setCaps] = React.useState<ContentIOCapabilities | null>(null)
  const [phase, setPhase] = React.useState<Phase>("pick")
  const [job, setJob] = React.useState<ContentIOJob | null>(null)
  const [preview, setPreview] = React.useState<SheetPreview | null>(null)
  const [choices, setChoices] = React.useState<SheetChoices | null>(null)
  const [sheet, setSheet] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  // One write to the job at a time: a second press while one is on its way does nothing.
  const writing = React.useRef(false)
  // The fields a sheet's columns may come into, read as the rollup settings read another table's.
  const { data: target } = useFetch<{ data: TableField[] }>(into ? tableFieldsKey(into.id) : "")
  const intoFields = React.useMemo(() => target?.data ?? [], [target])

  React.useEffect(() => {
    let live = true
    void loadCapabilities().then((c) => live && setCaps(c))
    return () => {
      live = false
    }
  }, [])

  // Where the job's answer takes the dialog. A ready job's preview comes only
  // with a read of the job, so the answer to a start or a choice may need one.
  const land = React.useCallback(
    async (next: ContentIOJob) => {
      setJob(next)
      if (next.status === "failed") {
        setError(next.error || "The file couldn't be imported.")
        setPhase("failed")
      } else if (next.status === "done") {
        setPhase("done")
        onDone?.()
      } else if (next.status === "ready") {
        const read = readPreview(next.preview ?? (await getJob(next.id)).preview)
        if (!read) {
          setError("The file was read, but what it holds couldn't be shown. Try again.")
          setPhase("failed")
          return
        }
        setPreview(read)
        const shown = into ? (read.sheets.find((s) => s.into === into.id)?.index ?? read.sheets[0]?.index ?? 0) : (read.sheets[0]?.index ?? 0)
        setSheet((at) => (read.sheets.some((s) => s.index === at) && !into ? at : shown))
        setChoices(choicesOf(read, into && { table: into.id, sheet: shown }))
        setPhase("choosing")
      }
    },
    [into, onDone],
  )
  useJobFollow(
    job && !jobIsAtRest(job) ? [job.id] : [],
    (news) => {
      // The same status again is its progress; another is the job's next step. News of a ready
      // job carries no preview: the follow's next read brings it.
      if (news.status === job?.status) setJob(news)
      else if (news.status !== "ready" || news.preview) void land(news)
    },
    () => {
      setJob(null)
      setError("This import can't be followed any more.")
      setPhase("failed")
    },
  )

  const pick = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file || writing.current) return
    if (!SHEET_EXTENSIONS.includes(extensionOf(file.name))) return setError(`This kind of file can't be imported. Use a ${SHEET_FILES} file.`)
    if (caps && file.size > caps.max_import_bytes) return setError(`Larger than the ${megabytes(caps.max_import_bytes)} an import takes.`)
    writing.current = true
    setError(null)
    setPhase("reading")
    try {
      // Into a table, its first sheet comes there; the person may pick another.
      const first = into ? { zone: browserTZ(), sheets: [{ index: 0, into: into.id }] } : { zone: browserTZ() }
      await land(await startImport(file, "", caps, "table", first))
    } catch (err) {
      setError(apiErrorMessage(err, "The file couldn't be read. Try again."))
      setPhase("pick")
    } finally {
      writing.current = false
    }
  }

  // Asks the server again: how the file's text reads, or which sheet comes into the table, changed.
  const choose = async (next: SheetChoices, confirm: boolean) => {
    if (!job || writing.current) return
    writing.current = true
    setChoices(next)
    setPhase(confirm ? "importing" : "reading")
    try {
      await land(await chooseImport(job.id, next, confirm))
    } catch (err) {
      setError(apiErrorMessage(err, "The import couldn't go on. Try again."))
      setPhase("choosing")
    } finally {
      writing.current = false
    }
  }

  const shown = preview?.sheets.find((s) => s.index === sheet)
  const chosen = choices?.sheets.find((s) => s.index === sheet)
  const rows = preview && choices ? rowsToCome(preview, choices) : 0
  const n = (x: number) => formatLocale(x, {})
  const opened = job?.show
  const open = () => {
    if (opened) router.push(tablePath(opened.uuid))
    onClose()
  }

  const footer =
    phase === "done" ? (
      into ? (
        <Button onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {opened ? <Button onClick={open}>Open {opened.title || "table"}</Button> : null}
        </>
      )
    ) : (
      <>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={phase !== "choosing" || rows === 0} busy={phase === "reading" || phase === "importing"} onClick={() => choices && void choose(choices, true)}>
          {phase === "importing" ? "Importing…" : rows ? `Import ${n(rows)} ${rows === 1 ? "row" : "rows"}` : "Import"}
        </Button>
      </>
    )

  return (
    <ResponsiveDialog
      title={into ? `Import rows into ${into.name || "this table"}` : "Import a spreadsheet"}
      description={into ? `Rows of a ${SHEET_FILES} file, added to this table or matched to its rows.` : `A ${SHEET_FILES} file becomes tables of your own, one for each sheet.`}
      footer={footer}
      onClose={onClose}
      wide
    >
      <div className="flex min-w-0 flex-col gap-4" data-import-sheet="">
        {phase === "pick" || (phase === "reading" && !preview) ? <ImportDropZone accept={SHEET_EXTENSIONS} multiple={false} label="Choose a file" disabled={phase === "reading"} onFiles={(f) => void pick(f)} /> : null}
        {phase === "reading" && !preview ? <p className="text-ui-sm text-ink-2" role="status">Reading the file…</p> : null}
        {error ? (
          <p className="text-ui-sm text-danger-ink" role="alert">
            {error}
          </p>
        ) : null}
        {phase === "failed" ? (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => (setError(null), setJob(null), setPreview(null), setChoices(null), setPhase("pick"))}>
            Choose another file
          </Button>
        ) : null}

        {preview && choices && (phase === "choosing" || phase === "reading") ? (
          // While the server reads the file again, the choices wait for its answer.
          <div className="flex min-w-0 flex-col gap-4" inert={phase === "reading"} aria-busy={phase === "reading"}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-ui-sm text-ink-2">
              <span className="flex items-center gap-2">
                Dates
                <SegmentedControl
                  aria-label="Dates are written"
                  value={choices.day_first === false ? "month" : "day"}
                  onValueChange={(v) => void choose({ ...choices, day_first: v === "day" }, false)}
                  options={[
                    { value: "day", label: "31/12" },
                    { value: "month", label: "12/31" },
                  ]}
                />
              </span>
              <span className="flex items-center gap-2">
                Numbers
                <SegmentedControl
                  aria-label="Numbers are written"
                  value={choices.signs?.decimal === "," ? "comma" : "point"}
                  onValueChange={(v) => void choose({ ...choices, signs: v === "comma" ? { decimal: ",", group: "." } : { decimal: ".", group: "," } }, false)}
                  options={[
                    { value: "point", label: "1,234.5" },
                    { value: "comma", label: "1.234,5" },
                  ]}
                />
              </span>
            </div>

            {preview.sheets.length > 1 ? (
              <div role="tablist" aria-label="Sheets" data-edge-fade="" className="relative flex min-w-0 gap-1 overflow-x-auto">
                {preview.sheets.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    role="tab"
                    aria-selected={s.index === sheet}
                    {...ix("tab")}
                    onClick={() => {
                      setSheet(s.index)
                      // Into a table, the sheet picked is the one that comes; the server maps its columns.
                      if (into && s.index !== sheet) void choose(choicesOf(preview, { table: into.id, sheet: s.index }), false)
                    }}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ui-sm font-medium text-ink-3 hover:text-ink-2 aria-selected:text-ink"
                  >
                    {s.name}
                    <span className="tabular-nums text-ink-3">{n(s.rows)}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {shown && chosen ? (
              <SheetColumns
                sheet={shown}
                choice={chosen}
                into={into && intoFields}
                onChange={(next) => setChoices((c) => c && withSheet(c, sheet, () => next))}
              />
            ) : null}
          </div>
        ) : null}

        {phase === "importing" ? <Progress value={job?.progress ?? 0} className="h-1.5" aria-label="Importing" /> : null}
        {phase === "done" && job ? <Imported job={job} /> : null}
      </div>
    </ResponsiveDialog>
  )
}

/** One sheet's columns as they come: kept or left out, named and of a kind; or, into a table, each into a field of it. */
function SheetColumns({
  sheet,
  choice,
  into,
  onChange,
}: {
  sheet: PreviewSheet
  choice: SheetChoice
  /** Coming into a table: its fields. */
  into?: TableField[]
  onChange: (next: SheetChoice) => void
}) {
  const targets = into ? fillableFields(into) : []
  const keys = into ? matchColumns(choice, into) : []
  const guessed = new Map(sheet.fields.map((f) => [f.key, f.type]))
  const samples = (i: number) =>
    sheet.sample
      .map((r) => r[i] ?? "")
      .filter((v) => v.trim() !== "")
      .slice(0, 3)
      .join(" · ")
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {into ? (
        <label className="flex flex-wrap items-center gap-2 text-ui-sm text-ink-2">
          Match rows by
          <Select value={choice.match_by || NO_MATCH} onValueChange={(v) => onChange({ ...choice, match_by: v === NO_MATCH ? "" : v })}>
            <SelectTrigger className="h-8 w-56" aria-label="Match rows by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MATCH}>Nothing: add every row</SelectItem>
              {keys.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {sheet.fields.find((f) => f.key === k.key)?.name ?? k.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : sheet.hidden || choice.bring === false ? (
        <label className="flex items-center gap-2 text-ui-sm text-ink-2">
          <Checkbox checked={choice.bring} onCheckedChange={(v) => onChange({ ...choice, bring: v === true })} aria-label={`Bring ${sheet.name}`} />
          Bring this sheet{sheet.hidden ? " (hidden in the file)" : ""}
        </label>
      ) : null}
      <ul className="flex min-w-0 flex-col divide-y divide-line rounded-lg border border-line" aria-label={`Columns of ${sheet.name}`}>
        {sheet.fields.map((f, i) => {
          const c = choice.fields.find((x) => x.key === f.key) ?? { key: f.key }
          const kind = (c.type ?? f.type) as FieldType
          const Glyph = fieldKind(kind).glyph
          const notes = c.type && c.type !== guessed.get(f.key) ? [] : (sheet.notes ?? []).filter((x) => x.field === f.key)
          return (
            <li key={f.key} className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5" data-leave={c.leave ? "" : undefined}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {into ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">{f.name}</span>
                    <Select value={c.leave || !c.field ? LEAVE : c.field} onValueChange={(v) => onChange(withColumn(choice, f.key, v === LEAVE ? { leave: true, field: "" } : { leave: false, field: v }))}>
                      <SelectTrigger className="h-8 w-48" aria-label={`Field for ${f.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LEAVE}>Leave out</SelectItem>
                        {targets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Checkbox checked={!c.leave} onCheckedChange={(v) => onChange(withColumn(choice, f.key, { leave: v !== true }))} aria-label={`Bring ${f.name}`} />
                    <Input
                      value={c.name ?? f.name}
                      maxLength={120}
                      disabled={c.leave}
                      onChange={(e) => onChange(withColumn(choice, f.key, { name: e.target.value }))}
                      aria-label={`Name of column ${i + 1}`}
                      className="h-8 min-w-0 flex-1 basis-40"
                    />
                    <Select value={kind} disabled={c.leave} onValueChange={(v) => onChange(withColumn(choice, f.key, { type: v as FieldType }))}>
                      <SelectTrigger className="h-8 w-40" aria-label={`Kind of ${c.name ?? f.name}`}>
                        <Glyph className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHEET_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {fieldKind(k).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              {samples(i) ? <p className="truncate text-ui-sm text-ink-3">{samples(i)}</p> : null}
              {notes.map((x) => (
                <p key={x.code} className="text-ui-sm text-warning-ink">
                  {x.msg}
                </p>
              ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** What a finished import made: its tables, the rows, and what it left out. */
function Imported({ job }: { job: ContentIOJob }) {
  const made = job.made ?? 0
  return (
    <div className="flex flex-col gap-2 text-ui text-ink" role="status">
      <p>
        {formatLocale(made, {})} {made === 1 ? "row" : "rows"} imported
        {job.created?.length ? ` into ${job.created.length === 1 ? "a new table" : `${job.created.length} new tables`}` : job.show ? ` into ${job.show.title}` : ""}.
      </p>
      {!!job.skipped?.length && (
        <ul className="list-disc pl-5 text-ui-sm text-ink-2">
          {job.skipped.map((s) => (
            <li key={`${s.what}:${s.why}`}>
              {s.what}: {s.why}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ImportSheetDialog
