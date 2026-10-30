/**
 * The doc editor's registries: their shapes (docs programme, PROGRAM.md §4 #1–#4
 * and invariant I16).
 *
 * Blocks, actions, shortcuts, panels, dialogs and shell slots are registered,
 * never hand-wired into the host files: a package adds one line to
 * registry/index.ts and edits no host. The collaboration server's schema
 * manifest and the schema version come from the block specs (I4), so a block
 * ships with its web spec, its server schema file and its codec rule together.
 *
 * Every editor is built from these specs (registry/factory.ts): the doc page,
 * the guest's shared page, the chat composer and a task's description each take
 * the blocks registered for their kind, in one order.
 */

import type { OnDemandBlock } from "./onDemand"
import type { DocAbilities } from "@/lib/docs/abilities"
import type { ComponentType, ElementType } from 'react'
import type { AnyExtension, Editor, JSONContent, Range } from '@tiptap/core'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { Anchor } from '@/lib/anchors/types'
import type { CodecRule } from '@/lib/codec/types'
import type { Toast } from '@/hooks/use-toast'
import type { ImageUploadOptions } from '@/components/minimal-tiptap/extensions/image/uploads'
import type { Message, Target } from '@/lib/conversation/types'
import type { CalendarEvent } from '@/lib/calendar/types'
import type { CalendarView } from '@/components/calendar/calendarApp'
import type { WorkAccess, WorkTask } from '@/lib/work/types'

/** The editors a block can ship in. The guest viewer's schema always equals the doc editor's (I4). */
export type EditorKind = 'doc' | 'guest' | 'chat' | 'task'

/** The editions that carry something. AI items register behind the AI gate and never reach the AI-free build. */
export type Edition = 'both' | 'ai'

/** A block's entry in the slash menu. */
export interface SlashEntry {
  /** Its id in the menu and in "Recent"; the block's id when it has one entry. */
  id?: string
  title: string
  description: string
  /** More words it is found by: /num finds Numbered list. */
  aliases?: string[]
  /** The menu's group: Basic, Media and embeds, AI, Format… */
  section: string
  icon: ElementType
  /** The tile's tint classes (a media block wears its kind's camp tint). */
  tint?: string
  /** The Markdown shortcut that makes the same block, shown as kbd chips. */
  kbd?: string[]
  /** Lower comes first within its section; registration order breaks ties. */
  order?: number
  /** The editors whose "/" offers it; a doc's alone when absent. */
  editors?: EditorKind[]
  run(editor: Editor, range: Range): void
}

/** A block's entry in Turn into (the selection bar, the phone's "Aa", the block menu). */
export interface TurnIntoEntry {
  /** Its id ("text", "h1", "todo"); the block's id when it has one entry. */
  id?: string
  label: string
  icon: ElementType
  /** Lower comes first in the menu. */
  order?: number
  /**
   * Lower is asked first when naming the block the caret is in: a list
   * item's own block is a paragraph, so the lists answer before Text does.
   */
  detect?: number
  isActive(editor: Editor): boolean
  run(editor: Editor): void
}

/**
 * One row of the shortcut table, which makes both the keymap and the shortcuts
 * dialog (registry/shortcuts.ts). A row with run is bound by the table itself;
 * a row without one names a key an extension binds (Bold's ⌘B), and the table
 * test fires it all the same.
 */
export interface ShortcutRow {
  /** Tiptap's notation: 'Mod-Alt-1', 'Mod-Shift-s'. Absent for a row that is only typed ("/", "@"). */
  keys?: string
  /** Other chords that do the same, or with sequence the keys that follow. */
  alt?: string[]
  /** Text typed at a line's start that does the same: '#', '[]', '```'. */
  typed?: string[]
  /** The keys are pressed one after the other ("Esc, then ⇥"), not alternatives. */
  sequence?: boolean
  label: string
  /** The dialog's group: Text, Blocks, Doc. */
  group: string
  /** Lower comes first in its group; registration order breaks ties. */
  order?: number
  /** What the key does, when the table binds it. */
  run?(editor: Editor): boolean
}

/** A node or mark a block writes, as the collaboration server's schema manifest records it. */
export interface SchemaEntry {
  kind: 'node' | 'mark'
  name: string
  attrs: string[]
}

/** A ref the host keeps current: the factory reads it when the extension runs, not when it is made. */
export interface CurrentRef<T> {
  readonly current: T
}

