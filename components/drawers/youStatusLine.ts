import { formatSendAt } from "@/lib/messages/schedulePresets"

/**
 * The line under your name in the More sheet's You row (design v3, S12 on a
 * phone): what state you are in, most specific first. Focus outranks a pause,
 * a pause outranks your status text, and with none of them you are "Active".
 * Pure, for its test.
 */
export function youStatusLine({
  focusUntil,
  pausedUntil,
  emoji,
  text,
}: {
  focusUntil: Date | null
  pausedUntil: Date | null
  emoji?: string | null
  text?: string | null
}): string {
  if (focusUntil) return `In focus until ${formatSendAt(focusUntil)}`
  if (pausedUntil) return `Notifications paused until ${formatSendAt(pausedUntil)}`
  const status = [emoji, text?.trim()].filter(Boolean).join(" ")
  return status || "Active"
}
