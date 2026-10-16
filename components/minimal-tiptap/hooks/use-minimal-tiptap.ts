import * as React from 'react'
import type { Editor } from '@tiptap/react'
import type { Content, UseEditorOptions } from '@tiptap/react'
import { useEditor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { SlashCommandItem } from '../extensions/slash-command/slashCommand'
import { cn } from '@/lib/utils/helpers/cn'
import { getOutput } from '../utils'
import { useThrottle } from '../hooks/use-throttle'
import { useToast } from '@/hooks/use-toast'
import type { ImageUploadOptions } from '../extensions/image/uploads'
import '@/components/docEditor/registry'
import { extensionsFor, useBlocksReady } from '@/components/docEditor/registry/factory'
import type { EditionGate } from '@/components/docEditor/registry/registry'
import type { BlockContext, EditorKind } from '@/components/docEditor/registry/types'

// Where these live now, for what imports them from here.
export { collaboratorCaret, collaboratorHueClass, collaboratorSelection } from '@/components/docEditor/registry/presence'
export { TYPOGRAPHY } from '../blocks/behaviour'

export interface ThrottleControls {
  flush: () => void
  cancel: () => void
}

export interface UseMinimalTiptapEditorProps extends UseEditorOptions {
  /**
   * Which editor this is: its blocks come from the block registry for its kind
   * (components/docEditor/registry/factory.ts). The chat composer and
   * comment boxes are 'chat' (the default), a task's description 'task', a
   * doc's page 'doc' and the guest's shared page 'guest' (useDocEditor).
   */
  kind?: EditorKind
  /**
   * The edition gate its blocks are read through: AI items only where AI is
   * on. A doc's page passes useEditionGate(); the rest have no AI items.
   */
  gate?: EditionGate
  /**
   * The doc the editor shows, on the doc's page: its plugins read what is
   * kept per doc (B6's page facts, the AI bar's store) by it (BlockContext).
   */
  docId?: string
  value?: Content
  output?: 'html' | 'json' | 'text'
  placeholder?: string
  editorClassName?: string
  throttleDelay?: number
  onUpdate?: (content: Content) => void
  onBlur?: (content: Content) => void
  /**
   * Optional out-ref that receives flush/cancel handles for the throttled
   * `onUpdate`. Wrapper components can call `flush()` right before invoking
   * a submit handler to guarantee the parent reads the latest content, and
   * `cancel()` after a successful send to drop any in-flight trailing-edge
   * call that would otherwise re-populate cleared input state.
   */
  throttleRef?: React.MutableRefObject<ThrottleControls | null>
  collaboration?: {
    enabled: boolean
    documentId: string
    token?: string
    username: string
    userId?: string
    color?: string
    /** This person's identity hue (lib/identityHue), sent so every tab draws them in it. */
    hue?: string
    profileKey?: string
    onAuthenticationFailed?: () => void
    onStatus?: (status: string) => void
    activeUsers?: number
  }
  provider?: HocuspocusProvider
  providerSynced?: boolean
  /** Uploads an image and returns its address; it is given progress and an abort signal. */
  uploadFn?: (file: File, options?: ImageUploadOptions) => Promise<{ id: string, src: string }>
  onActionFiles?: (files: File[], pos?: number) => void
  allowedMimeTypes?: string[]
  onSubmit?: () => boolean
  /** Escape, when the host gives it a meaning (cancelling an edit): true when it acted. A menu that is up takes Escape first. */
  onCancel?: () => boolean
  /** The "/" menu's items, when the host gives its own; else the registry's for its kind. */
  slashCommands?: SlashCommandItem[]
  showOnlyCurrentPlaceholder?: boolean
  /**
   * Attributes for the editable element itself, merged over the editor's own
   * (autocomplete off, and the class from editorClassName): its role and
   * accessible name, and how a phone's keyboard should treat the text. Kept
   * across later changes to editorClassName, which used to replace them all.
   */
  editorAttributes?: Record<string, string>
  /**
   * Whether the component holding the editor renders again on every
   * transaction (every keystroke). Tiptap's default, kept for the composers
   * that read the editor while rendering. A host that subscribes to what it
   * shows (useEditorState) passes false: the doc editor does, because on a
   * long doc re-rendering its whole toolbar and footer per key was most of the
   * time a keystroke took.
   */
  shouldRerenderOnTransaction?: boolean
}

/**
 * The editable element's attributes: autocomplete off (no browser suggestions
 * over the text), the caller's own (a doc's role and name, its keyboard
 * hints), and the class. Pure.
 *
 * The keyboard's autocorrect and capitalisation are the browser's unless the
 * caller says otherwise: they were "off" here, but every editor that passed a
 * class lost them on its first update, so every composer and doc has run with
 * the phone's defaults, and a doc now asks for them on purpose.
 */
export function editorDomAttributes(editorClassName?: string, extra?: Record<string, string>): Record<string, string> {
  return {
    autocomplete: 'off',
    ...(extra ?? {}),
    class: cn('focus:outline-none', editorClassName),
  }
}

/**
 * What a kind's editor is built with while its lazy blocks load: nothing it
 * could write to a shared doc with (no collaboration), never editable, never
 * shown (the hook answers null until the real one exists). y-prosemirror
 * deletes from the shared doc whatever its editor's schema can't hold, so the
 * real editor is never built without them.
 */
const WAITING = [StarterKit.configure({ history: false })]

export const useMinimalTiptapEditor = ({
  kind = 'chat',
  gate: gateProp,
  docId,
  value,
  output = 'html',
  placeholder = '',
  editorClassName,
  throttleDelay = 0,
  onUpdate,
  onBlur,
  collaboration,
  provider: externalProvider,
  providerSynced,
  uploadFn,
  onActionFiles,
  allowedMimeTypes,
  onSubmit,
  onCancel,
  slashCommands,
  showOnlyCurrentPlaceholder,
  throttleRef,
  shouldRerenderOnTransaction = true,
  editorAttributes,
  ...props
}: UseMinimalTiptapEditorProps) => {
  const onUpdateRef = React.useRef(onUpdate)
  const onBlurRef = React.useRef(onBlur)
  const uploadFnRef = React.useRef(uploadFn)
  const onActionFilesRef = React.useRef(onActionFiles)
  const onSubmitRef = React.useRef(onSubmit)
  const onCancelRef = React.useRef(onCancel)
  const placeholderRef = React.useRef(placeholder)
  const providerRef = React.useRef(externalProvider)

  React.useLayoutEffect(() => {
    onUpdateRef.current = onUpdate
    onBlurRef.current = onBlur
    uploadFnRef.current = uploadFn
    onActionFilesRef.current = onActionFiles
    onSubmitRef.current = onSubmit
    onCancelRef.current = onCancel
    placeholderRef.current = placeholder
    providerRef.current = externalProvider
  })

  // The throttle is handed the editor, not its output: the output (the whole
  // document as HTML) is worked out when the throttled call actually runs, at
  // most once per throttleDelay, rather than on every keystroke and thrown
  // away by the throttle. On a long doc that serialisation was a few
  // milliseconds a key.
  const throttledSetValue = useThrottle((ed: Editor) => onUpdateRef.current?.(getOutput(ed, output)), throttleDelay)
  const { toast } = useToast()

  const provider = externalProvider;

  // Expose throttle flush/cancel via the optional out-ref. The wrapper
  // component uses this to (a) flush before submitting so the parent
  // sees the latest content synchronously and (b) cancel after a
  // successful send so a stale trailing-edge call cannot resurrect
  // already-sent text in the cleared input slice.
  React.useLayoutEffect(() => {
    if (!throttleRef) return
    throttleRef.current = {
      flush: () => throttledSetValue.flush?.(),
      cancel: () => throttledSetValue.cancel?.(),
    }
    return () => {
      if (throttleRef.current) {
        throttleRef.current = null
      }
    }
  }, [throttleRef, throttledSetValue])

  const handleUpdate = React.useCallback(
    (editor: Editor) => {
      // Nobody listening (a collaborative doc saves through its socket): no
      // output to work out.
      if (!onUpdateRef.current) return
      throttledSetValue(editor)
    },
    [throttledSetValue]
  )

  const handleCreate = React.useCallback(
    (editor: Editor) => {
      if (!collaboration?.enabled) {
        // Non-collaborative mode: set content from prop
        if (value && editor.isEmpty) {
          editor.commands.setContent(value)
        }
        return
      }

      // Collaborative mode: never seed from the prop. The collaboration server
      // builds the document from its stored HTML when it loads it, so content
      // always arrives through sync. Seeding here as well, which a timer used to
      // do when sync took longer than 800 ms, inserted an unrelated second copy
      // that merged with the server's: every block twice, then saved that way.
    },
    [value, collaboration?.enabled]
  )

  const handleBlur = React.useCallback((editor: Editor) => onBlurRef.current?.(getOutput(editor, output)), [output])

  // The kind's blocks, from the registry, once those that load lazily are
  // here (a doc's own blocks are one chunk, fetched when its first editor is
  // built). With the upstream provider created via state (stable identity for
  // a document's lifetime) and the editor gated on the provider being ready
  // before mount, this runs once per document: the editor is created already
  // bound to Yjs rather than rebuilt mid-session. `activeUsers` is deliberately
  // left out so presence updates never rebuild it.
  const ai = !!gateProp?.ai
  const gate = React.useMemo<EditionGate>(() => ({ ai }), [ai])
  const ready = useBlocksReady(kind, gate)
  const extensions = React.useMemo(
    () => {
      if (!ready) return WAITING
      const context: BlockContext = {
        kind,
        gate,
        placeholderOf: () => placeholderRef.current,
        showOnlyCurrentPlaceholder,
        toast,
        uploadFnRef,
        onActionFilesRef,
        allowedMimeTypes,
        onSubmitRef,
        onCancelRef,
        slashCommands,
        docId,
        collaboration,
        provider: provider || undefined,
      }
      return extensionsFor(context)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ready,
      kind,
      gate,
      docId,
      toast,
      collaboration?.enabled,
      collaboration?.documentId,
      collaboration?.token,
      collaboration?.username,
      collaboration?.color,
      provider,
      allowedMimeTypes,
      slashCommands,
      showOnlyCurrentPlaceholder,
    ]
  )

  const { editable = true } = props

  // The editable element's attributes, all of them every time: ProseMirror
  // replaces the whole map on setOptions, so an update that named only the
  // class used to drop the rest (autocomplete, the role, the accessible name).
  const attributesKey = JSON.stringify(editorAttributes ?? null)
  const attributes = React.useMemo(
    () => editorDomAttributes(editorClassName, editorAttributes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by value, not identity
    [editorClassName, attributesKey],
  )

  const editor = useEditor({
    extensions,
    // Only a change to the document is an edit. Tiptap also emits "update"
    // from setEditable, with nothing changed; passed on, that read as an edit
    // and opening a task wrote its description back (POST /task/updateTaskDesc).
    onUpdate: ({ editor, transaction }) => {
      if (!ready || !transaction.docChanged) return
      handleUpdate(editor)
    },
    onCreate: ({ editor }) => {
      if (ready) handleCreate(editor)
    },
    onBlur: ({ editor }) => {
      if (ready) handleBlur(editor)
    },
    immediatelyRender: false,
    shouldRerenderOnTransaction,
    editable: ready ? editable : false,
    editorProps: { attributes }
  // Not on `editable`: who may edit changes with setEditable below, and the
  // editor (its history, its place in the doc) stays (N29).
  }, [extensions])

  // Update editor editable state dynamically
  React.useEffect(() => {
    if (!ready || !editor || editor.isDestroyed || editable === undefined) return
    // false: changing who may edit is not an edit (setEditable emits
    // "update" by default).
    if (editor.isEditable !== editable) editor.setEditable(editable, false)
  }, [editor, editable, ready])

  // The attributes changed after the editor was made (a new class, a new
  // name): the whole map again, so nothing set at creation is lost.
  const appliedAttributes = React.useRef(attributes)
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (appliedAttributes.current === attributes) return
    appliedAttributes.current = attributes
    editor.setOptions({ editorProps: { attributes } })
  }, [editor, attributes])

  // Placeholder decorations are only recomputed on a transaction, so a new
  // placeholder prop needs one to show. It changes nothing in the document.
  React.useEffect(() => {
    if (!ready || !editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta('placeholderRefresh', true))
  }, [editor, placeholder, ready])

  // The editor once its blocks are all here; until then, none (the hosts
  // draw the doc's saved copy, or their own skeleton, meanwhile). The render
  // that sees them arrive still holds the waiting editor: not that one either.
  return ready && editor && editor.options.extensions !== WAITING ? editor : null
}