/**
 * What an editor is being built with: what its host hands the factory. The
 * extensions that need it (an image's upload, the placeholder's text, the
 * composer's Enter) take it in their spec's create().
 */
export interface BlockContext {
  kind: EditorKind
  gate: { ai: boolean }
  /** The host's placeholder, read when it is drawn (it can change after creation). */
  placeholderOf(): string
  /** Only the current empty block shows its placeholder. */
  showOnlyCurrentPlaceholder?: boolean
  toast(options: Toast): void
  /** The host's upload, when it has its own (the doc page's goes to the doc's attachments). */
  uploadFnRef?: CurrentRef<((file: File, options?: ImageUploadOptions) => Promise<{ id: string; src: string }>) | undefined>
  /** Files dropped or pasted, when the host handles them itself (the composer attaches them). */
  onActionFilesRef?: CurrentRef<((files: File[], pos?: number) => void) | undefined>
  allowedMimeTypes?: string[]
  /** The composer's Enter: true when it sent. */
  onSubmitRef?: CurrentRef<(() => boolean) | undefined>
  /** The editor's Escape, where it means "stop" (a message being edited): true when it did. */
  onCancelRef?: CurrentRef<(() => boolean) | undefined>
  /** The slash menu's items, when the host gives its own (the chat composer's commands). */
  slashCommands?: unknown[]
  /**
   * The doc the editor shows, on the doc's page: what is kept per doc (B6's
   * page facts, the AI bar's store) is read by the editor's own plugins, given
   * at creation, never added once it is open.
   */
  docId?: string
  /** The live document, for an editor bound to one. */
  collaboration?: {
    enabled: boolean
    documentId: string
    username: string
    userId?: string
    color?: string
    hue?: string
    profileKey?: string
  }
  provider?: HocuspocusProvider
}

/** One block: everything every surface needs to know about it, in one place. */
export interface BlockSpec {
  id: string
  editors: EditorKind[]
  edition: Edition
  /** Its extensions, when they are light enough to load with the editor. */
  extensions?: AnyExtension[]
  /** Or extensions made for each editor, from what its host gives (an upload, a placeholder). */
  create?(ctx: BlockContext): AnyExtension[]
  /**
   * Or a loader, for heavy ones (I20). An editor whose blocks are still
   * loading is not built: y-prosemirror deletes what its schema can't hold.
   * It gives the extensions, or, for ones made for each editor (as create's
   * are), what makes them.
   */
  load?: () => Promise<AnyExtension[] | ((ctx: BlockContext) => AnyExtension[])>
  /**
   * Or plugins a doc needs only once it holds one of these nodes (a table's
   * editing): its editor is made with stand-ins for them and fetches them the
   * moment it holds one, and only a doc whose saved copy holds one waits for
   * them (registry/onDemand.ts). One map from node types to a chunk, for any
   * block.
   */
  onDemand?: OnDemandBlock
  /**
   * Its place in the editor's extension list, lower first (a later
   * extension's keys run first: how-docs-work-frontend §2d). Packages leave it
   * out and come after the built-in blocks, in registration order.
   */
  order?: number
  /** The specs this one stands in for, in the editors it lists (A2's placeholder for Tiptap's). */
  replaces?: string[]
  /**
   * Its part of the one StarterKit every editor carries (its key and options),
   * for the blocks StarterKit bundles: paragraph, heading, lists, the marks.
   */
  starterKit?: Record<string, unknown>
  /** What it writes. Every node the doc editor's schema has must belong to a spec. */
  schema: SchemaEntry[]
  /**
   * Attributes it adds to other specs' nodes (Tiptap's global attributes): a
   * block's indent or text direction, written on blocks it doesn't own. Each
   * names the nodes it goes on, exactly, and the manifest shows it on each
   * (manifest.ts declaredSchema folds them in). The collaboration server's
   * schema file for it adds the same attribute to the same nodes.
   */
  globalAttrs?: Array<{ name: string; on: string[] }>
  slash?: SlashEntry[]
  /** What one of its blocks is called where it is chosen (the block menu's title), when no "/" entry names it. */
  label?: string
  turnInto?: TurnIntoEntry | TurnIntoEntry[]
  shortcuts?: ShortcutRow[]
  /** [selector, className] for the saved-copy snapshot (snapshotHtml.ts). */
  snapshotClass?: [selector: string, className: string]
  /** More than one snapshot rule. */
  snapshotClasses?: Array<[selector: string, className: string]>
  /** It breaks out of the text column. */
  wide?: boolean
  /** Its Markdown and HTML rules (lib/codec). */
  codec?: CodecRule[]
  /** The text search indexes for it. */
  searchText?(node: JSONContent): string
  /** What the sanitiser keeps of it (lib/sanitizeHtml). */
  sanitize?: { tags?: string[]; attrs?: Record<string, string[]>; classes?: string[] }
  /** Typography's replacements stay out of it (code, maths). */
  excludesTypography?: boolean
  /** A button on the phone's accessory bar. */
  phoneBar?: { icon: ElementType; label: string }
}

