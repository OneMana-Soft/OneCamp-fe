"use client"

// A form's latest answers, for the project's admins (GET .../submissions):
// each one with its answers by question, its files by name, and the task it
// made or the table row it added, or every question at a glance, its choices
// counted.

import Link from "next/link"
import { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { ExternalLink, Inbox } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Bar } from "@/components/ui/progress"
import { useFetch } from "@/hooks/useFetch"
import { relativeTime } from "@/lib/utils/relativeTime"
import { ix } from "@/lib/ui/interactive"
import { app_tables_path, app_task_path } from "@/types/paths"
import { sentAnswer, type ProjectForm, type SentFile, type Submission } from "@/lib/forms/forms"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { MiddleName } from "@/components/ui/middleName"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { GetMediaURLRes } from "@/types/file"
import { summarize } from "@/lib/forms/responses"

export function FormResponses({ url, projectId, form, hue }: { url: string; projectId: string; form: ProjectForm; hue: CampHue }) {
  const { data, isLoading, isError, mutate } = useFetch<{ data: { submissions: Submission[]; total: number } }>(`${url}/${form.id}/submissions`, undefined, { revalidateOnFocus: false })
  const [view, setView] = useState<"each" | "questions">("each")
  // The questions whose answers in words are all shown (each card shows three until opened).
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  const subs = useMemo(() => data?.data?.submissions ?? [], [data])
  const total = data?.data?.total ?? subs.length
  const summary = useMemo(() => summarize(form.fields, subs), [form.fields, subs])

  if (isError) return <ErrorState compact subject="this form's answers" onRetry={() => void mutate()} />
  if (isLoading || !data) {
    return (
      <div role="status" aria-label="Loading the answers" className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    )
  }
  if (!subs.length) {
    return <EmptyState icon={Inbox} hue={hue} title="No answers yet" description="Share the form's link: each answer lands here, and as a task in the project." />
  }
  return (
    <div className={`${HUE_CLASS[hue]} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta tabular-nums text-ink-3">
          {total.toLocaleString("en")} {total === 1 ? "answer" : "answers"}
          {total > subs.length ? ` · the latest ${subs.length} here` : ""}
        </p>
        <SegmentedControl aria-label="Show" value={view} onValueChange={setView}
          options={[{ value: "each", label: "Each answer" }, { value: "questions", label: "By question" }]} />
      </div>
      {view === "each" ? (
        <ul aria-label="Answers" className="space-y-2">
          {subs.map((s) => (
            <li key={s.id} className="rounded-xl bg-raised p-3 shadow-e1">
              <div className="flex items-center justify-between gap-2">
                <time dateTime={s.created_at} title={new Date(s.created_at).toLocaleString()} className="text-meta tabular-nums text-ink-3">{relativeTime(s.created_at)}</time>
                {s.task_uuid && (
                  <Link href={`${app_task_path}/${s.task_uuid}`} className="inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-text md:h-7">
                    Open its task <ExternalLink aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
                {s.row_id && form.target_table && (
                  <Link href={`${app_tables_path}/${form.target_table}?row=${s.row_id}`} className="inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-brand-text md:h-7">
                    Open its row <ExternalLink aria-hidden="true" className="size-3.5" />
                  </Link>
                )}
              </div>
              <dl className="mt-1.5 grid gap-2">
                {s.answers.map((a, i) => {
                  const { label, value } = sentAnswer(a)
                  return (
                    <div key={`${a.id ?? label}-${i}`} className="grid gap-0.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-3">
                      <dt className="text-meta text-ink-3">{label}</dt>
                      <dd className="whitespace-pre-line break-words text-ui-sm text-ink">
                        {a.files?.length ? (
                          // Its files, as the app shows a file: they're on the task.
                          <ul aria-label={label} className="flex flex-wrap gap-1.5">
                            {a.files.map((f) => <AnswerFile key={f.id} file={f} all={a.files!} when={s.created_at} projectId={projectId} />)}
                          </ul>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {summary.map((q) => {
            const most = Math.max(1, ...(q.tally ?? []).map((t) => t.count))
            return (
              <section key={q.id} role="group" aria-label={q.label} className="rounded-xl bg-raised p-3 shadow-e1">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="min-w-0 text-sm font-medium text-ink">{q.label}</h4>
                  <span className="shrink-0 text-meta tabular-nums text-ink-3">{q.answered} answered</span>
                </div>
                {q.tally ? (
                  <ul className="mt-2 space-y-1.5">
                    {q.tally.map((t) => (
                      <li key={t.choice} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
                        <span className="truncate text-ui-sm text-ink-2">{t.choice}</span>
                        <span className="text-meta tabular-nums text-ink-3">{t.count}</span>
                        <Bar className="col-span-2" size={6} tone="sky" value={(t.count / most) * 100} label={`${t.choice}: ${t.count} of ${q.answered}`} doneAtFull={false} />
                      </li>
                    ))}
                  </ul>
                ) : q.said?.length ? (
                  <>
                    <ul className="mt-2 space-y-1">
                      {(opened.has(q.id) ? q.said : q.said.slice(0, 3)).map((v, i) => <li key={i} className="line-clamp-2 break-words text-ui-sm text-ink-2">{v}</li>)}
                    </ul>
                    {q.said.length > 3 && (
                      <button type="button" aria-expanded={opened.has(q.id)} {...ix("link")} className="mt-1 inline-flex h-11 items-center text-xs font-medium text-brand-text md:h-7"
                        onClick={() => setOpened((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n })}>
                        {opened.has(q.id) ? "Show fewer" : `+${q.said.length - 3} more`}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-meta text-ink-3">Nobody has answered it yet.</p>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A sent file as the viewer takes it: one of the project's files. */
const asMedia = (f: SentFile, when: string): AttachmentMediaReq => ({
  attachment_uuid: f.id, attachment_file_name: f.name || "A file", attachment_type: getAttachmentType(f.name || ""),
  attachment_size: f.size ?? 0, attachment_created_at: when, attachment_raw_type: f.mime,
})

/**
 * One file a visitor sent: its kind's glyph, its name cut in the middle and
 * its size. It opens in the app's viewer among the answer's other files, the
 * project's files as its task holds them; one that can't open says why here.
 */
function AnswerFile({ file, all, when, projectId }: { file: SentFile; all: SentFile[]; when: string; projectId: string }) {
  const dispatch = useDispatch()
  const [why, setWhy] = useState("")
  const [opening, setOpening] = useState(false)
  const name = file.name || "A file"
  const base = `${GetEndpointUrl.GetProjectMedia}/${projectId}`
  const open = async () => {
    setWhy("")
    setOpening(true)
    try {
      const res = await axiosInstance.get<GetMediaURLRes>(`${base}/${file.id}`, { suppressErrorToast: true })
      const media = { ...asMedia(file, when), initial_url: res.data.url }
      dispatch(openUI({ key: "attachmentLightbox", data: { media, allMedia: all.map((f) => (f.id === file.id ? media : asMedia(f, when))), mediaGetUrl: base } }))
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status
      setWhy(status === 404 ? "It's no longer on its task." : status === 403 ? "You can't open it here." : "It didn't open. Try again in a moment.")
    } finally {
      setOpening(false)
    }
  }
  return (
    <li className="grid min-w-0 max-w-full gap-1">
      <button type="button" aria-label={`Open ${name}`} aria-busy={opening} onClick={() => void open()} {...ix("row")}
        className="flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-raised py-1.5 pl-1.5 pr-3 text-left shadow-e1">
        <FileGlyph name={name} fileType={file.mime} size={32} />
        <span className="min-w-0">
          <MiddleName name={name} className="text-ui-sm font-medium text-ink" />
          {file.size ? <span className="block text-meta tabular-nums text-ink-3">{formatFileSizeForAttachment(file.size)}</span> : null}
        </span>
      </button>
      {why && <p role="status" className="text-meta text-danger-ink">{why}</p>}
    </li>
  )
}
