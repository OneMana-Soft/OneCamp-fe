'use client'

import * as React from "react";
import { ScheduleSendButton } from "@/components/messages/scheduleSendButton";
import {useEffect, useState, useRef} from "react";
import { EditorContent } from "@tiptap/react";
import { Content, Editor } from "@tiptap/react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers/cn";
import { SectionTwo } from "@/components/minimal-tiptap/components/section/two";
import { SectionFour } from "@/components/minimal-tiptap/components/section/four";
import { SectionFive } from "@/components/minimal-tiptap/components/section/five";
import { LinkBubbleMenu } from "@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu";
import {
  useMinimalTiptapEditor,
  UseMinimalTiptapEditorProps,
} from "@/components/minimal-tiptap/hooks/use-minimal-tiptap";

import { sanitizeRichHtml } from "@/lib/sanitizeHtml";
import { tintMentions } from "@/components/message/tintMentions";
import { canRenderStatically, mentionUserUUID } from "@/lib/utils/staticRichText";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import "@/components/minimal-tiptap/styles/index.css";
import ToolbarButton from "@/components/minimal-tiptap/components/toolbar-button";
import {useMedia} from "@/context/MediaQueryContext";
import { Paperclip, Type } from "@/lib/icons";
import { ClipButton } from "@/components/clips/ClipButton";
import { LucideIcon } from "lucide-react";
import {EmojiReactionPicker} from "@/components/minimal-tiptap/components/emoji-reaction/reaction-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorState } from "@tiptap/react";
import { CHAT_COMMANDS, maybeDispatchSlashCommand, extractSlashCommandFromEditor } from "@/components/minimal-tiptap/extensions/slash-command/slashCommand";
import { useStableCallback } from "@/hooks/useStableCallback";

interface MinimalTiptapProps
    extends Omit<UseMinimalTiptapEditorProps, "onUpdate"> {
  value?: Content;
  isOutputText?: boolean;
  noBorder?: boolean;
  /**
   * Bumped by the parent when `content` must replace what the editor holds
   * even while it has focus: a message that wasn't sent, put back. A new
   * `content` alone waits for the editor to lose focus, since it may be an
   * echo of older typing.
   */
  contentRevision?: number;
  onChange?: (value: Content) => void;
  className?: string;
  editorContentClassName?: string;
  attachmentOnclick?: ()=>void
  /**
   * Accessible names for the composer's icon-only action buttons. The icons
   * arrive as props, so only the caller knows what its button does; these
   * default to what every current caller actually means: ButtonIcon is
   * SendHorizontal in all 17 uses ("Send"), and PrimaryButtonIcon is Check
   * paired with an X in all 6 ("Save changes" / "Cancel"), which is the
   * edit-a-message flow rather than sending. So every existing caller gains a
   * correct name without being touched, and an odd one out can override.
   */
  attachmentLabel?: string
  primaryButtonLabel?: string
  buttonLabel?: string
  secondaryButtonLabel?: string
  /** Optional inline AI affordance rendered in the composer action row. */
  aiSlot?: React.ReactNode
  PrimaryButtonIcon?: LucideIcon
  children?: React.ReactNode
  ButtonIcon?: LucideIcon
  /**
   * Send handler. Receives the freshest editor HTML (already flushed past
   * the throttle window) so parents can submit the just-typed character
   * even when their `useSelector` snapshot hasn't caught up yet.
   */
  buttonOnclick?: (latestContent?: string) => Promise<void> | void;
  /**
   * Send later. When given, a clock beside Send offers a time; the handler gets
   * the freshest editor HTML (flushed like Send) and when to send it.
   */
  onSchedule?: (latestContent: string | undefined, at: Date) => Promise<unknown> | unknown;
  SecondaryButtonIcon?: LucideIcon
  secondaryButtonOnclick?: (latestContent?: string) => Promise<void> | void;
  fixedToolbarToBottom?: boolean;
    toggleToolbar?: boolean
    onActionFiles?: (files: File[]) => void
  /**
   * Puts the cursor in the message box as soon as it is ready: a new member
   * arriving in their first channel (hooks/useComposeOnArrival).
   */
  autoFocus?: boolean
  /**
   * Files are attached and uploaded, so Send has something to send with no
   * text typed: it reads as ready, as it does with text.
   */
  hasAttachments?: boolean
}

