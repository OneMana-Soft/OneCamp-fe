/**
 * "Go to" keys, as Linear and GitHub have them: press G, then a letter, to go
 * somewhere without the mouse. Pure, for its test.
 */
import {
  app_board_path,
  app_calendar_path,
  app_channel_path,
  app_chat_path,
  app_doc_activity,
  app_doc_path,
  app_home_path,
  app_inbox_path,
  app_later_path,
  app_my_task_path,
  app_project_path,
} from "@/types/paths"

export const GO_KEYS: { key: string; to: string; label: string }[] = [
  { key: "h", to: app_home_path, label: "Home" },
  { key: "c", to: app_channel_path, label: "Channels" },
  { key: "m", to: app_chat_path, label: "Direct messages" },
  { key: "i", to: app_inbox_path, label: "Inbox" },
  { key: "t", to: app_my_task_path, label: "My Tasks" },
  { key: "a", to: app_doc_activity, label: "Activity" },
  { key: "l", to: app_later_path, label: "Later" },
  { key: "d", to: app_doc_path, label: "Docs" },
  { key: "b", to: app_board_path, label: "Boards" },
  { key: "p", to: app_project_path, label: "Projects" },
  { key: "k", to: app_calendar_path, label: "Calendar" },
]

/** How long after G the second key still counts. */
export const GO_WINDOW_MS = 1200

/** Where G then `key` goes, or null. */
export function goTarget(key: string): string | null {
  return GO_KEYS.find((g) => g.key === key.toLowerCase())?.to ?? null
}

/**
 * Whether keys belong to something else: what the person is typing in, or a
 * surface with its own single-letter keys (the whiteboard's tools: L is its
 * line tool, so G then L must not leave the board).
 */
export function isTyping(el: Element | null): boolean {
  if (!el) return false
  const h = el as HTMLElement
  return h.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(h.tagName) || !!h.closest?.('[contenteditable="true"], .excalidraw, [data-no-go-keys]')
}
