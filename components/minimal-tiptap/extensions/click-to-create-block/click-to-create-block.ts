import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'

/**
 * A click in the empty space below a doc's content puts the caret at its end.
 *
 * - The doc ends in text (a paragraph, a heading, a quote's line): the caret
 *   goes to the end of it. Nothing is added.
 * - It ends in something the caret can't sit in (an image, a divider, a table
 *   embed, a code block, a list, a callout): one empty paragraph is added
 *   after it, and the caret goes there. A second click finds that paragraph
 *   and adds nothing.
 *
 * It used to add one empty paragraph per line down to where the click landed:
 * in a new doc the caret jumped 350 px, and every one of those lines went to
 * collaborators. Blur then deleted trailing empty paragraphs, including ones
 * someone else had just made.
 */
function placeCaretAtEnd(editor: Editor): boolean {
  const { state } = editor
  const last = state.doc.lastChild
  const textAtEnd = !!last && last.isTextblock && !last.type.spec.code
  if (textAtEnd) {
    editor.view.dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)).scrollIntoView())
  } else {
    const paragraph = state.schema.nodes.paragraph
    if (!paragraph) return false
    const end = state.doc.content.size
    const tr = state.tr.insert(end, paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView()
    editor.view.dispatch(tr)
  }
  editor.view.focus()
  return true
}

export const ClickToCreateBlock = Extension.create({
  name: 'clickToCreateBlock',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('clickToCreateBlock'),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              // A plain left click, in an editable doc.
              if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || !editor.isEditable) return false

              const target = event.target as HTMLElement
              const dom = view.dom
              // Only on the editor's own empty space (not on a block, and not
              // on a node view's controls).
              if (target !== dom && !target.classList.contains('doc-editor')) return false

              // Below the last block (with a little slack), not beside one.
              const last = dom.lastElementChild as HTMLElement | null
              const bottom = last
                ? last.getBoundingClientRect().bottom
                : dom.getBoundingClientRect().top + parseFloat(getComputedStyle(dom).paddingTop || '0')
              if (event.clientY <= bottom + 4) return false

              event.preventDefault()
              return placeCaretAtEnd(editor)
            },
          },
        },
      }),
    ]
  },
})