// The composer's buttons on a touch screen: 40px, from the 32px they are under a
// mouse. A thumb hit the neighbour of what it meant at 32px with 6px between.
// The formatting row and the actions row both carry it, so the toolbar
// buttons, the emoji button and every action (AI, attach, clip, send later,
// send) grow together, whoever draws them.
export const COMPOSER_ROW_TOUCH = "pointer-coarse:[&_button]:size-10"

const SECTION_2_ACTIONS: ("italic" | "bold" | "underline" | "strikethrough" | "code" | "clearFormatting")[] = ["bold", "italic", "strikethrough", "code"];
const SECTION_4_ACTIONS: ("orderedList" | "bulletList")[] = ["bulletList", "orderedList"];
const SECTION_5_ACTIONS: ("codeBlock" | "blockquote" | "horizontalRule")[] = ["blockquote", "codeBlock", "horizontalRule"];
const DEFAULT_ALLOWED_MIME_TYPES = ['*/*'];

// Memoised: the editor re-renders its host on every keystroke, and the toolbar,
// a dozen buttons with tooltips, re-rendered with it (up to ~300 ms a key on a
// slow phone). Its props are stable; each ToolbarSection subscribes to the
// editor itself and re-renders only when a button's state changes.
//
// A composer that sends (or one that asks to, with toggleToolbar) keeps its
// formatting folded behind one "Formatting" button. Thirteen formatting icons
// sat under every message box at all times, the loudest thing on a channel
// page, for marks most messages never use; the shortcuts (Ctrl+B and the rest)
// and Markdown typing work either way. Long-form fields keep the full row.
const Toolbar = React.memo(function Toolbar({ editor, toggledTextEditor, setToggledTextEditor, collapsible }: { editor: Editor, toggledTextEditor: boolean,  setToggledTextEditor: (b: boolean)=>void, collapsible: boolean}) {
  const {isDesktop} = useMedia()
  const expanded = !collapsible || toggledTextEditor

  return (
      // The row's flexible part: it scrolls sideways rather than pushing the
      // actions off the box. It was shrink-0, so on a phone the opened
      // formatting row pushed Send past the edge, where Enter is a new line and
      // there was no way left to send. Even padding above and below keeps its
      // buttons on the actions' centre line (they sat 2px lower).
      <div className={cn("min-w-0 flex-1 overflow-x-auto py-1 pr-1", COMPOSER_ROW_TOUCH)}>
        <div className="flex w-max items-center gap-px">
          {collapsible && (
              <ToolbarButton
                  tooltip={toggledTextEditor ? "Hide formatting" : "Formatting"}
                  aria-label={toggledTextEditor ? "Hide formatting" : "Show formatting"}
                  aria-pressed={toggledTextEditor}
                  isActive={toggledTextEditor}
                  onClick={()=>{setToggledTextEditor(!toggledTextEditor)}}
              >
                <Type className="size-4" strokeWidth={1.75}/>
              </ToolbarButton>
          )}
          {expanded && (
              <>
                {collapsible && <Separator orientation="vertical" className="mx-1.5 h-4"/>}
                <SectionTwo
                    editor={editor}
                    activeActions={SECTION_2_ACTIONS}
                    mainActionCount={4}
                    size="sm"
                />
                <Separator orientation="vertical" className="mx-1.5 h-4"/>
                <SectionFour
                    editor={editor}
                    activeActions={SECTION_4_ACTIONS}
                    mainActionCount={2}
                    size="sm"
                />
                {isDesktop && <><Separator orientation="vertical" className="mx-1.5 h-4"/>
                <SectionFive
                    editor={editor}
                    activeActions={SECTION_5_ACTIONS}
                    mainActionCount={3}
                    size="sm"
                /></>}
                <Separator orientation="vertical" className="mx-1.5 h-4"/>
              </>
          )}
          {/* size="sm" on every button of the row: a section given no size
              fell back to the toggle's default (min-w-9), so they were 36px
              wide beside the 32px Formatting button. */}
          <EmojiReactionPicker editor={editor} size="sm" />
        </div>
      </div>
  )

});

// Memoised: its only prop is the editor, which outlives every keystroke. It
// re-rendered with the composer on each one, link popover and all.
const MemoLinkBubbleMenu = React.memo(LinkBubbleMenu);

interface ComposerActionsProps {
  aiSlot?: React.ReactNode
  attachmentOnclick?: () => void
  attachmentLabel: string
  onActionFiles?: (files: File[]) => void
  SecondaryButtonIcon?: LucideIcon
  onSecondary?: () => void
  secondaryButtonLabel: string
  PrimaryButtonIcon?: LucideIcon
  onPrimary?: () => void
  primaryButtonLabel: string
  ButtonIcon?: LucideIcon
  onSend?: () => void
  onSchedule?: (at: Date) => void
  buttonLabel: string
  nothingToSend: boolean
}

