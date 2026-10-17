"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isComposingKey } from "@/lib/keys/ime"
import { webHref } from "@/lib/codec/mediaLink"
import { takePendingImage } from "./blockActions"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"

/**
 * A picture's words (small-details V25, E4): its alt text, read to someone
 * who can't see it and shown when it can't load, or the link it opens. Opened
 * from the block menu's Alt text and Link (blockActions.ts), for the picture
 * that was selected.
 */
export default function ImageTextDialog({ onClose }: { docId: string; onClose(): void }) {
  const [target] = React.useState(takePendingImage)
  React.useEffect(() => () => target?.done(), [target])
  const alt = target?.mode === "alt"
  const initial = String((alt ? target?.node.attrs.alt : target?.node.attrs.href) || "")
  const [value, setValue] = React.useState(initial)
  const [problem, setProblem] = React.useState("")
  React.useEffect(() => {
    if (!target) onClose()
  }, [target, onClose])
  if (!target) return null

  const save = (next: string | null) => {
    if (!alt && next && !webHref(next)) {
      setProblem("Give a link that starts with http:// or https://.")
      return
    }
    target.save(alt ? { alt: next } : { href: next }, alt ? "alt text" : "link")
    onClose()
  }

  return (
    <ResponsiveDialog
      title={alt ? "Alt text" : "Link the picture"}
      description={alt ? "Say what the picture shows, for someone who can't see it. It's also shown if the picture can't load." : "Clicking the picture opens this link, in a new tab."}
      onClose={onClose}
      footer={
        <>
          {!alt && initial ? (
            <Button type="button" variant="ghost" className="mr-auto" onClick={() => save(null)}>
              Remove link
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="media-text">
            Save
          </Button>
        </>
      }
    >
      <form
        id="media-text"
        onSubmit={(e) => {
          e.preventDefault()
          save(value.trim() || null)
        }}
      >
        {alt ? (
          <textarea
            aria-label="Alt text"
            value={value}
            maxLength={500}
            rows={3}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isComposingKey(e.nativeEvent)) {
                e.preventDefault()
                save(value.trim() || null)
              }
            }}
            placeholder="A team of five around a whiteboard, sketching the launch plan"
            className="w-full resize-none rounded-lg bg-raised px-3 py-2 text-ui-sm text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-brand"
          />
        ) : (
          <Input
            type="url"
            inputMode="url"
            aria-label="Link"
            aria-invalid={problem ? true : undefined}
            placeholder="https://"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setProblem("")
            }}
          />
        )}
        {problem ? (
          <p role="alert" className="mt-2 text-meta text-danger-ink">
            {problem}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
