"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { ImageIcon, Smile } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { anchorTo } from "@/components/ui/anchor"
import { useMedia } from "@/context/MediaQueryContext"
import { useSheetMode } from "@/components/ui/overlayMode"
import { toast } from "@/hooks/use-toast"
import { SlotOutlet } from "@/components/docEditor/registry/slots"
import { useEditionGate } from "@/components/docEditor/registry/gate"
import { useTitle, type TitleStore } from "@/components/docEditor/docTitleStore"
import { cn } from "@/lib/utils/helpers/cn"
import { rememberDocIcon } from "@/lib/docLook"
import { setDocLook } from "@/services/docChromeService"
import type { DocInfoInterface } from "@/types/doc"
import { DocIconPicker } from "../DocIconPicker"
import { CoverPicker, DocCover, GALLERY } from "../DocCover"
import { PathLine } from "../Breadcrumbs"
import { iconFor, titleFromLines } from "./iconSuggest"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { usePageFacts } from "./pageFacts"
import "./band.css"

/** The body's first lines, for the title it suggests (T4). */
function firstLines(editor: Editor | null): string[] {
  const doc = editor?.state.doc
  if (!doc) return []
  const out: string[] = []
  for (let i = 0; i < Math.min(doc.childCount, 3); i++) {
    const node = doc.child(i)
    if (node.isTextblock && node.type.name !== "codeBlock") out.push(node.textContent)
  }
  return out
}

/** The title the body suggests while the title is empty, following edits. */
function useSuggestedTitle(editor: Editor | null, empty: boolean): string {
  const [line, setLine] = React.useState("")
  React.useEffect(() => {
    if (!editor || !empty) {
      setLine("")
      return
    }
    const read = () => setLine(titleFromLines(firstLines(editor)))
    read()
    editor.on("update", read)
    return () => {
      editor.off("update", read)
    }
  }, [editor, empty])
  return line
}

