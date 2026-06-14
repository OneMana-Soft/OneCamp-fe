// Stub: lastMessagePreview — returns a plain-text summary of the last message.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLastMessagePreview(content: string, attachments?: any[]): string {
    if (attachments && attachments.length > 0 && !content) return "📎 Attachment"
    if (!content) return ""
    return content.replace(/<[^>]*>/g, "").trim().slice(0, 100)
}
