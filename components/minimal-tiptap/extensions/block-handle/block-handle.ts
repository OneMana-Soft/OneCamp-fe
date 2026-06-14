"use client"

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'

export const BlockHandlePluginKey = new PluginKey('block-handle')
export const BlockFocusPluginKey = new PluginKey('block-focus')

// ── Floating handle (Notion-style) ──────────────────────────────
// A single DOM element that repositions itself next to the hovered
// or focused block. Much more reliable than per-block decorations.

function createFloatingHandle(): HTMLElement {
  const handle = document.createElement('div')
  handle.className = 'block-handle-floating'
  handle.setAttribute('contenteditable', 'false')
  handle.setAttribute('draggable', 'true') // Enable native HTML5 dragging
  handle.title = 'Drag to move'
  handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="3" r="1.5" fill="currentColor"/><circle cx="4" cy="7" r="1.5" fill="currentColor"/><circle cx="4" cy="11" r="1.5" fill="currentColor"/><circle cx="10" cy="3" r="1.5" fill="currentColor"/><circle cx="10" cy="7" r="1.5" fill="currentColor"/><circle cx="10" cy="11" r="1.5" fill="currentColor"/></svg>`
  handle.style.cssText = `
    position: fixed;
    display: none;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    cursor: grab;
    border-radius: 4px;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    z-index: 50;
    opacity: 0;
    transition: opacity 0.15s ease, background-color 0.12s ease;
    user-select: none;
    pointer-events: auto;
  `
  return handle
}

/**
 * Resolve the top-level block position for a DOM element inside the editor.
 */
function resolveBlockPos(view: any, dom: HTMLElement): number | null {
  const pos = view.posAtDOM(dom, 0)
  if (pos == null) return null
  const resolved = view.state.doc.resolve(pos)
  let depth = resolved.depth
  while (depth > 1) depth--
  if (depth < 1) return null
  return resolved.before(depth)
}

/**
 * Find the top-level block element that contains a given DOM element.
 * Walks up from the target until reaching a direct child of ProseMirror.
 */
function findBlockFromTarget(view: any, target: HTMLElement): { dom: HTMLElement; pos: number } | null {
  const pmEl = view.dom as HTMLElement

  // Walk up from the target to find a direct child of ProseMirror
  let current: HTMLElement | null = target
  while (current && current !== pmEl) {
    if (current.parentElement === pmEl) {
      // Skip non-content elements
      if (current.classList.contains('block-handle-floating')) return null
      if (current.classList.contains('collaboration-cursor__caret')) return null

      const pos = resolveBlockPos(view, current)
      if (pos != null) {
        return { dom: current, pos }
      }
      return null
    }
    current = current.parentElement
  }

  return null
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
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }

      currentHoverPos = pos
      currentHoverDom = blockDom
      const blockRect = blockDom.getBoundingClientRect()

      const handleLeft = blockRect.left - 26
      const handleTop = blockRect.top + (Math.min(blockRect.height, 32) / 2) - 12

      handle.style.display = 'flex'
      handle.style.left = `${handleLeft}px`
      handle.style.top = `${handleTop}px`
      handle.style.opacity = '0.4'
    }

    const hideHandle = (immediate?: boolean) => {
      if (!handle || isDragging) return
      if (immediate) {
        handle.style.opacity = '0'
        handle.style.display = 'none'
        currentHoverPos = null
        currentHoverDom = null
        return
      }
      if (hideTimeout) clearTimeout(hideTimeout)
      hideTimeout = setTimeout(() => {
        if (handle) {
          handle.style.opacity = '0'
          setTimeout(() => {
            if (handle && handle.style.opacity === '0') {
              handle.style.display = 'none'
              currentHoverPos = null
              currentHoverDom = null
            }
          }, 150)
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
          handle = createFloatingHandle()
          document.body.appendChild(handle)

          const onScroll = () => {
             hideHandle(true)
             updateFocusHandle(editorView)
          }
          window.addEventListener('scroll', onScroll, true)

          handle.addEventListener('mouseenter', () => {
            if (handle && !isDragging) {
              if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null }
              handle.style.opacity = '1'
              handle.style.backgroundColor = 'hsl(var(--accent))'
            }
          })
          
          handle.addEventListener('mouseleave', () => {
            if (handle && !isDragging) {
              handle.style.backgroundColor = 'transparent'
              handle.style.opacity = '0.4'
            }
          })

          handle.addEventListener('dragstart', (e: DragEvent) => {
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
            handle!.style.opacity = '0'
            
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
            if (handle) {
              handle.style.opacity = '0'
              handle.style.display = 'none'
            }
            updateFocusHandle(editorView)
          }

          handle.addEventListener('dragend', cleanupDrag)
          window.addEventListener('dragend', cleanupDrag)

          initTimeout = setTimeout(() => updateFocusHandle(editorView), 100)

          return {
            update(view) {
              if (isDragging) return
              updateFocusHandle(view)
            },
            destroy() {
              if (initTimeout) clearTimeout(initTimeout)
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