async function save(change: Parameters<typeof setDocLook>[0], failed: string) {
  try {
    await setDocLook(change)
  } catch (e) {
    toast({ title: failed, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
  }
}

/**
 * The title band's controls (B6, D-2): "Add icon" and "Add cover" while the
 * page is pointed at (always on a touch screen), the icon's picker from the
 * icon itself, the cover's controls, the title the first line suggests ("Tab
 * to use …", T4), and on a phone the pages above the doc. Without the
 * header (a phone or a tablet), it draws the header's title chips: the lock,
 * the suggestions waiting.
 * DocTitle draws the icon and the cover with the doc and keeps this row's
 * space; this loads beside the editor.
 */
export default function TitleBand({
  docId,
  doc,
  editable,
  editor,
  store,
  titleRef,
  onTitle,
  padded,
}: {
  docId: string
  doc?: DocInfoInterface
  editable: boolean
  editor: Editor | null
  store: TitleStore
  titleRef: React.RefObject<HTMLTextAreaElement | null>
  onTitle?: (title: string) => void
  /** The title's side padding, which the band's row lines up with. */
  padded: string
}) {
  const { isMobile, isDesktop } = useMedia()
  // Its pickers: sheets on a phone held either way (components/ui/overlayMode);
  // isMobile lays out the band.
  const sheet = useSheetMode()
  const gate = useEditionGate()
  const facts = usePageFacts(docId)
  const title = useTitle(store)
  const row = React.useRef<HTMLDivElement>(null)
  const iconEl = React.useRef<HTMLElement | null>(null)
  // The icon as DocTitle draws it now: it may draw a new one while the picker is open (components/ui/anchor).
  const iconAnchor = React.useMemo(
    () => ({ current: anchorTo(() => iconEl.current, () => row.current?.closest("[data-doc-title-block]")?.querySelector("[data-doc-page-icon]") ?? null) }),
    [],
  )
  const [picker, setPicker] = React.useState<"icon" | "cover" | null>(null)
  const icon = doc?.doc_icon
  const cover = doc?.doc_cover_key
  // The open doc's icon, as it changes too, for the lists that name it without it (lib/docLook).
  React.useEffect(() => {
    if (doc) rememberDocIcon(docId, icon)
  }, [doc, docId, icon])
  // Changing the look follows the lock: a soft lock holds it too, until lifted.
  const lock = facts.lock || doc?.doc_lock_level || ""
  const held = lock === "soft" && !facts.unlockedForMe
  const canStyle = editable && !held

  // The icon DocTitle drew is the picker's way in.
  React.useEffect(() => {
    const el = row.current?.closest("[data-doc-title-block]")?.querySelector<HTMLElement>("[data-doc-page-icon]") ?? null
    iconEl.current = el
    if (!el || !canStyle) return
    const open = () => setPicker("icon")
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        open()
      }
    }
    el.setAttribute("role", "button")
    el.setAttribute("tabindex", "0")
    el.setAttribute("aria-label", "Change the icon")
    el.setAttribute("aria-haspopup", "dialog")
    el.classList.add("cursor-pointer", "rounded-xl", "hover:bg-hover", "focus-visible:outline-none", "focus-visible:ring-2", "focus-visible:ring-brand")
    el.addEventListener("click", open)
    el.addEventListener("keydown", key)
    return () => {
      el.removeEventListener("click", open)
      el.removeEventListener("keydown", key)
      for (const a of ["role", "tabindex", "aria-label", "aria-haspopup"]) el.removeAttribute(a)
      el.classList.remove("cursor-pointer", "rounded-xl", "hover:bg-hover", "focus-visible:outline-none", "focus-visible:ring-2", "focus-visible:ring-brand")
    }
  }, [icon, canStyle])

  // A soft lock holds the title as it holds the body, until lifted for this person.
  React.useEffect(() => {
    const el = titleRef.current
    if (!el || !editable) return
    el.readOnly = held
    return () => {
      el.readOnly = false
    }
  }, [titleRef, editable, held])

  // The title the first line suggests, taken with Tab (T4).
  const suggestion = useSuggestedTitle(editor, canStyle && !title.trim())
  const [titleFocused, setTitleFocused] = React.useState(false)
  React.useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const focus = () => setTitleFocused(true)
    const blur = () => setTitleFocused(false)
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || el.value.trim() || !suggestion) return
      e.preventDefault()
      onTitle?.(suggestion)
      requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length))
    }
    setTitleFocused(document.activeElement === el)
    el.addEventListener("focus", focus)
    el.addEventListener("blur", blur)
    el.addEventListener("keydown", key)
    return () => {
      el.removeEventListener("focus", focus)
      el.removeEventListener("blur", blur)
      el.removeEventListener("keydown", key)
    }
  }, [titleRef, suggestion, onTitle])

  const addIcon = () => void save({ doc_uuid: docId, icon: iconFor(title) }, "The icon wasn't added")
  const addCover = () =>
    sheet ? setPicker("cover") : void save({ doc_uuid: docId, cover: `gallery:${GALLERY[Math.floor(Math.random() * 6)].name}`, cover_offset: 50 }, "The cover wasn't added")
  const pickIcon = (next: string) => {
    setPicker(null)
    void save({ doc_uuid: docId, icon: next }, "The icon didn't change")
  }
  const removeIcon = () => {
    setPicker(null)
    void save({ doc_uuid: docId, icon: "" }, "The icon is still there")
  }

  const ctl = "doc-band-ctl h-7 gap-1.5 px-2 text-ui-sm text-ink-3 hover:text-ink [&_svg]:size-4"
  const iconPicker = <DocIconPicker value={icon} title={title} onPick={pickIcon} onRemove={removeIcon} />

  // DocView draws the header only on a computer; elsewhere its chips come here.
  const chips = isDesktop ? null : <SlotOutlet slot="titleChips" gate={gate} docId={docId} editor={editor} />

  return (
    <>
      {/* A touch group (app/phone.css F3b): under a finger, Add icon and Add
          cover stand far enough apart that each one's reach stays its own. */}
      <div ref={row} className={cn("absolute inset-x-0 bottom-0 flex h-7 items-center gap-1", padded)} data-doc-band="" data-touch-group={isMobile ? "32" : ""}>
        {isMobile ? (
          <>
            <div className="min-w-0 flex-1">
              <PathLine docId={docId} />
            </div>
            {chips}
            {canStyle && !icon ? (
              <Button variant="ghost" size="icon-sm" className="size-8 shrink-0 text-ink-3" aria-label="Add an icon" onClick={addIcon}>
                <Smile aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
            {canStyle && !cover ? (
              <Button variant="ghost" size="icon-sm" className="size-8 shrink-0 text-ink-3" aria-label="Add a cover" onClick={addCover}>
                <ImageIcon aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {canStyle && !icon ? (
              <Button variant="ghost" size="sm" className={ctl} onClick={addIcon} data-doc-add-icon="">
                <Smile aria-hidden="true" />
                Add icon
              </Button>
            ) : null}
            {canStyle && !cover ? (
              <Button variant="ghost" size="sm" className={ctl} onClick={addCover} data-doc-add-cover="">
                <ImageIcon aria-hidden="true" />
                Add cover
              </Button>
            ) : null}
            <div className="flex-1" />
            {chips}
          </>
        )}
        {suggestion && titleFocused && !isMobile ? (
          <span className="content-rise ml-2 inline-flex shrink-0 items-center gap-1.5 text-meta text-ink-3" data-doc-title-suggestion="" aria-live="polite">
            <kbd className="kbd">Tab</kbd>
            <span className="max-w-[260px] truncate">to use “{suggestion}”</span>
          </span>
        ) : null}
      </div>

      {canStyle && cover ? <DocCover docId={docId} cover={cover} offset={doc?.doc_cover_offset ?? 50} padded={padded} /> : null}

      {sheet ? (
        <Drawer open={picker !== null} onOpenChange={(o) => !o && setPicker(null)} detent="medium">
          <DrawerContent>
            <DrawerTitle className="sr-only">{picker === "cover" ? "Choose a cover" : "Choose an icon"}</DrawerTitle>
            <div className="flex justify-center p-3">{picker === "cover" ? <CoverPicker docId={docId} current={cover} onDone={() => setPicker(null)} /> : iconPicker}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Popover open={picker === "icon"} onOpenChange={(o) => !o && setPicker(null)}>
          <PopoverAnchor virtualRef={iconAnchor} />
          <PopoverContent align="start" sideOffset={8} className="w-auto rounded-xl p-0 pt-1.5">
            {iconPicker}
          </PopoverContent>
        </Popover>
      )}
    </>
  )
}
