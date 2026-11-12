"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSheetMode } from "@/components/ui/overlayMode"
import { FileChips } from "@/components/calendar/fileChips"
import { uploadFiles } from "@/components/docFiles/uploads"
import { lazyView } from "@/lib/lazy/lazyView"
import { inlineAdd } from "@/lib/ui/fieldRow"
import { busyWith } from "@/lib/ui/busyWith"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { Loader2, Plus, Upload } from "@/lib/icons"
import { EVENT_FILE_KINDS, MAX_EVENT_FILES, withFile, withoutFile, type EventFile } from "@/lib/calendar/eventFiles"

// The one entity-link search the task panel links with (components/entityLink), the same chunk.
const SearchPart = lazyView(() => import("@/components/entityLink/EntityLinkSearch"))
const warmSearch = () => void SearchPart.prefetch()
const notOffline = () => false

/**
 * An event's Linked row in the Event Form (calendar head B, gcal-1a; EVLINK
 * head B, gcal-15): "Add from OneCamp", the entity-link search the task panel
 * links with, offering the docs, boards and tasks the person may open (a
 * popover on a computer, a sheet on a phone), and "Upload", a file from the
 * device into the person's own Files (the doc tree's upload, docs F1), carried
 * as the doc it made. The links go with the form's save; up to 25, said in
 * words at the limit; both adds wait while the app is offline. Only whoever
 * may change the event has the form.
 */
export function FilesRow({ files, onChange }: { files: EventFile[]; onChange: (files: EventFile[]) => void }) {
  const sheet = useSheetMode()
  const [open, setOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  // The list as it is when an upload lands, not as it was when it started.
  const latest = React.useRef(files)
  latest.current = files
  const full = files.length >= MAX_EVENT_FILES
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, notOffline)

  const search = (
    <SearchPart.View
      fallback={
        <div className="flex items-center justify-center gap-2 py-6 text-meta text-ink-3" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Opening…
        </div>
      }
      render={(m) => (
        <m.EntityLinkSearch
          kinds={EVENT_FILE_KINDS}
          isLinked={(kind, uuid) => files.some((f) => f.kind === kind && f.uuid === uuid)}
          onPick={(kind, uuid) => {
            onChange(withFile(files, { kind, uuid }))
            setOpen(false)
          }}
        />
      )}
    />
  )
  const add = (
    <Button type="button" variant="ghost" size="sm" disabled={full || offline} className={inlineAdd} onPointerEnter={warmSearch} onFocus={warmSearch} onClick={sheet ? () => setOpen(true) : undefined}>
      <Plus className="size-3.5" aria-hidden="true" />
      Add from OneCamp
    </Button>
  )
  const upload = async (picked: File[]) => {
    setUploading(picked.length === 1 ? picked[0].name : `${picked.length} files`)
    try {
      // Its toast says how the upload went, and where the file now lives.
      const made = await uploadFiles(picked, { space: "private" }, "your Files")
      let next = latest.current
      for (const node of made) if (node.uuid) next = withFile(next, { kind: "doc", uuid: node.uuid })
      if (next !== latest.current) onChange(next)
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="grid min-w-0 gap-1.5 py-0.5" data-form-files="">
      {files.length ? <FileChips files={files} onRemove={(f) => onChange(withoutFile(files, f))} /> : null}
      <div className="flex flex-wrap items-center gap-x-3">
        {sheet ? (
          <>
            {add}
            <Drawer open={open} onOpenChange={setOpen}>
              <DrawerContent data-files-sheet="">
                <DrawerHeader className="px-5 pb-1 pt-2">
                  <DrawerTitle className="text-sm font-[510] leading-5">Add from OneCamp</DrawerTitle>
                  <DrawerDescription className="text-meta text-ink-3">A doc, a board or a task you can open.</DrawerDescription>
                </DrawerHeader>
                <div className="px-2 pb-3">{open ? search : null}</div>
              </DrawerContent>
            </Drawer>
          </>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{add}</PopoverTrigger>
            {open ? (
              <PopoverContent align="start" className="w-[20rem] p-0" aria-label="Add from OneCamp">
                {search}
              </PopoverContent>
            ) : null}
          </Popover>
        )}
        <Button type="button" variant="ghost" size="sm" {...busyWith(uploading ? "upload" : null, "upload")} disabled={full || offline} className={inlineAdd} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" aria-hidden="true" />
          {uploading ? `Uploading ${uploading}…` : "Upload"}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          aria-hidden="true"
          data-files-upload=""
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).slice(0, MAX_EVENT_FILES - latest.current.length)
            e.target.value = ""
            if (picked.length) void upload(picked)
          }}
        />
      </div>
      {offline ? (
        <p className="text-meta text-ink-3">You&apos;re offline. Link a doc, a board or a task once you&apos;re back.</p>
      ) : full ? (
        <p className="text-meta text-ink-3">An event carries up to {MAX_EVENT_FILES} files. Take one off to add another.</p>
      ) : null}
    </div>
  )
}
