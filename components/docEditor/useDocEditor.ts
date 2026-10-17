"use client"

import { useMinimalTiptapEditor, type UseMinimalTiptapEditorProps } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"

/** The doc's reading type (16/26 in its measure, its headings and blocks), on its EditorContent. */
export const DOC_EDITOR_CLASS = "minimal-tiptap-editor doc-editor"

interface UseDocEditorProps
  extends Omit<UseMinimalTiptapEditorProps, "kind" | "slashCommands" | "shouldRerenderOnTransaction" | "editorAttributes"> {
  /**
   * The id of the element that names the doc (its title heading), for the
   * editable area's accessible name; "Doc" when there is none.
   */
  labelledBy?: string
  /** The guest's shared page: the doc's schema, read-only, no AI. */
  guest?: boolean
}

/** The editable area's role, name and keyboard hints. Pure. */
function docEditorAttributes({ labelledBy, editable }: { labelledBy?: string; editable: boolean }): Record<string, string> {
  return {
    role: "textbox",
    "aria-multiline": "true",
    ...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": "Doc" }),
    ...(editable ? {} : { "aria-readonly": "true" }),
    // A doc is prose: the phone's keyboard capitalises sentences and
    // corrects words, on purpose (the shared editor leaves them to the
    // browser).
    autocapitalize: "sentences",
    autocorrect: "on",
  }
}

/**
 * The doc's editor, for every surface that shows a doc: the doc page
 * (editable, or read-only for a reader), the guest's shared page, and any
 * preview of a doc's text. Its blocks come from the block registry for the
 * doc's kind (the guest's schema is the doc's, I4): y-prosemirror deletes from
 * the shared document whatever its editor's schema can't hold, so an editor
 * built from a shorter list doesn't just draw less (the guest viewer once
 * dropped every callout, toggle, to-do list and table embed it was shown).
 * docEditors.test.ts holds every doc surface to this hook.
 *
 * Its frame never renders again per keystroke: what it shows from the editor
 * (the selection bar, the counts) each follows the editor itself. It is null
 * until the doc's own blocks have loaded (one chunk, fetched once).
 */
export function useDocEditor({ labelledBy, guest = false, ...props }: UseDocEditorProps) {
  const editable = props.editable !== false
  return useMinimalTiptapEditor({
    showOnlyCurrentPlaceholder: true,
    ...props,
    kind: guest ? "guest" : "doc",
    editorAttributes: docEditorAttributes({ labelledBy, editable }),
    shouldRerenderOnTransaction: false,
  })
}
