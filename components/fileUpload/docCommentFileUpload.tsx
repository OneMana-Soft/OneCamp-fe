"use client"

import { X } from "@/lib/icons"
import { AttachmentIcon } from "@/components/attachments/attachmentIcon"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import type { CommentDraft } from "@/components/docComments/useCommentDraft"

/**
 * A comment draft's files, above its words (docs programme B7): each with how
 * far it has got, or why it couldn't be stored, and a button that takes it
 * off. What was refused before uploading (too big, too many) is said here
 * too, as an error, until the next change. The files belong to this draft
 * alone (useCommentDraft): a late one never joins another comment (N41).
 */
export function DocCommentFileUpload({ docId, draft }: { docId: string; draft: Pick<CommentDraft, "files" | "refused" | "remove"> }) {
    if (draft.files.length === 0 && !draft.refused) return null
    return (
        <div data-comment-files="" className="flex flex-col gap-1.5 pb-1.5">
            {draft.files.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Attached files">
                    {draft.files.map((f) => {
                        const state = f.error ? `Couldn't upload: ${f.error}` : f.uuid ? "Attached" : `Uploading · ${f.progress}%`
                        return (
                            <li
                                key={f.key}
                                data-comment-file={f.error ? "failed" : f.uuid ? "done" : "uploading"}
                                className={cn(
                                    "relative flex max-w-[15rem] items-center gap-2 overflow-hidden rounded-lg bg-raised py-1 pl-1 pr-7 shadow-e1",
                                    f.error && "ring-1 ring-destructive/40",
                                )}
                            >
                                <AttachmentIcon
                                    attachmentType={f.type}
                                    fileName={f.name}
                                    getUrl={f.uuid ? `${GetEndpointUrl.GetDocMedia}/${docId}/${f.uuid}` : undefined}
                                    attachmentOnCLick={() => undefined}
                                    focusable={false}
                                />
                                <span className="min-w-0">
                                    <span className="block truncate text-ui-sm font-medium text-ink">{f.name}</span>
                                    <span className={cn("block truncate text-meta tabular-nums", f.error ? "text-danger-ink" : "text-ink-3")}>{state}</span>
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${f.name}`}
                                    onClick={() => draft.remove(f.key)}
                                    className="absolute right-1 top-1 rounded-md p-0.5 text-ink-3 transition-colors duration-[140ms] ease-out hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                                >
                                    <X className="size-3.5" aria-hidden="true" />
                                </button>
                                {!f.uuid && !f.error && (
                                    <span
                                        role="progressbar"
                                        aria-label={`Uploading ${f.name}`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={f.progress}
                                        className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-press"
                                    >
                                        <span
                                            className="block h-full w-full origin-left bg-brand transition-transform duration-200 ease-linear motion-reduce:transition-none"
                                            style={{ transform: `scaleX(${Math.max(0, Math.min(100, f.progress)) / 100})` }}
                                        />
                                    </span>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
            {draft.refused && (
                <p role="alert" className="text-meta text-danger-ink">
                    {draft.refused}
                </p>
            )}
        </div>
    )
}
