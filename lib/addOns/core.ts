import type { ComponentType, ReactNode } from "react"
import type { AttachmentMediaReq } from "@/types/attachment"

/**
 * Add-ons: what an edition adds to a surface both editions share, without the
 * surface naming it. An edition gives its own as the app loads, a line each
 * (lib/addOns/messages.ts, attachments.ts); with none, a surface shows nothing.
 */

/** A menu item, sheet row or bar button an add-on offers. */
export interface AddOnAction {
  /** Kept as the label changes, so the control keeps its place and focus. */
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** At work: it says so and takes no second press. */
  busy?: boolean
  run: () => void
}

/** Where an attachment was posted: a channel, a DM or a group, by its id. */
export interface AttachmentSource {
  srcKey: string
  srcRef: string
}

/** A message's: what it offers, and what shows under it. */
type MessageAddOn = { actions: AddOnAction[]; below: ReactNode }
/** A file's in the viewer: what it offers, and what it found. */
type AttachmentAddOn = { actions: AddOnAction[]; note: { title: string; text: string } | null }

/** No add-on, or one that offers nothing now. */
export const NO_MESSAGE_ADD_ON: MessageAddOn = { actions: [], below: null }
export const NO_ATTACHMENT_ADD_ON: AttachmentAddOn = { actions: [], note: null }

const given: {
  useMessage?: (text: string) => MessageAddOn
  useAttachment?: (media: AttachmentMediaReq | undefined, image: boolean, source: AttachmentSource | undefined) => AttachmentAddOn
} = {}

/** Given as an edition's module loads, before anything draws, so each hook stays one function. A second for a surface is two packages' mistake: it throws. */
export function provideAddOns(add: typeof given): void {
  const twice = Object.keys(add).filter((surface) => surface in given)
  if (twice.length) throw new Error(`The add-on ${twice} is given twice`)
  Object.assign(given, add)
}

export const useMessageAddOn = (text: string) => (given.useMessage ? given.useMessage(text) : NO_MESSAGE_ADD_ON)
export const useAttachmentAddOn: NonNullable<typeof given.useAttachment> = (media, image, source) =>
  given.useAttachment ? given.useAttachment(media, image, source) : NO_ATTACHMENT_ADD_ON