/** The surfaces an action can appear on. */
export type Surface = 'slash' | 'selection' | 'blockMenu' | 'more' | 'phoneBar' | 'phoneSheet' | 'palette'

/**
 * What the doc's shell keeps that an action may show or flip: each is a
 * `toggle` on the bus, and the shell passes its current value here.
 */
export interface DocShellState {
  focusMode?: boolean
  fullWidth?: boolean
  /** The doc is in the member's Later list. */
  saved?: boolean
  /** A wide screen: the items that only make sense there show (Full width). */
  desktop?: boolean
  /** The member owns the doc (rename and delete on the phone's sheet). */
  owner?: boolean
  /** The member may open Share (the header's button on a wide screen, the phone's sheet). */
  canShare?: boolean
  /** The doc's title as typed (an export's file name). */
  title?: string
  [field: string]: unknown
}

/** What an action knows when it runs. */
export interface ActionContext {
  docId: string
  editor: Editor | null
  canEdit: boolean
  /**
   * What the person may do with the doc, as the server decided it
   * (lib/docs/abilities): what a reader is offered (Ask AI's reading
   * actions, Comment) is decided by it. Absent: only canEdit is known.
   */
  abilities?: DocAbilities
  bus: DocCommandBus
  /** Whether the AI gate is open where it shows. */
  gate?: { ai: boolean }
  /** What the shell knows that an action may show: full width on, focus mode on. */
  state?: DocShellState
}

/**
 * One action, written once and shown on every surface it lists. A doc's runs
 * with an ActionContext on the doc's surfaces; chat's (ChatAction) and the
 * calendar's are the same shape over their own context and surfaces.
 */
export interface SurfaceAction<C = ActionContext, S extends string = Surface> {
  id: string
  label: string
  /** A label that depends on the doc ("Leave focus mode", "Saved for later"). */
  labelFor?(ctx: C): string
  /** The line under its name where a surface has room for one ("/", the palette). */
  description?: string
  /** More words "/" and the palette find it by. */
  aliases?: string[]
  icon?: ElementType
  /** An icon that depends on the doc (a filled bookmark once saved). */
  iconFor?(ctx: C): ElementType
  /** It destroys something: shown alone, last, in the danger tone. */
  destructive?: boolean
  /** Items are grouped, groups split by a hairline: view, doc, export, help… */
  group: string
  surfaces: S[]
  /** Its row in the shortcut table, in Tiptap's notation ('Mod-l', 'Shift-f', '?'). */
  shortcut?: string
  /**
   * Where the shortcut works: on the doc's page outside the text ('page', the
   * default: "?" typed in the text is a question mark), or in the text too
   * ('editor', bound by the editor's keymap).
   */
  shortcutScope?: 'page' | 'editor'
  /** Its row's words in the shortcuts dialog, when they differ from a menu's ("Copy the doc's link"). */
  shortcutLabel?: string
  /** Its place in the dialog's Doc group, lower first. */
  shortcutOrder?: number
  edition: Edition
  /** Lower comes first; registration order breaks ties. */
  order?: number
  isEnabled?(ctx: C): boolean
  /** A toggle's state, shown as a check (Full width) or a pressed button (Bold). */
  isChecked?(ctx: C): boolean
  /**
   * Whether it is on this surface at all, now. A menu leaves out what
   * isEnabled refuses; a bar shows it disabled, and leaves out only what this
   * refuses (Comment, with nothing selected).
   */
  isVisible?(ctx: C): boolean
  run(ctx: C): void | Promise<void>
}

