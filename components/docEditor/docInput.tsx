"use client"

import type { DocAbilities } from "@/lib/docs/abilities"
import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { cn } from '@/lib/utils/helpers/cn'
import { useClientConfig } from '@/hooks/useClientConfig'
import { exceedsUploadLimit, uploadLimitMessage } from '@/lib/utils/uploadLimit'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
import { SelectionBar } from '@/components/docEditor/SelectionBar'
import { celebrate } from '@/lib/celebrateSoon'
import { DOC_EDITOR_CLASS, useDocEditor } from '@/components/docEditor/useDocEditor'
import { ImageNotUploadable, type ImageUploadOptions } from '@/components/minimal-tiptap/extensions/image/uploads'
import { lazyDialog } from '@/lib/lazy/lazyDialog'
import { lazyPart } from '@/lib/lazy/lazyPart'
import { tableForDoc } from '@/components/docEditor/tableForDoc'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import { useDispatch, useSelector } from "react-redux"
import { openRightPanel, selectDocAiOpen } from "@/store/slice/desktopRightPanelSlice"
import { useMedia } from "@/context/MediaQueryContext"
import { useSheetMode } from '@/components/ui/overlayMode'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { DocsGet } from "@/services/endpoints/docs"
import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { SafeHtml } from '@/components/safeHtml/SafeHtml'
import { snapshotHtml } from '@/components/docEditor/snapshotHtml'
import type { TitleStore } from '@/components/docEditor/docTitleStore'
import { DocTitle } from '@/components/docEditor/DocTitle'
import { DocBodyLayer } from '@/components/docEditor/DocBodyLayer'
import { useNewDocArrival } from '@/components/docEditor/newDocArrival'
import { useInternalLinkRouter } from '@/lib/utils/useInternalLinkRouter'
import { useEditionGate } from '@/components/docEditor/registry/gate'
import { NO_BUS, bindEditorCommands, useDocBus, useDocCommand } from '@/components/docEditor/registry/commandBus'
import { SlotOutlet } from '@/components/docEditor/registry/slots'
import type { ActionContext } from '@/components/docEditor/registry/types'
import { lazyPiece } from "@/lib/lazy/lazyPiece"

/** The phone's AI sheet: its code (and its animation library) loads when it first opens. */
const DocAiAssistantPanel = lazyPiece(() => import('@/components/ai/DocAiAssistantPanel').then((m) => ({ default: m.DocAiAssistantPanel })))

/** The "/table" picker: its code (the table list, its search) loads when it first opens. */
const TableEmbedPickerDialog = lazyDialog(() => import('@/components/docEditor/TableEmbedPickerDialog').then((m) => m.TableEmbedPickerDialog), 'the table picker')

/**
 * The phone's Formatting bar: drawn only on a phone, so a computer never
 * fetches its code, and a phone fetches it as the doc opens, before a finger
 * is in the text.
 */
const AccessoryBar = lazyPart(() => import('@/components/docEditor/DocAccessoryBar').then((m) => m.DocAccessoryBar))

/** The live editor while the saved copy stands in for it: mounted, out of the layout. */
const HIDDEN: React.CSSProperties = { display: 'none' }

interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
    value?: Content
    onChange?: (value: Content) => void
    className?: string
    editorContentClassName?: string
    docId?: string
    provider?: HocuspocusProvider
    providerSynced?: boolean
    /** The doc's title, when the editor shows it (docTitleStore.ts). */
    titleStore?: TitleStore
    onTitleChange?: (title: string) => void
    onTitleBlur?: () => void
    editableTitle?: boolean
    lastEditedRelative?: string
    focusMode?: boolean
    /** The page at 1,040 px instead of the 720 px reading measure (the More menu's "Full width"). */
    fullWidth?: boolean
    /** Who wrote it, for the meta line under the title. */
    authorName?: string
    /** The editor, once, for what the page shows from it (the word count in More). */
    onEditor?: (editor: Editor | null) => void
    /** Comment, from the selection bar. */
    onComment?: () => void
    /** What the person may do with the doc (lib/docs/abilities): a reader's bar offers by it. */
    abilities?: DocAbilities
    /** What shows under the title: what a reader may do (DocAccessNote). */
    belowTitle?: React.ReactNode
    /**
     * A doc that belongs to something else (a table row's page, docs D-18):
     * drawn without the doc page's own layers over its body (the gutter's
     * marks, an empty doc's starter of templates, import and Ask AI), whose
     * paths refuse a hosted doc.
     */
    hosted?: boolean
}

