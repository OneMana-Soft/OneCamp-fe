import type { ComponentType, ReactNode } from "react"
import type { AttachmentMediaReq } from "@/types/attachment"

/**
 * Add-ons: what an edition adds to a surface both editions share, without
 * the surface naming it. An edition gives its own as the app loads, a line
 * each (lib/addOns/messages.ts, attachments.ts); with none, a surface shows
 * nothing there.
 */

/** Something an add-on offers: a menu item, a sheet row or a bar button. */
export interface AddOnAction {
  /** The same while its label changes (Translate, Translating…), so its control keeps its place and focus. */
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** At work: the control says so and takes no second press. */
  busy?: boolean
  run: () => void
}

/** Where an attachment was posted: a channel, a DM or a group, by its id. */
export interface AttachmentSource {
  srcKey: string
  srcRef: string
}

interface AddOns {
  /** A message's: what it offers, and what shows under it. */
  useMessage(text: string): { actions: AddOnAction[]; below: ReactNode }
  /** A file's in the viewer: what it offers, and what it found. */
  useAttachment(media: AttachmentMediaReq | undefined, image: boolean, source: AttachmentSource | undefined): { actions: AddOnAction[]; note: { title: string; text: string } | null }
}

/** What a message has with no add-on, or one that offers nothing now. */
export const NO_MESSAGE_ADD_ON: ReturnType<AddOns["useMessage"]> = { actions: [], below: null }
/** What a file in the viewer has with no add-on, or one that offers nothing now. */
export const NO_ATTACHMENT_ADD_ON: ReturnType<AddOns["useAttachment"]> = { actions: [], note: null }

const given: Partial<AddOns> = {}

/**
 * An edition's add-ons, given as its module loads: before anything draws, so
 * each hook stays one function. A surface takes one add-on: a second is a
 * mistake two packages made, and fails at once rather than replacing the first.
 */
export function provideAddOns(add: Partial<AddOns>): void {
  for (const surface of Object.keys(add) as (keyof AddOns)[]) {
    if (given[surface]) throw new Error(`The add-on ${surface} is given twice`)
  }
  Object.assign(given, add)
}

export const useMessageAddOn: AddOns["useMessage"] = (text) => (given.useMessage ? given.useMessage(text) : NO_MESSAGE_ADD_ON)
export const useAttachmentAddOn: AddOns["useAttachment"] = (media, image, source) =>
  given.useAttachment ? given.useAttachment(media, image, source) : NO_ATTACHMENT_ADD_ON
