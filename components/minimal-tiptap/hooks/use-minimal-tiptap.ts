import * as React from 'react'
import type { Editor } from '@tiptap/react'
import type { Content, UseEditorOptions } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { useEditor, mergeAttributes, Extension } from '@tiptap/react'
import { DOMOutputSpec } from '@tiptap/pm/model'
import { Typography } from '@tiptap/extension-typography'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Underline } from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import {
  Link,
  Image,
  HorizontalRule,
  CodeBlockLowlight,
  Selection,
  Color,
  UnsetAllMarks,
  ResetMarksOnEnter,
  FileHandler,
  mentionSuggestionOptions
} from '../extensions'
import { cn } from '@/lib/utils/helpers/cn'
import { getOutput, randomId } from '../utils'
import { useThrottle } from '../hooks/use-throttle'
import { Toast, useToast } from "@/hooks/use-toast";
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Mention } from "@tiptap/extension-mention";
import axiosInstance from "@/lib/axiosInstance";
import { PostFileUploadURL, GetEndpointUrl } from "@/services/endPoints";
import { UploadFileInterfaceRes } from "@/types/file";

import { ReactNodeViewRenderer } from '@tiptap/react'
import MentionNodeView from '../extensions/mention-list/MentionNodeView'

export interface UseMinimalTiptapEditorProps extends UseEditorOptions {
  value?: Content
  output?: 'html' | 'json' | 'text'
  placeholder?: string
  editorClassName?: string
  throttleDelay?: number
  onUpdate?: (content: Content) => void
  onBlur?: (content: Content) => void
  collaboration?: {
    enabled: boolean
    documentId: string
    token: string
    username: string
    color?: string
    onAuthenticationFailed?: () => void
    onStatus?: (status: string) => void
  }
  provider?: HocuspocusProvider
  uploadFn?: (file: File) => Promise<{ id: string, src: string }>
  onActionFiles?: (files: File[], pos?: number) => void
  allowedMimeTypes?: string[]
  onSubmit?: () => boolean
}

const createExtensions = (
    placeholder: string, 
    toast: (options: Toast) => void, 
    collaboration?: UseMinimalTiptapEditorProps['collaboration'], 
    provider?: HocuspocusProvider, 
    customUploadFnRef?: React.RefObject<((file: File) => Promise<{ id: string, src: string }>) | undefined>,
    onActionFilesRef?: React.RefObject<((files: File[], pos?: number) => void) | undefined>,
    allowedMimeTypes: string[] = ['image/*'],
    onSubmitRef?: React.RefObject<(() => boolean) | undefined>
) => {
  const extensions = [
    StarterKit.configure({
      horizontalRule: false,
      codeBlock: false,
      paragraph: { HTMLAttributes: { class: 'text-node' } },
      heading: { HTMLAttributes: { class: 'heading-node' } },
      blockquote: { HTMLAttributes: { class: 'block-node' } },
      bulletList: { HTMLAttributes: { class: 'list-node' } },
      orderedList: { HTMLAttributes: { class: 'list-node' } },
      code: { HTMLAttributes: { class: 'inline', spellcheck: 'false' } },
      dropcursor: { width: 2, class: 'ProseMirror-dropcursor border' },
      history: false // Disable history in favor of Y.js history
    }),
    Link,
    Mention.extend({
      addNodeView() {
        return ReactNodeViewRenderer(MentionNodeView)
      },
    }).configure({
      suggestion: mentionSuggestionOptions,
      HTMLAttributes: {
        class: 'mention',
      },
      renderHTML: (prop): DOMOutputSpec => {
        return['span', mergeAttributes({ class: 'mention hover:cursor-pointer' , 'data-id': prop.node.attrs.id, 'data-label': prop.node.attrs.label, 'data-type': "mention"}), `@${prop.node.attrs.label}`]
      },
    }),
    Underline,
    Image.configure({
      allowedMimeTypes: ['image/*'],
      maxFileSize: 5 * 1024 * 1024,
      allowBase64: true,
      uploadFn: async file => {
        if (customUploadFnRef?.current) {
          return await customUploadFnRef.current(file)
        }

        const formData = new FormData()
        formData.append('file', file)
        formData.append('jsonData', JSON.stringify({ src_key: 'public' }))

        try {
          const res = await axiosInstance.post<UploadFileInterfaceRes>(PostFileUploadURL.UploadFile, formData)
          const objUuid = res.data.object_uuid
          const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || ''
          const src = `${baseUrl}${GetEndpointUrl.PublicAttachmentURL}/${objUuid}`
          return { id: objUuid, src }
        } catch (error) {
          console.error('Default image upload failed', error)
          const { fileToBase64 } = await import('../utils')
          const src = await fileToBase64(file)
          return { id: randomId(), src }
        }
      },
      onToggle(editor, files, pos) {
        editor.commands.insertContentAt(
          pos,
          files.map(image => {
            const blobUrl = URL.createObjectURL(image)
            const id = randomId()

            return {
              type: 'image',
              attrs: {
                id,
                src: blobUrl,
                alt: image.name,
                title: image.name,
                fileName: image.name
              }
            }
          }), { updateSelection: false }
        )
      },
      onImageRemoved({ id, src }) {
        // Image was removed from the editor computationally or via user action
      },
      onValidationError(errors) {
        errors.forEach(error => {
          toast({
            title: 'Image validation error',
            description: error.reason,
            variant: 'destructive'
          });

        })
      },
      onActionSuccess({ action }) {
        const mapping = {
          copyImage: 'Copy Image',
          copyLink: 'Copy Link',
          download: 'Download'
        }

        toast({
          title: mapping[action],
          description: 'Image action success',
        });

      },
      onActionError(error, { action }) {
        const mapping = {
          copyImage: 'Copy Image',
          copyLink: 'Copy Link',
          download: 'Download'
        }
        toast({
          title: `Failed to ${mapping[action]}`,
          description: error.message,
          variant: 'destructive'
        });
      }
    }),
    FileHandler.configure({
      allowBase64: true,
      allowedMimeTypes: allowedMimeTypes,
      maxFileSize: 50 * 1024 * 1024, // Relaxing file size limit for generic attachments
      onDrop: (editor, files, pos) => {
        if (onActionFilesRef?.current) {
          onActionFilesRef.current(files, pos);
          return;
        }
        files.forEach(file => {
          if (!file.type.startsWith('image/')) return;
          const blobUrl = URL.createObjectURL(file)
          editor.commands.insertContentAt(pos, {
            type: 'image',
            attrs: { src: blobUrl, fileName: file.name, id: randomId(), title: file.name, alt: file.name }
          })
        })
      },
      onPaste: (editor, files) => {
        if (onActionFilesRef?.current) {
          onActionFilesRef.current(files);
          return;
        }
        files.forEach(file => {
          if (!file.type.startsWith('image/')) return;
          const blobUrl = URL.createObjectURL(file)
          editor.commands.insertContent({
            type: 'image',
            attrs: { src: blobUrl, fileName: file.name, id: randomId(), title: file.name, alt: file.name }
          })
        })
      },
      onValidationError: errors => {
        errors.forEach(error => {

          toast({
            title: 'Image validation error',
            description: error.reason,
            variant: 'destructive'
          });
        })
      }
    }),
    Color,
    TextStyle,
    Selection,
    Typography,
    UnsetAllMarks,
    HorizontalRule,
    ResetMarksOnEnter,
    CodeBlockLowlight,
    Placeholder.configure({ placeholder: () => placeholder }),
    Extension.create({
      name: 'submitShortcut',
      addKeyboardShortcuts() {
        return {
          'Enter': () => {
            if (onSubmitRef?.current) {
              return onSubmitRef.current();
            }
            return false;
          },
          'Shift-Enter': () => {
             if (this.editor.isActive('codeBlock')) {
                 return this.editor.commands.newlineInCode()
             }
             return this.editor.commands.setHardBreak()
          }
        };
      }
    })
  ]

  if (collaboration && collaboration.enabled && provider) {
    extensions.push(
      Collaboration.configure({
        document: provider.document,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: collaboration.username,
          color: collaboration.color || '#f783ac',
        },
      })
    )
  }

  return extensions
}