// The row of buttons beside the formatting: attach, record a clip, send later,
// send. Memoised, with stable handlers: the editor re-renders the composer on
// every keystroke, and this row (half a dozen buttons with tooltips and two
// popovers) re-rendered with it, about 200 components a key. It changes only
// when Send changes between ready and not.
const ComposerActions = React.memo(function ComposerActions({
  aiSlot,
  attachmentOnclick,
  attachmentLabel,
  onActionFiles,
  SecondaryButtonIcon,
  onSecondary,
  secondaryButtonLabel,
  PrimaryButtonIcon,
  onPrimary,
  primaryButtonLabel,
  ButtonIcon,
  onSend,
  onSchedule,
  buttonLabel,
  nothingToSend,
}: ComposerActionsProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5 pr-1", COMPOSER_ROW_TOUCH)}>
        {aiSlot}
        {attachmentOnclick && (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button size={"icon"} variant={'ghost'} aria-label={attachmentLabel} className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={attachmentOnclick}><Paperclip className="h-4 w-4" strokeWidth={1.75}/></Button>
                </TooltipTrigger>
                <TooltipContent>{attachmentLabel}</TooltipContent>
            </Tooltip>
        )}
        {/* A clip goes where files go: the same upload as one dropped or pasted. */}
        {onActionFiles && attachmentOnclick && (
            <ClipButton onRecorded={(file) => onActionFiles([file])} />
        )}
      {SecondaryButtonIcon && onSecondary && (
          <Button aria-label={secondaryButtonLabel} onClick={onSecondary} variant="ghost" size={"icon"} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <SecondaryButtonIcon className="h-4 w-4" />
          </Button>
      )}
      {PrimaryButtonIcon && onPrimary && (
          <Button aria-label={primaryButtonLabel} onClick={onPrimary} size={"icon"} className="h-8 w-8"><PrimaryButtonIcon className="h-4 w-4"/></Button>
      )}
      {ButtonIcon && onSend && onSchedule && (
          <ScheduleSendButton onPick={onSchedule} />
      )}
      {ButtonIcon && onSend && (
          <Tooltip>
              <TooltipTrigger asChild>
                  <Button
                      aria-label={buttonLabel}
                      size={"icon"}
                      className={cn("h-8 w-8 transition-colors", nothingToSend && "bg-muted text-muted-foreground hover:bg-muted")}
                      onClick={onSend}
                  >
                      <ButtonIcon className="h-4 w-4" />
                  </Button>
              </TooltipTrigger>
              <TooltipContent>{buttonLabel} <span className="text-muted-foreground">Enter</span></TooltipContent>
          </Tooltip>
      )}
    </div>
  )
});

const LiveTextInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    (
        {
          value,
            isOutputText,
            toggleToolbar = false,

          onChange,
          className,
          PrimaryButtonIcon,
          ButtonIcon,
          buttonOnclick,
          onSchedule,
          SecondaryButtonIcon,
          secondaryButtonOnclick,
          editable,
          children,
            attachmentOnclick,
            attachmentLabel = "Attach file",
            primaryButtonLabel = "Save changes",
            buttonLabel = "Send",
            secondaryButtonLabel = "Cancel",
            aiSlot,
            editorContentClassName,
          content,
            contentRevision,
            fixedToolbarToBottom,
            onActionFiles,
            output,
            autoFocus,
            hasAttachments = false,
          ...props
        },
        ref
    ) => {
        const {isMobile} = useMedia()

      // Stable ref to the editor so the submit handlers below can flush
      // pending throttled onChange calls before invoking the parent's send
      // logic. This guarantees the parent reads the freshest content from
      // its own state, even if the user pressed Enter / clicked Send while
      // the throttle window was mid-flight.
      const editorRef = React.useRef<Editor | null>(null);
      // Throttle controls bound by the hook below. Used to flush pending
      // updates before submit and cancel them after a successful send so
      // a stale trailing-edge call cannot resurrect cleared input state.
      const throttleRef = React.useRef<{ flush: () => void; cancel: () => void } | null>(null);
      // Keep onChange in a ref so flushPendingChange has a stable identity
      // across renders, avoiding the wrappedButtonOnclick memo from
      // re-creating every keystroke.
      const onChangeRef = React.useRef(onChange);
      React.useLayoutEffect(() => {
        onChangeRef.current = onChange;
      });

      const flushPendingChange = React.useCallback((): string | undefined => {
        // First, drop any scheduled trailing-edge throttle call so it
        // cannot fire after we have manually delivered the latest content.
        throttleRef.current?.cancel();
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) return undefined;
        const out = output === 'json'
            ? ed.getJSON()
            : (output === 'text' ? ed.getText() : ed.getHTML());
        try {
            onChangeRef.current?.(out as Content);
        } catch {
            // Never block submit on a parent onChange throw.
        }
        // Always return the freshest HTML for the submit handlers, even
        // if the parent expects a different output mode in onChange.
        return ed.getHTML();
      }, [output]);

      // trySlashCommand intercepts a leading-slash message at send time. The
      // Tiptap "/" menu only fires a command when picked with no args; once the
      // user types a space (e.g. "/giphy cats", "/remind me ... in 5m") the
      // menu closes and the text would otherwise post as a literal message.
      // Here we check the composer's plain text against the registered command
      // catalog: if it's a known command we dispatch it (the surface's command
      // runner executes it), clear the composer, and return true so the caller
      // skips the normal send. Plain text or an unknown "/word" returns false
      // and sends normally. A no-op in composers without a command provider
      // (docs/comments/tasks) since maybeDispatchSlashCommand bails when none
      // is registered.
      const trySlashCommand = React.useCallback((): boolean => {
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) return false;
        const extracted = extractSlashCommandFromEditor(ed as unknown as Parameters<typeof extractSlashCommandFromEditor>[0]);
        if (!extracted) return false;
        if (!extracted.text.startsWith("/")) return false;
        if (!maybeDispatchSlashCommand(extracted.text, extracted.mentions)) return false;
        // Known command dispatched — clear the composer so the slash text
        // isn't also sent, and drop any pending throttle write.
        ed.chain().clearContent().run();
        throttleRef.current?.cancel();
        try {
            // Mirror the cleared state to the parent (Redux body) in whatever
            // output mode it expects, so the slash text doesn't linger.
            const emptyOut = output === 'json' ? ed.getJSON() : (output === 'text' ? "" : "");
            onChangeRef.current?.(emptyOut as Content);
        } catch {
            // ignore
        }
        return true;
      }, [output]);

      const handleSubmit = React.useCallback(() => {
        // Slash-command interception runs first on Enter, regardless of
        // platform, so commands work in every composer (desktop + mobile).
        if (trySlashCommand()) {
            return true;
        }
        if (buttonOnclick && !isMobile) {
            const latestHtml = flushPendingChange();
            buttonOnclick(latestHtml);
            // After the parent has consumed the latest content, cancel any
            // throttle window that might still fire on the next tick.
            throttleRef.current?.cancel();
            return true;
        }
        return false;
      }, [buttonOnclick, isMobile, flushPendingChange, trySlashCommand]);

      // The buttons' handlers keep one identity for the composer's life (they
      // call whatever the parent passed last), so the memoised action row
      // below is not rebuilt when a parent re-renders with a new closure.
      const sendNow = useStableCallback(async () => {
          // Intercept slash commands before the normal send (Send button).
          if (trySlashCommand()) return;
          const latestHtml = flushPendingChange();
          await buttonOnclick?.(latestHtml);
          throttleRef.current?.cancel();
      });
      const scheduleNow = useStableCallback(async (at: Date) => {
          const latestHtml = flushPendingChange();
          await onSchedule?.(latestHtml, at);
          throttleRef.current?.cancel();
      });
      const secondaryNow = useStableCallback(async () => {
          const latestHtml = flushPendingChange();
          await secondaryButtonOnclick?.(latestHtml);
          throttleRef.current?.cancel();
      });
      const attachNow = useStableCallback(() => attachmentOnclick?.());
      const filesNow = useStableCallback((files: File[]) => onActionFiles?.(files));
      const wrappedButtonOnclick = buttonOnclick ? sendNow : undefined;
      const wrappedOnSchedule = onSchedule ? scheduleNow : undefined;
      const wrappedSecondaryButtonOnclick = secondaryButtonOnclick ? secondaryNow : undefined;

      const slashCommands = React.useMemo(() => CHAT_COMMANDS, []);

      const editor = useMinimalTiptapEditor({
        value,
        onUpdate: onChange,
        onActionFiles,
        allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
        onSubmit: handleSubmit,
        placeholder: "Write a message…",
        slashCommands,
        output,
        throttleRef,
        // Not re-rendered by each keystroke: the editor draws the text itself,
        // and what this component shows from the editor (whether there is
        // anything to send) it subscribes to below. Every key re-rendered the
        // composer and its buttons, about 240 components a keystroke.
        // textInputRenders.test.tsx holds it.
        shouldRerenderOnTransaction: false,
        ...props,
      });

      // Keep editorRef in sync so flushPendingChange can read the freshest
      // editor HTML at submit time.
      React.useEffect(() => {
        editorRef.current = editor;
        return () => {
          editorRef.current = null;
        };
      }, [editor]);

      // The editor is built after the first render, so the cursor goes in once
      // it exists, at the end of whatever a draft already holds.
      React.useEffect(() => {
        if (!autoFocus || !editor || editor.isDestroyed) return;
        editor.commands.focus("end");
      }, [autoFocus, editor]);

      const divRef = useRef<HTMLDivElement>(null);

        const [toggledTextEditor, setToggledTextEditor] = useState(false)
        // Send reads as ready only when there is something to send: words, or
        // files attached and uploaded. Style only: the button still answers a
        // click, as it always did.
        const isEmpty = useEditorState({ editor, selector: ({ editor: e }) => e?.isEmpty ?? true }) ?? true
        const nothingToSend = isEmpty && !hasAttachments
        // Whether the editing controls show: the prop the effect below hands
        // the editor. Read from the editor while rendering, it was a render
        // behind, and nothing re-renders this for it any more.
        const canEdit = editable ?? false



        useEffect(() => {
        if (divRef.current) {
          divRef.current.addEventListener("click", handleMentionClick);
        }
        return () => {
          if (divRef.current) {
            divRef.current.removeEventListener("click", handleMentionClick);
          }
        };
      }, []);

      const handleMentionClick = (event: MouseEvent) => {
        const target = event.target as HTMLDivElement;
        if (target.classList.contains("mention")) {
          const userId = target.getAttribute("data-id")?.split("@")[0];
          if (userId) {
            // dispatch(openOtherUserProfilePopup({ userId: userId }));
          }
        }
      };

      // The contentRevision the editor last took its content at.
      const syncedRevision = useRef(contentRevision);

      useEffect(() => {
        if (!editor) return;

        if (content !== undefined) {
           const c = (content as string) || "";
           const currentHtml = editor.getHTML();

           const isEditorEmpty = editor.isEmpty || currentHtml === "<p></p>";
           const isNewContentEmpty = c.trim() === "" || c.trim() === "<p></p>";

           // CRITICAL: Do not overwrite editor content while the user is
           // actively typing or composing (IME, autocorrect, mobile
           // keyboards). The parent's `content` prop is fed back from a
           // throttled/debounced `onChange`, so an in-flight throttle
           // window can deliver a *stale* value that lags behind the
           // editor by 1-2 characters. Calling setContent with that stale
           // HTML wipes the most recent keystroke ("last character
           // disappears"). The throttle will catch up shortly, so we only
           // sync from the prop when the editor is NOT focused (i.e. user
           // is not typing) AND not in an IME composition session, or
           // when the slice was cleared (e.g. after sending — we DO want
           // to mirror the empty state back into the editor).
           const editorIsFocused = editor.isFocused;
           // ProseMirror exposes the active composition flag on the view.
           const isComposing = Boolean((editor as any).view?.composing);
           // Except when the parent says its content must replace the
           // editor's (a new contentRevision): a message that wasn't sent,
           // put back where the person may still be typing.
           const restoring = contentRevision !== syncedRevision.current;
           syncedRevision.current = contentRevision;
           const allowExternalSync =
               restoring ||
               (!editorIsFocused && !isComposing) ||
               (isNewContentEmpty && !isEditorEmpty);

           if (allowExternalSync && !(isEditorEmpty && isNewContentEmpty) && currentHtml !== c.trim()) {
               editor.commands.setContent(c, false);
               // The parent's value now IS the editor's content, so a pending
               // throttled onChange carries the state from before it: at mount,
               // the empty document. Left to fire, it wrote "" back to the
               // parent, which the clause above then mirrored as a clear, and a
               // prefilled description vanished 3 s after the form opened.
               throttleRef.current?.cancel();
           }
        }

        if (editor.isEditable !== (editable ?? false)) {
            // false: changing who may edit is not an edit. Tiptap's setEditable
            // emits "update" by default, which reached onChange as one.
            editor.setEditable(editable ?? false, false);
        }
      }, [editor, content, editable, contentRevision]);



      if (!editor) {
        return null;
      }

      return (
          <div
              ref={ref}
              className={cn(
                  "flex w-full flex-col overflow-hidden transition-colors duration-150",
                  // A hairline that darkens while you type. The orange frame and
                  // glow around the whole box on focus spent the accent on the
                  // one control that is focused nearly all the time.
                  !isOutputText && !props.noBorder && "rounded-lg border border-input bg-background focus-within:border-foreground/25",
                  (isOutputText? '': 'max-h-[85vh]'),
                  className
              )}
          >
            <EditorContent
                editor={editor}
                className={cn(
                    "minimal-tiptap-editor overflow-y-auto outline-none prose-sm sm:prose-base",
                    !isOutputText && (
                        fixedToolbarToBottom
                            ? "min-h-[30px]"
                            : "min-h-[44px] px-3 pt-3"
                    ),
                    editorContentClassName
                )}
                content={content as string}
                ref={divRef}
                data-gramm="false"
            />
            { canEdit && (
                <div className={cn(
                    isMobile && fixedToolbarToBottom ? 'fixed bottom-0 w-full right-0 p-2 pt-0 bg-background z-[360]' : 'px-2 pb-2 pt-1'
                )}>
                    {children}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <Toolbar editor={editor} toggledTextEditor={toggledTextEditor}  setToggledTextEditor={setToggledTextEditor} collapsible={toggleToolbar || isMobile || !!ButtonIcon}/>
                    <ComposerActions
                        aiSlot={aiSlot}
                        attachmentOnclick={attachmentOnclick && !(isMobile && toggledTextEditor) ? attachNow : undefined}
                        attachmentLabel={attachmentLabel}
                        onActionFiles={onActionFiles ? filesNow : undefined}
                        SecondaryButtonIcon={SecondaryButtonIcon}
                        onSecondary={wrappedSecondaryButtonOnclick}
                        secondaryButtonLabel={secondaryButtonLabel}
                        PrimaryButtonIcon={PrimaryButtonIcon}
                        onPrimary={wrappedButtonOnclick}
                        primaryButtonLabel={primaryButtonLabel}
                        ButtonIcon={ButtonIcon}
                        onSend={wrappedButtonOnclick}
                        onSchedule={wrappedOnSchedule}
                        buttonLabel={buttonLabel}
                        nothingToSend={nothingToSend}
                    />
                  </div>
                  <MemoLinkBubbleMenu editor={editor} />
                </div>
            )}
          </div>
      );
    }
);

