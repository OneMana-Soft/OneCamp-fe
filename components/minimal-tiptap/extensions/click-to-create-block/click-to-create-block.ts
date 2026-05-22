import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Notion-like click-to-create-block behavior for the doc editor.
 *
 * Features:
 *  - Click empty space below content → inserts paragraph blocks down
 *    to the click Y position and places the cursor there.
 *  - On blur, trailing empty paragraphs created by click-to-create
 *    are pruned (keeps at most one empty trailing paragraph, like Notion).
 */
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
              // Only handle left-clicks
              if (event.button !== 0) return false

              const target = event.target as HTMLElement
              const proseMirrorEl = view.dom

              // Handle clicks on ProseMirror itself or its immediate scrollable parents
              // that are intended to be "empty space".
              const isEditorArea = target === proseMirrorEl || 
                                 target.classList.contains('doc-editor') ||
                                 target.closest('.minimal-tiptap-editor') === target

              if (!isEditorArea || !editor.isEditable) return false

              // If clicking on an actual content node inside the editor, let ProseMirror handle it
              if (target !== proseMirrorEl && proseMirrorEl.contains(target)) {
                 // Check if it's a block node
                 const rect = target.getBoundingClientRect()
                 if (event.clientY <= rect.bottom) return false
              }

              const clickY = event.clientY

              // Find the bottom of the last visible content node
              const lastChild = proseMirrorEl.lastElementChild as HTMLElement | null
              let bottomOfContent: number

              if (lastChild) {
                const lastChildRect = lastChild.getBoundingClientRect()
                bottomOfContent = lastChildRect.bottom
                // If click is within existing content bounds, let ProseMirror handle
                if (clickY <= bottomOfContent + 4) return false
              } else {
                const pmRect = proseMirrorEl.getBoundingClientRect()
                bottomOfContent = pmRect.top + parseFloat(getComputedStyle(proseMirrorEl).paddingTop)
              }

              // Prevent ProseMirror's default mousedown handling
              event.preventDefault()

              // Calculate paragraphs needed to reach click position
              const lineHeight = getLineHeight(proseMirrorEl)
              const gap = clickY - bottomOfContent
              const targetIndex = Math.max(0, Math.floor(gap / lineHeight))
              const paragraphsToAdd = targetIndex + 1

              // Use requestAnimationFrame to avoid ProseMirror state conflicts
              requestAnimationFrame(() => {
                if (editor.isDestroyed) return
                
                const endPos = editor.state.doc.content.size
                
                // Build N empty paragraph nodes
                const nodes = Array.from({ length: paragraphsToAdd }, () => ({
                  type: 'paragraph',
                }))

                // Insert them at the end of the document
                editor.chain().focus().insertContentAt(endPos, nodes).run()

                // Calculate exact cursor position in the newly created block
                // Each empty paragraph is 2 units (start + end)
                const newPos = endPos + 1 + (targetIndex * 2)
                
                if (newPos <= editor.state.doc.content.size) {
                  editor.chain().setTextSelection(newPos).run()
                }
              })

              return true
            },
          },
        },
      }),
    ]
  },

  /**
   * On blur, remove trailing empty paragraphs that were created by
   * clicking in empty space but never typed into — keeps the document
   * clean, exactly like Notion does.
   */
  onBlur() {
    const { state, commands } = this.editor
    const { doc } = state
    const nodeCount = doc.childCount

    if (nodeCount <= 1) return

    // Walk backwards from the end, collecting contiguous empty paragraphs
    let removeFrom = nodeCount
    for (let i = nodeCount - 1; i >= 1; i--) {
      const node = doc.child(i)
      if (node.type.name === 'paragraph' && node.nodeSize === 2) {
        removeFrom = i
      } else {
        break
      }
    }

    const startRemove = removeFrom + 1
    if (startRemove >= nodeCount) return

    // Calculate ProseMirror positions for the range to delete
    let from = 0
    for (let i = 0; i < startRemove; i++) {
      from += doc.child(i).nodeSize
    }
    const to = doc.content.size

    if (from < to) {
      commands.deleteRange({ from, to })
    }
  },
})

function getLineHeight(proseMirrorEl: HTMLElement): number {
  const p = proseMirrorEl.querySelector('p')
  const computed = p ? getComputedStyle(p) : getComputedStyle(proseMirrorEl)
  const lh = parseFloat(computed.lineHeight)
  
  if (!isNaN(lh) && lh > 0) return lh
  
  // Fallback to font size * 1.5
  const fs = parseFloat(computed.fontSize) || 16
  return fs * 1.5
}
