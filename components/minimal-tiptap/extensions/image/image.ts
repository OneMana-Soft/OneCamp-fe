"use client"

import * as React from 'react'
import type { ImageOptions } from '@tiptap/extension-image'
import { Image as TiptapImage } from '@tiptap/extension-image'
import type { ReactNodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { filterFiles, randomId, type FileError, type FileValidationOptions } from '../../utils'
import { ReplaceStep } from '@tiptap/pm/transform'
import type { Attrs } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { findImageById, ImageUploads, placeholderContent, runImageUpload, startImageUploads, type ImageUploadFn } from './uploads'

// The view loads when a picture first shows (I20), its space held meanwhile.
// loadImageView loads it ahead, where a picture is about to show.
export const loadImageView = () => import('./components/image-view-block')
const View = React.lazy(() => loadImageView().then((m) => ({ default: m.ImageViewBlock })))
function LazyImage({ ref: _ref, ...props }: ReactNodeViewProps<HTMLElement>) {
  const { width: w, height: h } = props.node.attrs
  const style = w && h ? { width: w, maxWidth: '100%', aspectRatio: `${w} / ${h}` } : { minHeight: 160 }
  const e = React.createElement
  return e(React.Suspense, { fallback: e(NodeViewWrapper, { 'data-node-loading': '' }, e('div', { style })) }, e(View, props))
}

// align, crop and href, as data-* (lib/codec/media.ts).
const dataAttr = (key: string) => ({
  default: null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${key}`),
  renderHTML: (a: Record<string, unknown>) => (a[key] ? { [`data-${key}`]: a[key] } : {}),
})

export type UploadReturnType =
  | string
  | {
      id: string | number
      src: string
    }

interface CustomImageOptions extends ImageOptions, Omit<FileValidationOptions, 'allowBase64'> {
  /** Uploads a file and returns its address; given progress and an abort signal (uploads.ts). */
  uploadFn?: ImageUploadFn
  onImageRemoved?: (props: Attrs) => void
  onValidationError?: (errors: FileError[]) => void
}

interface ImageStorage {
  /** This tab's uploads, by the placeholder's id (uploads.ts). Never in the document. */
  uploads: ImageUploads
}

declare module '@tiptap/react' {
  interface Commands<ReturnType> {
    setImages: {
      setImages: (attrs: { src: string | File; alt?: string; title?: string }[]) => ReturnType
    }
    toggleImage: {
      toggleImage: () => ReturnType
    }
    imageUploads: {
      /** Puts each file in as a placeholder (no address yet) at `pos`, and uploads it. */
      insertImageFiles: (files: File[], pos?: number) => ReturnType
      /** Tries a failed upload again. */
      retryImageUpload: (id: string) => ReturnType
      /** Takes the image with this id out of the document (and drops its upload). */
      removeImageById: (id: string) => ReturnType
    }
  }
}

export const Image = TiptapImage.extend<CustomImageOptions, ImageStorage>({
  atom: true,

  addOptions() {
    return {
      ...this.parent?.(),
      allowedMimeTypes: [],
      maxFileSize: 0,
      uploadFn: undefined
    }
  },

  addStorage() {
    return { uploads: new ImageUploads() }
  },

  onDestroy() {
    // Frees the previews; an upload still running is let go.
    this.storage.uploads.destroy()
  },

  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: null
      },
      title: {
        default: null
      },
      id: {
        default: null
      },
      width: {
        default: null
      },
      height: {
        default: null
      },
      caption: {
        default: null
      },
      fileName: {
        default: null
      },
      align: dataAttr('align'),
      crop: dataAttr('crop'),
      href: dataAttr('href')
    }
  },

  addCommands() {
    return {
      setImages:
        attrs =>
        ({ commands }) => {
          const [validImages, errors] = filterFiles(attrs, {
            allowedMimeTypes: this.options.allowedMimeTypes,
            maxFileSize: this.options.maxFileSize,
            allowBase64: this.options.allowBase64
          })

          if (errors.length > 0 && this.options.onValidationError) {
            this.options.onValidationError(errors)
          }

          if (validImages.length > 0) {
            // Files go in as placeholders and upload (never as blob: addresses).
            const files = validImages.map(image => image.src).filter((f): f is File => f instanceof File)
            const placed = files.length > 0 && commands.insertImageFiles(files)
            const linked = validImages.filter(image => !(image.src instanceof File))
            if (!linked.length) return placed
            return commands.insertContent(
              linked.map(image => ({
                type: this.type.name,
                attrs: {
                  id: randomId(),
                  src: image.src,
                  alt: image.alt,
                  title: image.title,
                  fileName: null
                }
              }))
            )
          }

          return false
        },

      insertImageFiles:
        (files, pos) =>
        ({ tr, dispatch, commands, editor }) => {
          const uploadFn = this.options.uploadFn
          if (!uploadFn || !files.length) return false
          if (!dispatch) return true
          const added = files.map(file => this.storage.uploads.add(file))
          const placed = commands.insertContentAt(pos ?? tr.selection.from, added.map(placeholderContent), { updateSelection: false })
          if (!placed) {
            for (const u of added) this.storage.uploads.remove(u.id)
            return false
          }
          // The caret goes on a line after the images, so the next key types
          // there instead of replacing the image it would otherwise select.
          const last = findImageById(tr.doc, added[added.length - 1].id)
          if (last) {
            const after = last.pos + last.node.nodeSize
            try {
              if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, editor.schema.nodes.paragraph.create())
              tr.setSelection(TextSelection.create(tr.doc, after + 1))
            } catch {
              // Somewhere a paragraph can't go (rare): the selection stays put.
            }
          }
          startImageUploads(editor, added.map(u => u.id), uploadFn)
          return true
        },

      retryImageUpload:
        id =>
        () => {
          const uploadFn = this.options.uploadFn
          if (!uploadFn || !this.storage.uploads.get(id)) return false
          void runImageUpload(this.editor, id, uploadFn)
          return true
        },

      removeImageById:
        id =>
        ({ tr, dispatch }) => {
          const at = findImageById(tr.doc, id)
          this.storage.uploads.remove(id)
          if (!at) return false
          if (dispatch) tr.delete(at.pos, at.pos + at.node.nodeSize)
          return true
        },

      toggleImage:
        () =>
        ({ editor }) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = this.options.allowedMimeTypes.join(',')
          input.onchange = () => {
            const files = input.files
            if (!files) return

            const [validImages, errors] = filterFiles(Array.from(files), {
              allowedMimeTypes: this.options.allowedMimeTypes,
              maxFileSize: this.options.maxFileSize,
              allowBase64: this.options.allowBase64
            })

            if (errors.length > 0 && this.options.onValidationError) {
              this.options.onValidationError(errors)
              return false
            }

            if (validImages.length === 0) return false

            editor.commands.insertImageFiles(validImages, editor.state.selection.from)

            return false
          }

          input.click()
          return true
        }
    }
  },

  onTransaction({ transaction }) {
    transaction.steps.forEach(step => {
      if (step instanceof ReplaceStep && step.slice.size === 0) {
        const deletedPages = transaction.before.content.cut(step.from, step.to)

        deletedPages.forEach(node => {
          if (node.type.name === 'image') {
            // (A placeholder's preview is the upload's to free, uploads.ts:
            // the image may come back with an undo.)
            this.options.onImageRemoved?.(node.attrs)
          }
        })
      }
    })
  },

  addNodeView() {
    return ReactNodeViewRenderer(LazyImage, {
      className: 'block-node'
    })
  }
})