export const useMinimalTiptapEditor = ({
  value,
  output = 'html',
  placeholder = '',
  editorClassName,
  throttleDelay = 0,
  onUpdate,
  onBlur,
  collaboration,
  provider: externalProvider,
  uploadFn,
  onActionFiles,
  allowedMimeTypes,
  onSubmit,
  ...props
}: UseMinimalTiptapEditorProps) => {
  const onUpdateRef = React.useRef(onUpdate)
  const onBlurRef = React.useRef(onBlur)
  const uploadFnRef = React.useRef(uploadFn)
  const onActionFilesRef = React.useRef(onActionFiles)
  const onSubmitRef = React.useRef(onSubmit)
  const placeholderRef = React.useRef(placeholder)

  React.useLayoutEffect(() => {
    onUpdateRef.current = onUpdate
    onBlurRef.current = onBlur
    uploadFnRef.current = uploadFn
    onActionFilesRef.current = onActionFiles
    onSubmitRef.current = onSubmit
    placeholderRef.current = placeholder
  })

  const throttledSetValue = useThrottle((value: Content) => onUpdateRef.current?.(value), throttleDelay)
  const { toast } = useToast()
  
  const provider = externalProvider;

  // Provider is now handled externally or passed as prop


  const handleUpdate = React.useCallback(
    (editor: Editor) => throttledSetValue(getOutput(editor, output)),
    [output, throttledSetValue]
  )

  const handleCreate = React.useCallback(
    (editor: Editor) => {
      if (value && editor.isEmpty && !collaboration?.enabled) {
        editor.commands.setContent(value)
      }
    },
    [value, collaboration?.enabled] // Don't set initial content if collaboration is enabled (let Y.js sync)
  )

  const handleBlur = React.useCallback((editor: Editor) => onBlurRef.current?.(getOutput(editor, output)), [output])

  const extensions = React.useMemo(
    () => createExtensions(placeholderRef.current, toast, collaboration, provider || undefined, uploadFnRef, onActionFilesRef, allowedMimeTypes, onSubmitRef),
    [toast, collaboration?.enabled, collaboration?.documentId, collaboration?.token, collaboration?.username, collaboration?.color, provider, allowedMimeTypes]
  )

  const editor = useEditor({
    extensions,
    onUpdate: ({ editor }) => handleUpdate(editor),
    onCreate: ({ editor }) => handleCreate(editor),
    onBlur: ({ editor }) => handleBlur(editor),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        class: cn('focus:outline-none', editorClassName)
      }
    }
  }, [extensions])

  // Update editor attributes dynamically if editorClassName changes
  React.useEffect(() => {
    if (editor && editorClassName !== undefined) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: cn('focus:outline-none', editorClassName)
          }
        }
      })
    }
  }, [editor, editorClassName])

  if (collaboration?.enabled && !provider) {
    return null
  }

  return editor
}

export default useMinimalTiptapEditor