LiveTextInput.displayName = "LiveTextInput";

// A read-only body that needs no live node view is shown as its sanitised HTML:
// no editor is built, and the text is there on the first paint. Editing, or
// content that needs the editor, gets the live component.
const StaticRichText = React.forwardRef<HTMLDivElement, { html: string; className?: string; contentClassName?: string }>(
    ({ html, className, contentClassName }, ref) => {
        const dispatch = useDispatch();
        // Each person mention in that person's hue, as their avatar is.
        const safe = React.useMemo(() => tintMentions(sanitizeRichHtml(html)), [html]);
        const onClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
            const mention = (e.target as HTMLElement).closest<HTMLElement>('span[data-type="mention"]');
            if (!mention) return;
            e.preventDefault();
            e.stopPropagation();
            const userUUID = mentionUserUUID(mention.dataset.id);
            if (userUUID) dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }));
        }, [dispatch]);
        return (
            <div ref={ref} className={cn("flex w-full flex-col overflow-hidden", className)}>
                <div className={cn("minimal-tiptap-editor overflow-y-auto outline-none prose-sm sm:prose-base", contentClassName)}>
                    <div className="ProseMirror static-rich focus:outline-none" onClick={onClick} dangerouslySetInnerHTML={{ __html: safe }} />
                </div>
            </div>
        );
    }
);
StaticRichText.displayName = "StaticRichText";

const MinimalTiptapTextInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>((props, ref) => {
    if (props.isOutputText && !props.editable && canRenderStatically(props.content)) {
        return <StaticRichText ref={ref} html={props.content} className={props.className} contentClassName={props.editorContentClassName} />;
    }
    return <LiveTextInput ref={ref} {...props} />;
});
MinimalTiptapTextInput.displayName = "MinimalTiptapTask";

export default MinimalTiptapTextInput;