/**
 * Checking the last open item in a to-do list is a "list done" moment: one
 * small spark burst from that checkbox. Single checks never fire it.
 */
function useChecklistDone(editor: Editor | null) {
    React.useEffect(() => {
        if (!editor) return
        const dom = editor.view.dom as HTMLElement
        const onChange = (e: Event) => {
            const input = e.target as HTMLInputElement
            if (input?.type !== 'checkbox' || !input.checked) return
            // After the editor has applied the check.
            window.setTimeout(() => {
                const list = input.closest('ul.task-list')
                if (!list) return
                const items = Array.from(list.children).filter((c) => c.matches('li.task-item'))
                if (items.length > 1 && items.every((li) => li.getAttribute('data-checked') === 'true')) {
                    celebrate(input, { count: 6 })
                }
            }, 0)
        }
        dom.addEventListener('change', onChange)
        return () => dom.removeEventListener('change', onChange)
    }, [editor])
}

const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, provider, providerSynced, titleStore, onTitleChange, onTitleBlur, editableTitle = true, collaboration, lastEditedRelative, focusMode, fullWidth = false, authorName, onEditor, onComment, abilities, belowTitle, hosted = false, ...props }, ref) => {
        const { toast } = useToast()
        const uploadFile = useUploadFile()
        const clientConfig = useClientConfig()
        const titleRef = React.useRef<HTMLTextAreaElement>(null)

        // uploadFn puts a doc image in object storage and returns its URL. An image
        // is NEVER inlined into the document as a base64 data URI, no matter what
        // goes wrong.
        //
        // It used to fall back to exactly that on any failure, which quietly turned
        // every refusal into a much worse outcome: the backend rejects an oversized
        // upload with a 413, the fallback then embedded the whole image in the
        // document body, and those bytes were stored and sent on to OpenSearch as
        // analysed text — where parsing a single such document exhausted the search
        // node's heap and stopped the container. The error path inverted the control
        // that had just refused the file.
        //
        // So: check the size before spending a request, and on failure tell the
        // person and rethrow. A failed image the author can retry is a far better
        // outcome than a document that silently carries megabytes of binary.
        //
        // While it uploads, the document holds only a placeholder (no address);
        // the progress, and Retry or Remove on a failure, show on it in this tab
        // (minimal-tiptap/extensions/image/uploads.ts).
        const uploadFn = React.useCallback(async (file: File, options?: ImageUploadOptions) => {
            if (!docId) {
                toast({
                    title: 'Couldn’t add the image',
                    description: 'This document isn’t ready yet. Try again in a moment.',
                    variant: 'destructive'
                });
                throw new ImageNotUploadable('docId required for image upload')
            }
            // Refuse an oversized image up front: same cap the server enforces, but
            // with instant feedback and no wasted request or progress bar.
            if (exceedsUploadLimit(file.size, clientConfig.upload_limit_bytes)) {
                toast({
                    title: 'Image too large',
                    description: uploadLimitMessage(file.size, clientConfig.upload_limit_mb, file.name),
                    variant: 'destructive'
                });
                throw new ImageNotUploadable('image exceeds the workspace upload limit')
            }
            // A failure is said on the image itself, with Retry and Remove.
            // Never returning a data URI: that is what broke search.
            const data = await uploadFile.uploadImageToDoc(file, docId, options);
            const objUuid = data?.object_uuid;
            if (!objUuid) throw new Error('Upload failed: no response data');
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || '';
            const src = `${baseUrl}${DocsGet.GetDocAttachment}/${docId}/${objUuid}`;
            return { id: objUuid, src }
        }, [docId, toast, uploadFile, clientConfig.upload_limit_bytes, clientConfig.upload_limit_mb]);

        // The title names the editable body for a screen reader.
        const titleId = React.useId()

        // The doc's own editor (useDocEditor): the same blocks for every doc
        // surface, and a frame that doesn't render again per keystroke. Null
        // until the doc's own blocks have loaded (the saved copy shows).
        const gate = useEditionGate()
        const editor = useDocEditor({
            gate,
            docId,
            value,
            onUpdate: onChange,
            uploadFn,
            provider,
            collaboration,
            labelledBy: titleStore ? titleId : undefined,
            ...props,
        })

        // A doc made a moment ago: the title ready to type over, and a
        // template's body once the live copy has synced (newDocArrival.ts).
        useNewDocArrival({ editor, synced: !!providerSynced || !collaboration, titleRef, canEditTitle: editableTitle && !!titleStore })

        const dispatch = useDispatch()
        const { isMobile } = useMedia()
        // Doc AI's panel: beside the doc, or a sheet on a phone held either way (components/ui/overlayMode).
        const sheet = useSheetMode()
        const docAiOpen = useSelector(selectDocAiOpen)
        const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
        const suppressOverlays = isDrawerOpen || docAiOpen
        const [selectedText, setSelectedText] = React.useState('')
        // What the phone's AI sheet was opened to do ("/" Write with AI, or a prompt).
        const [drawerAsk, setDrawerAsk] = React.useState<{ action?: string; prompt?: string }>({})
        const isFullWidth = fullWidth
        // The saved text stands in until the editor exists (its blocks load
        // once) and, for a collaborative one, until its first sync.
        const snapshot = typeof value === 'string' && value.trim() !== '' && (!editor || (!!provider && !providerSynced))

        // The page reads the word count from the editor (More menu); hand it over once.
        React.useEffect(() => {
            onEditor?.(editor ?? null)
        }, [editor, onEditor])

        useChecklistDone(editor ?? null)

        // The doc's command bus (the page's, DocBusContext): inserts and
        // replacements from Doc AI land in this editor alone, never in another
        // doc open beside it (they were window events every doc heard: N5).
        const bus = useDocBus()
        React.useEffect(() => {
            if (!editor || bus === NO_BUS) return
            return bindEditorCommands(editor, bus)
        }, [editor, bus])

        // Doc AI, on the selection (or around the caret, for "/" items with
        // nothing selected): the panel beside the doc, or the phone's sheet.
        const openAI = React.useCallback((action?: string, prompt?: string) => {
            if (!editor) return
            const { from, to } = editor.state.selection
            const hasSelection = from !== to
            // Asked with nothing selected and no action (a reader's Ask AI
            // under the title): the whole doc is what it reads.
            const text = hasSelection
                ? editor.state.doc.textBetween(from, to, ' ')
                : action
                ? editor.state.doc.textBetween(Math.max(0, from - 200), Math.min(editor.state.doc.content.size, to + 200), ' ')
                : editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').slice(0, 20000)
            const contextSize = 500
            const contextBefore = editor.state.doc.textBetween(Math.max(0, from - contextSize), from, ' ')
            const contextAfter = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + contextSize), ' ')
            const surroundingContext = `[BEFORE]: ${contextBefore}\n[SELECTED]: ${text}\n[AFTER]: ${contextAfter}`
            const asked = prompt?.trim() || undefined
            setSelectedText(text)
            if (!sheet) {
                dispatch(openRightPanel({
                    docAiOpen: true,
                    docAiData: {
                        selectedText: text,
                        docId: docId || '',
                        surroundingContext,
                        initialAction: action,
                        initialPrompt: asked,
                        level: abilities?.level,
                    }
                }))
            } else {
                setDrawerAsk({ action, prompt: asked })
                setIsDrawerOpen(true)
            }
        }, [editor, sheet, dispatch, docId, abilities?.level])
        useDocCommand(bus, 'aiRun', ({ action, prompt }) => openAI(action, prompt))
        // The bars' Ask AI: through the bus, so a package listening hears it too.
        const handleAIClick = React.useCallback(() => {
            if (bus === NO_BUS) openAI()
            else bus.emit('aiRun', {})
        }, [bus, openAI])

        // What the bars' actions run with: this doc, its editor and bus, the edition.
        const canEditBody = props.editable !== false
        const actionContext = React.useCallback(
            (): ActionContext => ({ docId: docId ?? '', editor: editor ?? null, canEdit: canEditBody && !!editor?.isEditable, abilities, bus, gate }),
            [docId, editor, canEditBody, abilities, bus, gate],
        )

        // A reader's click on one of the app's own links opens it in the app
        // (external ones open in a new tab, link.ts). In the editable text a
        // click edits, as everywhere.
        const routeInApp = useInternalLinkRouter(props.editable === false)

        // Table embed picker — opened by the "/table" slash command. Only doc
        // editors can insert (the slash menu only shows in an editable editor,
        // and we gate again here). Embedding stores only a { tableId } reference;
        // when another reader opens the doc, the embed fetches the table AS THAT
        // USER, so the table's own permissions are enforced server-side (a private
        // table simply shows an "unavailable" placeholder to others, never leaks).
        // A new table is as private as the doc (tableForDoc): it was made for the
        // whole workspace, so a private doc's new table reached everyone.
        const [embedTableOpen, setEmbedTableOpen] = React.useState(false)
        const [creatingTable, setCreatingTable] = React.useState(false)
        useDocCommand(bus, 'openDialog', ({ id }) => {
            if (id === 'doc.embedTable' && editor?.isEditable) setEmbedTableOpen(true)
        })

        const handleEmbedExistingTable = React.useCallback((tableId: string) => {
            if (!editor || !editor.isEditable || !tableId) return
            editor.chain().focus().setTableEmbed({ tableId }).run()
            setEmbedTableOpen(false)
        }, [editor])

        const handleCreateAndEmbedTable = React.useCallback(async () => {
            if (!editor || !editor.isEditable || creatingTable) return
            setCreatingTable(true)
            try {
                const { visibility } = docId ? await tableForDoc(docId) : { visibility: 'private' as const }
                // The tables service comes with the first new table, not with the doc's
                // first screen (17 Oct 2026: 24 KB, app/app/doc/docFirstLoad.test.ts).
                const { createTable } = await import("@/services/tableService")
                const t = await createTable({ name: "Untitled table", visibility })
                editor.chain().focus().setTableEmbed({ tableId: t.id }).run()
                setEmbedTableOpen(false)
            } catch {
                /* axios interceptor surfaces the error */
            } finally {
                setCreatingTable(false)
            }
        }, [editor, creatingTable, docId])

        const canEdit = props.editable !== false
        // A reader's selection gets a bar too, with only what they may do
        // (Comment from comment up, Ask AI's reading actions from view).
        const readerBar = !!abilities && (abilities.comment || (gate.ai && abilities.askRead))

        return (
            <MeasuredContainer
                as="div"
                name="editor"
                ref={ref}
                className={cn(
                    'flex w-full flex-col',
                    suppressOverlays && "suppress-tippy",
                    className
                )}
            >
                {/* No toolbar row (content.md D08): formatting appears on a
                    selection (SelectionBar), blocks come from "/" and the
                    block handle. A phone gets a bar above its keyboard while
                    the editor has focus. */}
                {/* Content area — scrollable body */}
                <div 
                    // doc-scroll: the size container that wide blocks measure
                    // their breakout against (minimal-tiptap/styles/index.css).
                    className="doc-scroll w-full relative flex-1 min-h-0 overflow-y-auto overflow-x-clip cursor-text"
                    onClickCapture={routeInApp}
                >
                    <div 
                        className={cn("w-full min-h-full flex flex-col mx-auto", isFullWidth ? "doc-measure-full" : "doc-measure")}
                    >
                        {/* The title and the meta line (DocTitle.tsx), inside
                            the scroller: [data-doc-title] stays in .doc-scroll. */}
                        {titleStore && (
                            <DocTitle
                                store={titleStore}
                                titleRef={titleRef}
                                id={titleId}
                                editor={editor ?? null}
                                editable={editableTitle}
                                onChange={onTitleChange}
                                onBlur={onTitleBlur}
                                authorName={authorName}
                                lastEditedRelative={lastEditedRelative}
                                focusMode={focusMode}
                                fullWidth={isFullWidth}
                            />
                        )}
                        {belowTitle}
                        {/* Until the live copy arrives (the first sync over the
                            socket, two round trips after the page shows), the
                            doc's saved text shows, read-only and drawn as the
                            editor draws it (snapshotHtml gives its blocks the
                            editor's classes, so each sits where the editor will
                            put it), so opening a doc doesn't wait on the socket.
                            The editor stays mounted, out of the layout, and takes
                            the copy's place once it has the text. Nothing goes
                            into the shared document: the server builds that from
                            the same HTML. */}
                        {snapshot && (
                            <div
                                aria-busy="true"
                                data-doc-snapshot=""
                                className={cn(DOC_EDITOR_CLASS, 'flex-1', isFullWidth && 'full-width', editorContentClassName)}
                            >
                                <SafeHtml html={value as string} sanitizer={snapshotHtml} className="ProseMirror" />
                            </div>
                        )}
                        {/* The gutter and the empty starter (DocBodyLayer.tsx):
                            no height, over the top of the body. */}
                        {editor && !snapshot && !hosted && (
                            <DocBodyLayer gate={gate} docId={docId ?? ''} editor={editor} canEdit={canEdit} padded={isFullWidth ? "px-5 md:px-12" : "px-5 md:px-8"} />
                        )}
                        {editor && (
                            <EditorContent
                                editor={editor}
                                className={cn(
                                    DOC_EDITOR_CLASS,
                                    'flex-1 cursor-text',
                                    isFullWidth && 'full-width',
                                    editorContentClassName
                                )}
                                // Inline, not the hidden class: .doc-editor's own
                                // display: flex (minimal-tiptap/styles) is outside the
                                // utility layer and beat it, so an empty editor sat
                                // under the copy and jumped up when the copy went.
                                style={snapshot ? HIDDEN : undefined}
                            />
                        )}
                        {editor && !snapshot && !hosted && (providerSynced || !collaboration) && <SlotOutlet slot="foot" gate={gate} docId={docId ?? ''} editor={editor} />}
                    </div>
                </div>

                {editor && <LinkBubbleMenu editor={editor} hide={suppressOverlays} />}
                {editor && (canEdit || readerBar) && !isMobile && (
                    <SelectionBar editor={editor} context={actionContext} onAIClick={handleAIClick} onComment={bus === NO_BUS ? onComment : undefined} hide={suppressOverlays} />
                )}
                {editor && canEdit && isMobile && !focusMode && (
                    <AccessoryBar.Part editor={editor} context={actionContext} onAIClick={handleAIClick} onComment={bus === NO_BUS ? onComment : undefined} />
                )}
                {/* Over the editor, once per editor: a package's view of it
                    (A9's review bar, A8's threads). Each sees what it may do. */}
                {editor && <SlotOutlet slot="editorOverlay" gate={gate} docId={docId ?? ''} editor={editor} />}

                {/* Mobile AI Drawer */}
                {/* The phone's AI sheet: the shared sheet at its large detent
                    (mobile C7), which pushes the page back and keeps the
                    grabber and the home-indicator strip. */}
                <Drawer detent="large" open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                    <DrawerContent>
                        <DrawerTitle className="sr-only">OneCamp AI</DrawerTitle>
                        <DrawerDescription className="sr-only">AI powered document assistant for writing and transforming text.</DrawerDescription>
                        {isDrawerOpen && (
                            <React.Suspense fallback={null}>
                                <DocAiAssistantPanel
                                    selectedText={selectedText}
                                    docId={docId || ''}
                                    initialAction={drawerAsk.action as never}
                                    initialPrompt={drawerAsk.prompt}
                                    onClose={() => setIsDrawerOpen(false)}
                                    sheet
                                />
                            </React.Suspense>
                        )}
                    </DrawerContent>
                </Drawer>

                <TableEmbedPickerDialog
                    open={embedTableOpen}
                    onOpenChange={setEmbedTableOpen}
                    onSelectExisting={handleEmbedExistingTable}
                    onCreateNew={handleCreateAndEmbedTable}
                    creating={creatingTable}
                />
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapDocInput'

// Memoised: the doc page re-renders for presence, scrolling and its save dot,
// none of which the editor shows (docRender.test.tsx counts).
export default React.memo(MinimalTiptapDocInput)