/** A panel beside the doc, opened as {kind, docId}. Its component loads when first opened. */
export interface PanelSpec {
  kind: string
  title: string
  edition: Edition
  load(): Promise<{ default: ComponentType<{ docId: string }> }>
}

/** A dialog opened from the doc, loaded when first opened. */
export interface DialogSpec {
  id: string
  edition: Edition
  load(): Promise<{ default: ComponentType<{ docId: string; onClose(): void }> }>
}

/** The doc shell's slots: where a package's UI goes without editing the host. */
export type ShellSlot =
  | 'crumbs'
  | 'titleChips'
  | 'rightCluster'
  | 'more'
  | 'gutter'
  | 'modes'
  | 'emptyStarter'
  | 'rootClasses'
  | 'presence'
  /** Over the doc's editor, once per editor (A9's review bar). Its component is given the editor. */
  | 'editorOverlay'
  /** Under the doc's body, once its live copy is in (C7a's Pages inside). Its component is given the editor. */
  | 'foot'
  /** Components with no UI of their own, run once for every open doc: live meta events (A6). */
  | 'session'

/** What a slot's component is given. */
export interface SlotProps {
  docId: string
  /** The doc's editor, for the slots that work on it (editorOverlay, gutter, foot); null until it exists. */
  editor?: Editor | null
}

/** A collaborator as their awareness state describes them. */
export interface PresenceUser {
  id?: string
  name?: string
  hue?: string
  [field: string]: unknown
}

/**
 * One package's piece of a slot: a component, or for 'rootClasses' the classes
 * it adds. Chat's and the calendar's slots take the same shape over their own
 * slots and props.
 */
export interface SlotContribution<S extends string = ShellSlot, P = SlotProps> {
  slot: S
  id: string
  edition: Edition
  /** Lower comes first. */
  order?: number
  load?(): Promise<{ default: ComponentType<P> }>
  classes?(ctx: { docId: string }): string[]
  /** For 'presence': adds to someone's caret as it is drawn; their hue and aria-hidden stay. */
  decorate?(caret: HTMLElement, user: PresenceUser): void
}

/** The doc commands the per-editor bus carries (I17): typed, and for one doc, unlike window events. */
export interface DocCommands {
  insertAt: { at: number | 'selection' | 'end'; content: JSONContent | string }
  replaceRange: { anchor: Anchor; content: JSONContent | string }
  openPanel: { kind: string }
  focusTitle: Record<string, never>
  /**
   * Doc AI on this doc: an action ("write", "summarize") or a prompt, about
   * the selection or the anchor. Nothing at all opens the assistant.
   */
  aiRun: { action?: string; prompt?: string; anchor?: Anchor }
  /**
   * Comment on what is selected. The doc's page opens its comments with the
   * selection quoted, unless a listener claims it first (sets claimed, as it
   * hears it): A8's anchored threads do.
   */
  comment: {
    from: number
    to: number
    claimed?: boolean
    /**
     * The blocks the block menu ran Comment on (its ctx.state.blocks), in the
     * doc's order: the comment is on those blocks, never on what lies between
     * blocks chosen apart (B7).
     */
    blocks?: string[]
  }
  /** A registered dialog (registerDialog), opened over this doc. */
  openDialog: { id: string }
  /** What the doc's shell keeps: focus mode, full width, Later, the shortcuts dialog. */
  toggle: { what: 'focusMode' | 'fullWidth' | 'saved' | 'shortcuts' }
}

/**
 * One surface's command bus (I17; chat PROGRAM.md §4.2 #28): typed, and only
 * the surface that owns it hears what is sent on it, unlike a window event, so
 * a command typed in one composer never runs in another on the same screen
 * (FE-BUG-11).
 */
export interface SurfaceCommandBus<Commands> {
  /** This surface's own: two mounted at once (split view) have a bus each. */
  readonly key: string
  emit<K extends keyof Commands>(command: K, payload: Commands[K]): void
  /** Listens for a command; the returned function stops listening. */
  on<K extends keyof Commands>(command: K, handler: (payload: Commands[K]) => void): () => void
}

/** One editor's command bus. */
export interface DocCommandBus extends SurfaceCommandBus<DocCommands> {
  readonly docId: string
}

// ----------------------------------------------------------------------- chat

/**
 * Chat's surfaces (chat PROGRAM.md §4.2 #28; A6 builds them): where a message's,
 * a conversation's and the composer's actions show. The palette is the one
 * surface every editor and page shares.
 */
