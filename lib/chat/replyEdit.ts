/** An edit's time: a revert's `editedAt` (null: never), else now if the words changed. */
export function editedAtAfter(had: string | undefined, before: string | undefined, next: string, editedAt?: string | null): string | undefined {
    if (editedAt !== undefined) return editedAt ?? undefined
    return before !== next ? new Date().toISOString() : had
}

export function applyReplyEdit(reply: { comment_text: string; comment_updated_at?: string }, html: string, editedAt?: string | null): void {
    reply.comment_updated_at = editedAtAfter(reply.comment_updated_at, reply.comment_text, html, editedAt);
    reply.comment_text = html;
}
