"use client"

import type * as React from "react"
import { ReactRenderer, type Editor } from "@tiptap/react"
import type { EditorState } from "@tiptap/pm/state"
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import tippy, { type Instance as TippyInstance, type Props as TippyProps } from "tippy.js"

/**
 * THE POPUP EVERY SUGGESTION MENU USES: "/", "@", "#", "+" and ":".
 *
 * - Escape closes the menu, and the menu stays closed while its text is being
 *   typed: the keys are the text's again. Escape used to hide the popup while
 *   the menu kept taking keys, so Escape then Enter inserted the item nobody
 *   could see.
 * - Which editors have a menu showing (suggestionMenuOpen): Enter, Tab and
 *   Escape belong to the menu then, and the editor's own keys stand aside.
 * - The list is announced (ARIA): the editable element points at the list it
 *   controls and at the highlighted option (aria-controls,
 *   aria-activedescendant, aria-autocomplete="list"), since focus stays in
 *   the text while the menu is up. The list sets them (CommandList's
 *   comboboxFor); they go when the menu closes.
 */

const DOM_RECT_FALLBACK: DOMRect = {
  bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
  toJSON() {
    return {}
  },
}

const openMenus = new WeakMap<Editor, number>()

/** Whether a suggestion menu is showing in this editor. */
export function suggestionMenuOpen(editor: Editor | null | undefined): boolean {
  return !!editor && (openMenus.get(editor) ?? 0) > 0
}

/** The ARIA a showing menu puts on the editable element, removed when it closes. */
export const COMBOBOX_ATTRIBUTES = ["aria-controls", "aria-activedescendant", "aria-autocomplete"] as const

export function clearComboboxAttributes(el: Element | null | undefined) {
  if (!el) return
  for (const name of COMBOBOX_ATTRIBUTES) el.removeAttribute(name)
}

/**
 * Whether the position is in code: a code block, or text marked as code.
 * Typing "/", ":", "@", "#" or "+" there is code, not a request for a menu.
 */
export function inCode(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos)
  if ($pos.parent.type.spec.code) return true
  const isCode = (marks: readonly { type: { spec: { code?: boolean } } }[] | undefined) => !!marks?.some((m) => m.type.spec.code)
  // The trigger character itself, and what it was typed into.
  return isCode(state.doc.nodeAt(pos)?.marks) || isCode($pos.marks())
}

/**
 * The allow check for a chip menu ("@", "#", "+"): the chip can go where the
 * trigger was typed (Tiptap's own check, which an allow of our own replaces),
 * and the trigger wasn't typed in code.
 */
export function chipAllowed(nodeName: string) {
  return ({ state, range }: { state: EditorState; range: { from: number } }) => {
    const type = state.schema.nodes[nodeName]
    if (!type) return false
    const $from = state.doc.resolve(range.from)
    return !!$from.parent.type.contentMatch.matchType(type) && !inCode(state, range.from)
  }
}

/** What a list rendered in the popup is handed, beyond the suggestion's own props. */
export interface SuggestionListExtras {
  /** The editable element the list announces itself to; null once the menu is closed. */
  comboboxFor: HTMLElement | null
}

export type SuggestionListRef = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }

interface SuggestionPopupOptions<P> {
  /** The list (a forwardRef component exposing onKeyDown). */
  component: React.ComponentType<P>
  /** Extra props for the list, from the suggestion's. */
  extraProps?: (props: SuggestionProps) => Record<string, unknown>
  /** Tippy options beyond the shared ones (placement, offset). */
  tippy?: Partial<TippyProps>
  /** Told when the menu shows and when it goes (closed, dismissed or done). */
  onOpenChange?: (open: boolean) => void
  /**
   * Whether the menu has nothing to show for these props (":" before a second
   * letter): it stays hidden, and its keys are the text's.
   */
  isEmpty?: (props: SuggestionProps) => boolean
}

/** A suggestion's render(): the popup, its keys and its announcements. */
export function suggestionPopup<P>({ component, extraProps, tippy: tippyOptions, onOpenChange, isEmpty }: SuggestionPopupOptions<P>) {
  return () => {
    let renderer: ReactRenderer<SuggestionListRef> | undefined
    let popup: TippyInstance | undefined
    let editor: Editor | undefined
    let open = false
    let dismissed = false

    // Shown while it has something to show and hasn't been closed with Escape.
    const show = (props: SuggestionProps) => {
      const visible = !dismissed && !isEmpty?.(props)
      if (visible) popup?.show()
      else popup?.hide()
      setOpen(visible)
    }

    const setOpen = (next: boolean) => {
      if (open === next || !editor) return
      open = next
      openMenus.set(editor, Math.max(0, (openMenus.get(editor) ?? 0) + (next ? 1 : -1)))
      if (!next) clearComboboxAttributes(editor.view.dom)
      onOpenChange?.(next)
    }

    const listProps = (props: SuggestionProps) => ({
      ...props,
      ...(extraProps?.(props) ?? {}),
      comboboxFor: dismissed ? null : (props.editor.view.dom as HTMLElement),
    })

    return {
      onStart: (props: SuggestionProps) => {
        editor = props.editor
        dismissed = false
        renderer = new ReactRenderer(component as React.ComponentType<unknown>, { props: listProps(props), editor: props.editor }) as ReactRenderer<SuggestionListRef>
        popup = tippy("body", {
          getReferenceClientRect: () => props.clientRect?.() ?? DOM_RECT_FALLBACK,
          appendTo: () => document.body,
          content: renderer.element,
          showOnCreate: !isEmpty?.(props),
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          offset: [0, 6],
          // The list is the floating surface; tippy's own box draws nothing.
          theme: "none",
          arrow: false,
          maxWidth: "none",
          popperOptions: { modifiers: [{ name: "flip", options: { fallbackPlacements: ["top-start"] } }] },
          ...tippyOptions,
        })[0]
        setOpen(!isEmpty?.(props))
      },

      onUpdate: (props: SuggestionProps) => {
        renderer?.updateProps(listProps(props))
        popup?.setProps({ getReferenceClientRect: () => props.clientRect?.() ?? DOM_RECT_FALLBACK })
        show(props)
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        // Closed with Escape, or nothing to show: every key is the text's,
        // Enter and Tab included.
        if (dismissed || !open || !popup?.state.isVisible) return false
        if (props.event.key === "Escape") {
          dismissed = true
          popup.hide()
          setOpen(false)
          renderer?.updateProps({ comboboxFor: null })
          return true
        }
        return renderer?.ref?.onKeyDown(props) ?? false
      },

      onExit: () => {
        setOpen(false)
        popup?.destroy()
        renderer?.destroy()
        popup = undefined
        renderer = undefined
      },
    }
  }
}
