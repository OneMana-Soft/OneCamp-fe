/**
 * What an event links (calendar head B, gcal-1a; a task since EVLINK, gcal-15):
 * the OneCamp docs, boards and tasks it carries, by reference, at most 25. The
 * event never names one: each reader's own read (POST /entities) does, and it
 * carries to each only what they may open. An upload in the doc tree is a doc.
 * Whoever may change the event links or unlinks one (business/Calendar
 * eventFiles.go); a new event is made with its links. Pure.
 */
export const EVENT_FILE_KINDS = ["doc", "board", "task"] as const
export type EventFileKind = (typeof EVENT_FILE_KINDS)[number]

export interface EventFile {
  kind: EventFileKind
  uuid: string
}

/** The most one event carries (business/Calendar maxEventFiles). */
export const MAX_EVENT_FILES = 25

const isFile = (f: unknown): f is EventFile => {
  const x = f as Partial<EventFile> | null
  return !!x && EVENT_FILE_KINDS.includes(x.kind as EventFileKind) && typeof x.uuid === "string" && !!x.uuid
}

/** Its files as the event carries them; anything else is left out. */
export function filesOf(event: { files?: unknown } | null | undefined): EventFile[] {
  const files = event?.files
  return Array.isArray(files) ? files.filter(isFile).map(({ kind, uuid }) => ({ kind, uuid })) : []
}

const same = (a: EventFile, b: EventFile) => a.kind === b.kind && a.uuid === b.uuid

/** The list with one more, once, while there is room. */
export function withFile(files: EventFile[], file: EventFile): EventFile[] {
  return files.some((f) => same(f, file)) || files.length >= MAX_EVENT_FILES ? files : [...files, { kind: file.kind, uuid: file.uuid }]
}

/** The list without one. */
export function withoutFile(files: EventFile[], file: EventFile): EventFile[] {
  return files.filter((f) => !same(f, file))
}

const filesPath = (eventId: string) => `/${encodeURIComponent(eventId)}/files`

/** Links one (an instance links it on its series); a refusal in the app's error toast, in the server's words. */
export function addFileRequest(eventId: string, file: EventFile) {
  return { method: "POST", apiEndpoint: "/calendar/events", appendToUrl: filesPath(eventId), payload: { kind: file.kind, uuid: file.uuid }, showErrorToast: true, failureTitle: "Couldn't link it to the event" } as const
}

/** Unlinks one (a soft delete). */
export function removeFileRequest(eventId: string, file: EventFile) {
  return { method: "DELETE", apiEndpoint: "/calendar/events", appendToUrl: `${filesPath(eventId)}/${file.kind}/${encodeURIComponent(file.uuid)}`, showErrorToast: true, failureTitle: "Couldn't unlink it from the event" } as const
}