export type ChatSurface =
  | 'messageHover'
  | 'messageMenu'
  | 'messageSheet'
  | 'composerTools'
  | 'conversationHeader'
  | 'conversationMore'
  | 'palette'

/**
 * The commands a conversation's composer bus carries. Today each is a window
 * event filtered by the composer's surface key ("chat-slash-command"), or a
 * callback the command runner is handed (useCommandRunner); A6 moves them onto
 * the bus.
 */
export interface ChatCommands {
  /** A command chosen in, or typed into, this composer: its name, and the text after the "/". */
  slashCommand: { command: string; typed: string; mentions?: Record<string, string> }
  /** Text a command puts into this composer (/shrug, /me), as text or as HTML. */
  insertText: { text: string }
  insertHtml: { html: string }
}

/** What a chat action knows when it runs. */
export interface MessageActionContext {
  target: Target
  /** The message it is on: none for the composer's tools and the conversation's header. */
  message?: Message
  /** The person may write here (the API's post level, or reply in a thread). */
  canPost: boolean
  bus: SurfaceCommandBus<ChatCommands>
  /** Whether the AI gate is open where it shows. */
  gate?: { ai: boolean }
}

/** One chat action, on the chat surfaces it lists. */
export type ChatAction = SurfaceAction<MessageActionContext, ChatSurface>

/** A conversation's slots (header chips, tabs, panels, the call dock), which Wave B fills without editing its hosts. */
export type ChatSlot = 'headerChips' | 'tabs' | 'panels' | 'callDock'

/** What a chat slot's component is given. */
export interface ConversationSlotProps {
  target: Target
}

/** One package's piece of a conversation's slot. */
export type ChatSlotContribution = SlotContribution<ChatSlot, ConversationSlotProps>

// ------------------------------------------------------------------- calendar

/**
 * The calendar's surfaces (calendar PROGRAM.md §4.1 #1–3; its A7 builds them):
 * the toolbar, the Calendars popover, an event's menu (the context menu and
 * the pop card's ⋯ are one list, D-CAL-20), the event panel's header, the
 * Event Form and the booking page's editor. The palette is shared.
 */
export type CalendarSurface =
  | 'calendarToolbar'
  | 'calendarsPopover'
  | 'eventMenu'
  | 'eventPanel'
  | 'eventForm'
  | 'bookingEditor'
  | 'palette'

/**
 * The commands a calendar's bus carries: today each is one of calendarApp's
 * own handlers (goTo, pickView, newEvent, openFull), which A7 moves onto the
 * bus.
 */
export interface CalendarCommands {
  /** Show the day that holds date (RFC 3339). */
  goTo: { date: string }
  pickView: { view: CalendarView }
  /** Start a new event: at a time, or with none, at the next round hour. */
  newEvent: { start?: string; end?: string }
  /** Open an event in the panel, or on a phone its page. */
  openEvent: { id: string }
}

/** What a calendar action knows when it runs. */
export interface CalendarActionContext {
  /** The event it is on: none on the toolbar and the Calendars popover. */
  event?: CalendarEvent
  /** The person may change it (its creator, today). */
  canEdit: boolean
  bus: SurfaceCommandBus<CalendarCommands>
  /** Whether the AI gate is open where it shows. */
  gate?: { ai: boolean }
}

/** One calendar action, on the calendar surfaces it lists. */
export type CalendarAction = SurfaceAction<CalendarActionContext, CalendarSurface>

/**
 * The calendar's slots, which Wave B fills without editing its hosts: the
 * toolbar, the Calendars popover, the event panel, and the Event Form's
 * fields (A2's answers, A3's local times, A5's reminders, B11's call).
 */
export type CalendarSlot = 'toolbar' | 'calendarsPopover' | 'eventPanel' | 'eventFormFields'

/** What a calendar slot's component is given. */
export interface CalendarSlotProps {
  /** The event shown, when there is one. */
  event?: CalendarEvent
}

/** One package's piece of a calendar slot. */
export type CalendarSlotContribution = SlotContribution<CalendarSlot, CalendarSlotProps>

// --------------------------------------------------------------------- tables

/**
 * Tables' surfaces (tables programme, PROGRAM.md §5; A6 and A8 build them): the
 * table's toolbar, a row's menu (the gutter's and the record's ⋯ are one list),
 * a cell's menu, the record panel's header and the view switcher. The palette
 * is shared.
 */
