"use client"

import { type Editor, Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { FileError, FileValidationOptions } from '../../utils'
import { filterFiles } from '../../utils'

type FileHandlePluginOptions = {
  key?: PluginKey
  editor: Editor
  onPaste?: (editor: Editor, files: File[], pasteContent?: string) => void
  onDrop?: (editor: Editor, files: File[], pos: number) => void
  onValidationError?: (errors: FileError[]) => void
} & FileValidationOptions

/**
 * Whether a drop or a paste is files and nothing more: files, and at most the
 * HTML a browser adds for a copied picture (an <img>, no text). A page copied
 * from Word or a slide carries its text as HTML and a picture of itself as a
 * file, and is the text the person meant.
 */
function carriesOnlyFiles(data: DataTransfer | null | undefined): boolean {
  if (!data?.files?.length) return false
  const html = data.getData('text/html')
  if (!html) return true
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text.trim() === ''
}

const FileHandlePlugin = (options: FileHandlePluginOptions) => {
  const { key, editor, onPaste, onDrop, onValidationError, allowedMimeTypes, maxFileSize } = options

  // The files a drop or paste may place; the rest are told to the person.
  const checked = (files: File[]) => {
    const [validFiles, errors] = filterFiles(files, { allowedMimeTypes, maxFileSize, allowBase64: options.allowBase64 })
    if (errors.length > 0 && onValidationError) onValidationError(errors)
    return validFiles
  }

  return new Plugin({
    key: key || new PluginKey('fileHandler'),

    props: {
      // A drop or a paste that carries files is ours: it is uploaded once,
      // and answered handled, so ProseMirror neither pastes the clipboard's
      // HTML as a second copy nor tries again through its own capture.
      // Anything else (text, a block dragged inside the doc, a page copied
      // from Word with a picture of itself beside its text) is left to
      // ProseMirror, untouched.
      handleDrop(view, event) {
        const { dataTransfer } = event
        if (!carriesOnlyFiles(dataTransfer)) return false

        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const validFiles = checked(Array.from(dataTransfer!.files))
        if (validFiles.length > 0 && onDrop) onDrop(editor, validFiles, pos?.pos ?? 0)
        return true
      },

      handlePaste(_, event) {
        const { clipboardData } = event
        if (!carriesOnlyFiles(clipboardData)) return false

        const validFiles = checked(Array.from(clipboardData!.files))
        if (validFiles.length > 0 && onPaste) onPaste(editor, validFiles, clipboardData!.getData('text/html'))
        return true
      }
    }
  })
}

export const FileHandler = Extension.create<Omit<FileHandlePluginOptions, 'key' | 'editor'>>({
  name: 'fileHandler',

  addOptions() {
    return {
      allowBase64: false,
      allowedMimeTypes: [],
      maxFileSize: 0
    }
  },

  addProseMirrorPlugins() {
    return [
      FileHandlePlugin({
        key: new PluginKey(this.name),
        editor: this.editor,
        ...this.options
      })
    ]
  }
})
