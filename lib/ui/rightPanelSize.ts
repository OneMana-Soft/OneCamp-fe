/**
 * How wide the right panel (a task, a thread, comments, OneCamp AI) is.
 *
 * Design v3 (shell V1): the panel is its own sheet, 452px by default, never
 * under 360px and never more than 60% of the group, and its width is held in
 * pixels. The panel group still sizes in percent, so these turn pixels into
 * the group's percentages. Its content is laid out at least
 * RIGHT_PANEL_MIN_PX wide: at 32% of a 1024px window the content once ran
 * under the page beside it and cut off "Mark complete" and the field labels.
 */

/** The narrowest the panel's content is laid out at. */
export const RIGHT_PANEL_MIN_PX = 360
/** Its usual width. */
export const RIGHT_PANEL_DEFAULT_PX = 452

/** The most of the group it may take. */
export const RIGHT_PANEL_MAX_PERCENT = 60
/** Before the group has been measured. */
const UNMEASURED_PERCENT = 32

const percentOf = (px: number, groupWidth: number) => Math.ceil((px / groupWidth) * 1000) / 10

/**
 * The right panel's minimum size, in percent of a panel group this many pixels
 * wide: what RIGHT_PANEL_MIN_PX takes, up to 60%. 32% before the group has
 * been measured. Pure.
 */
export function rightPanelMinSize(groupWidth: number): number {
  if (!(groupWidth > 0)) return UNMEASURED_PERCENT
  return Math.min(RIGHT_PANEL_MAX_PERCENT, percentOf(RIGHT_PANEL_MIN_PX, groupWidth))
}

/** The panel's opening size, in percent: 452px, within its bounds. Pure. */
export function rightPanelDefaultSize(groupWidth: number): number {
  if (!(groupWidth > 0)) return UNMEASURED_PERCENT
  return Math.min(RIGHT_PANEL_MAX_PERCENT, Math.max(rightPanelMinSize(groupWidth), percentOf(RIGHT_PANEL_DEFAULT_PX, groupWidth)))
}

/*
 * A thread in the panel (design v3 chat, C36): 420px by default, resizable
 * from 360 to 560px, so a conversation stays the wider of the two. Other
 * panels (a task, comments, OneCamp AI) keep 452px and 60%.
 */
export type RightPanelKind = "default" | "thread"
/** A thread's usual width. */
export const THREAD_PANEL_DEFAULT_PX = 420
/** The widest a thread's panel goes. */
export const THREAD_PANEL_MAX_PX = 560

const floorPercentOf = (px: number, groupWidth: number) => Math.floor((px / groupWidth) * 1000) / 10

/** What the panel shows, for its size: a thread, or anything else. Pure. */
export function rightPanelKind(data: { aiChatOpen?: boolean; docAiOpen?: boolean; chatUUID?: string; groupUUID?: string; channelUUID?: string; chatMessageUUID?: string; postUUID?: string } | undefined): RightPanelKind {
  if (!data || data.aiChatOpen || data.docAiOpen) return "default"
  if ((data.chatUUID || data.groupUUID) && data.chatMessageUUID) return "thread"
  if (data.channelUUID && data.postUUID) return "thread"
  return "default"
}

/** The panel's largest size, in percent: 60%, or 560px for a thread. Pure. */
export function rightPanelMaxSize(groupWidth: number, kind: RightPanelKind = "default"): number {
  if (kind !== "thread" || !(groupWidth > 0)) return RIGHT_PANEL_MAX_PERCENT
  return Math.min(RIGHT_PANEL_MAX_PERCENT, Math.max(rightPanelMinSize(groupWidth), floorPercentOf(THREAD_PANEL_MAX_PX, groupWidth)))
}

/** The panel's opening size for what it shows, in percent. Pure. */
export function rightPanelOpenSize(groupWidth: number, kind: RightPanelKind = "default"): number {
  if (kind !== "thread" || !(groupWidth > 0)) return rightPanelDefaultSize(groupWidth)
  return Math.min(rightPanelMaxSize(groupWidth, kind), Math.max(rightPanelMinSize(groupWidth), percentOf(THREAD_PANEL_DEFAULT_PX, groupWidth)))
}