export type TableSurface =
  | 'tableToolbar'
  | 'tableRowMenu'
  | 'tableCellMenu'
  | 'tableRecordPanel'
  | 'tableViewSwitcher'
  | 'palette'

/**
 * The commands a table's bus carries: today each is one of the table page's
 * own handlers (open a row's record, add a row; R adds one), which A6 moves
 * onto the bus, with A2's undo and redo.
 */
export interface TableCommands {
  /** Open a row's record. */
  openRow: { id: string }
  /** Add a row, after a row or at the end. */
  addRow: { after?: string }
  undo: Record<string, never>
  redo: Record<string, never>
}

/** What a table action knows when it runs. */
export interface TableActionContext {
  tableId: string
  /** The row it is on: none on the toolbar and the view switcher. */
  rowId?: string
  /** The field it is on: a cell's menu. */
  fieldId?: string
  /** The person may write the table's rows. */
  canEdit: boolean
  /** The person may change the table itself: fields, views, settings. */
  canManage: boolean
  bus: SurfaceCommandBus<TableCommands>
  /** Whether the AI gate is open where it shows. */
  gate?: { ai: boolean }
}

// ----------------------------------------------------------------------- work

/**
 * The projects programme's surfaces (PROGRAM.md §4.2 #90 and D-PJ-18; A6 builds
 * them): a task's menu (its row's, its card's and the panel's ⋯ are one list),
 * the selection's bar on lists and boards, a view's toolbar, the task panel's
 * header, a project's header and its ⋯, the phone's action sheet. The palette
 * is shared, and its commands act on the selection.
 */
export type WorkSurface =
  | 'taskMenu'
  | 'selectionBar'
  | 'viewToolbar'
  | 'taskPanelHeader'
  | 'projectHeader'
  | 'projectMore'
  | 'workSheet'
  | 'palette'

/**
 * The commands a work view's bus carries: today each is the view's own
 * handler (the board's quick add, the list's selection, the panel's opening),
 * which A6 moves onto the bus.
 */
export interface WorkCommands {
  /** Open a task beside the view, or on a phone its page. */
  openTask: { id: string }
  /** Start a new task: in a column (a status), under a parent, or plain. */
  newTask: { status?: string; parent?: string }
  /** Select these tasks, adding to what is selected or not. */
  select: { ids: string[]; add?: boolean }
  /** Move the keyboard's place by this many rows. */
  moveFocus: { by: number }
}

/** What a work action knows when it runs. */
export interface WorkActionContext {
  /** The tasks it acts on: the one it is on, or the selection. */
  tasks: WorkTask[]
  /** The project they are in, when one view shows one project. */
  projectId?: string
  /** What the person may do there, as the server said (A1). */
  access?: WorkAccess
  bus: SurfaceCommandBus<WorkCommands>
  /** Whether the AI gate is open where it shows. */
  gate?: { ai: boolean }
}

/** One table action, on the table surfaces it lists. */
export type TableAction = SurfaceAction<TableActionContext, TableSurface>

/** A table's slots, which Wave B fills without editing its hosts: the toolbar, the record panel and a row's menu. */
export type TableSlot = 'toolbar' | 'recordPanel' | 'rowMenu'

/** What a table slot's component is given. */
export interface TableSlotProps {
  tableId: string
  /** The row shown, when there is one. */
  rowId?: string
}

/** One package's piece of a table slot. */
export type TableSlotContribution = SlotContribution<TableSlot, TableSlotProps>

/** One work action, on the work surfaces it lists. */
export type WorkAction = SurfaceAction<WorkActionContext, WorkSurface>

/**
 * The task panel's sections and a project's places, which packages fill
 * without editing their hosts (D-PJ-18): the panel's properties, its sections
 * below them, a project's header chips and its tabs.
 */
export type WorkSlot = 'taskProperties' | 'taskSections' | 'projectHeaderChips' | 'projectTabs'

/** What a work slot's component is given. */
export interface WorkSlotProps {
  /** The task shown, in the panel's slots. */
  task?: WorkTask
  projectId?: string
  access?: WorkAccess
}

/** One package's piece of a work slot. */
export type WorkSlotContribution = SlotContribution<WorkSlot, WorkSlotProps>
