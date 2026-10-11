"use client"

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'

const BlockHandlePluginKey = new PluginKey('block-handle')
const BlockFocusPluginKey = new PluginKey('block-focus')

// ── Floating handle (Notion-style) ──────────────────────────────
// A single DOM element that repositions itself next to the hovered
// or focused block. Much more reliable than per-block decorations.

// Two 24 px controls (content.md D10): "+" opens the block menu on a new
// line below, "⋮⋮" drags the block. They sit in the gutter, glide from block
// to block (a transform, so nothing lays out) and show only where there is a
// pointer that hovers: a phone has the "/" key and its accessory bar instead.
// The look is in minimal-tiptap/styles/index.css (.block-handle-floating).
const PLUS_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
const GRIP_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="4.5" cy="3" r="1.25" fill="currentColor"/><circle cx="4.5" cy="7" r="1.25" fill="currentColor"/><circle cx="4.5" cy="11" r="1.25" fill="currentColor"/><circle cx="9.5" cy="3" r="1.25" fill="currentColor"/><circle cx="9.5" cy="7" r="1.25" fill="currentColor"/><circle cx="9.5" cy="11" r="1.25" fill="currentColor"/></svg>`

function createFloatingHandle(): { root: HTMLElement; plus: HTMLButtonElement; grip: HTMLElement } {
  const root = document.createElement('div')
  root.className = 'block-handle-floating'
  root.setAttribute('contenteditable', 'false')
  root.dataset.visible = 'false'
  const plus = document.createElement('button')
  plus.type = 'button'
  plus.className = 'block-handle-btn'
  plus.setAttribute('aria-label', 'Add a block below')
  plus.title = 'Add a block below'
  plus.innerHTML = PLUS_SVG
  const grip = document.createElement('div')
  grip.className = 'block-handle-btn block-handle-grip'
  grip.setAttribute('draggable', 'true') // Enable native HTML5 dragging
  grip.setAttribute('aria-label', 'Drag to move')
  grip.title = 'Drag to move'
  grip.innerHTML = GRIP_SVG
  root.append(plus, grip)
  return { root, plus, grip }
}

// ── Extension ──────────────────────────────────────────────────

export const BlockHandle = Extension.create({
  name: 'blockHandle',

  addProseMirrorPlugins() {
    const editor = this.editor
    let handle: HTMLElement | null = null
    let currentHoverPos: number | null = null
    let currentHoverDom: HTMLElement | null = null
    let hideTimeout: ReturnType<typeof setTimeout> | null = null
    let initTimeout: ReturnType<typeof setTimeout> | null = null
    
    let isDragging = false
    let globalDragState: { pos: number; node: any } | null = null

    const showHandle = (blockDom: HTMLElement, pos: number, immediate = false) => {
      if (!handle || !editor.isEditable || isDragging) return
      // An editor out of sight (a side view set aside by Focus, a hidden tab)
      // has no box: the handle, fixed to the window, would stay behind alone.
      if (blockDom.getClientRects().length === 0) { hideHandle(true); return }
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }

      currentHoverPos = pos
      currentHoverDom = blockDom
      const blockRect = blockDom.getBoundingClientRect()

      // Two 24 px buttons and a 2 px gap, 6 px left of the text, centred on
      // the block's first line (26 px).
      const handleLeft = blockRect.left - 56
      const handleTop = blockRect.top + (Math.min(blockRect.height, 26) / 2) - 12

      // Gliding from one block to the next; appearing in place.
      handle.dataset.glide = handle.dataset.visible === 'true' ? 'true' : 'false'
      handle.style.transform = `translate3d(${Math.round(handleLeft)}px, ${Math.round(handleTop)}px, 0)`
      handle.dataset.visible = 'true'
    }

    const hideHandle = (immediate?: boolean) => {
      if (!handle || isDragging) return
      if (immediate) {
        handle.dataset.visible = 'false'
        currentHoverPos = null
        currentHoverDom = null
        return
      }
      if (hideTimeout) clearTimeout(hideTimeout)
      hideTimeout = setTimeout(() => {
        if (handle) {
          handle.dataset.visible = 'false'
          currentHoverPos = null
          currentHoverDom = null
        }
      }, 200)
    }

    const updateFocusHandle = (view: any) => {
      if (isDragging) return
      if (!view || view.isDestroyed || view.destroyed || !view.docView) return
      const focusedPos = BlockFocusPluginKey.getState(view.state) as number | null
      if (focusedPos != null) {
        const dom = view.nodeDOM(focusedPos) as HTMLElement | null
        if (dom && dom.isConnected) {
          showHandle(dom, focusedPos)
        }
      } else {
        hideHandle()
      }
    }

    return [
      new Plugin({
        key: BlockFocusPluginKey,
        state: {
          init() { return null as number | null },
          apply(tr, prevFocusedPos) {
            if (!tr.selectionSet && !tr.docChanged) return prevFocusedPos
            const { $from } = tr.selection
            let depth = $from.depth
            while (depth > 1) depth--
            return depth >= 1 ? $from.before(depth) : null
          },
        },
      }),

      new Plugin({
        key: BlockHandlePluginKey,
        props: {
          handleDrop(view, event, slice, moved) {
            if (isDragging && globalDragState) {
              const { pos: sourcePos, node: sourceNode } = globalDragState
              const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!dropPos) return false

              const $pos = view.state.doc.resolve(dropPos.pos)
              let insertPos = dropPos.pos
              
              if ($pos.depth > 0) {
                const blockBefore = $pos.before(1)
                const blockAfter = $pos.after(1)
                insertPos = (dropPos.pos - blockBefore < blockAfter - dropPos.pos) ? blockBefore : blockAfter
              }

              const targetEnd = sourcePos + sourceNode.nodeSize
              
              // Prevent dropping on itself
              if (insertPos >= sourcePos && insertPos <= targetEnd) {
                return true 
              }

              const tr = view.state.tr
              let finalInsertPos = insertPos

              if (finalInsertPos > sourcePos) {
                finalInsertPos -= sourceNode.nodeSize
              }

              tr.delete(sourcePos, targetEnd)
              tr.insert(finalInsertPos, sourceNode)
              
              try {
                const { TextSelection } = require('@tiptap/pm/state')
                const selectionPos = tr.doc.resolve(finalInsertPos + 1)
                tr.setSelection(TextSelection.near(selectionPos))
              } catch (e) {
                // Fallback silently if selection fails
              }

              view.dispatch(tr)
              view.focus()
              
              // Reset drag state aggressively
              isDragging = false
              globalDragState = null
              updateFocusHandle(view)
              
              return true // Prevent default ProseMirror drop
            }
            return false
          }
        },
        view(editorView) {
          const parts = createFloatingHandle()
          handle = parts.root
          const grip = parts.grip
          document.body.appendChild(handle)

          // "+": a new empty line under the block, with the block menu open on it.
          parts.plus.addEventListener('mousedown', (e) => e.preventDefault())
          parts.plus.addEventListener('click', () => {
            const pos = BlockFocusPluginKey.getState(editorView.state) as number | null
            if (pos == null) return
            const node = editorView.state.doc.nodeAt(pos)
            if (!node) return
            const after = pos + node.nodeSize
            editor.chain().focus().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).insertContent('/').run()
          })

          const onScroll = () => {
             hideHandle(true)
             updateFocusHandle(editorView)
          }
          window.addEventListener('scroll', onScroll, true)

          handle.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
          })

          grip.addEventListener('dragstart', (e: DragEvent) => {
            const activePos = BlockFocusPluginKey.getState(editorView.state) as number | null
            if (activePos == null) {
              e.preventDefault()
              return
            }
            
            const sourceNode = editorView.state.doc.nodeAt(activePos)
            if (!sourceNode) {
              e.preventDefault()
              return
            }

            isDragging = true
            globalDragState = { pos: activePos, node: sourceNode }
            handle!.dataset.visible = 'false'
            
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', sourceNode.textContent || '')
              e.dataTransfer.setData('application/x-prosemirror-drag-block', 'true')
              
              const dom = editorView.nodeDOM(activePos) as HTMLElement
              if (dom) {
                e.dataTransfer.setDragImage(dom, 0, 0)
              }
            }

            // Tell ProseMirror we are dragging a slice from the document!
            const selection = NodeSelection.create(editorView.state.doc, activePos)
            const slice = selection.content()
            editorView.dragging = { slice, move: true }
          })

          const cleanupDrag = () => {
            isDragging = false
            globalDragState = null
            if (handle) handle.dataset.visible = 'false'
            updateFocusHandle(editorView)
          }

          grip.addEventListener('dragend', cleanupDrag)
          window.addEventListener('dragend', cleanupDrag)

          initTimeout = setTimeout(() => updateFocusHandle(editorView), 100)

          // Hiding or resizing the editor moves no selection and scrolls
          // nothing, so follow its box: the handle goes when it does, comes
          // back when it does, and keeps to its block when the width changes.
          const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => updateFocusHandle(editorView))
          resize?.observe(editorView.dom)

          return {
            update(view) {
              if (isDragging) return
              updateFocusHandle(view)
            },
            destroy() {
              if (initTimeout) clearTimeout(initTimeout)
              resize?.disconnect()
              window.removeEventListener('scroll', onScroll, true)
              window.removeEventListener('dragend', cleanupDrag)
              handle?.remove()
              handle = null
            },
          }
        },
      }),
    ]
  },
})
