'use client'

import * as React from "react";
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

import "@/components/minimal-tiptap/styles/index.css";
import { LetterCaseCapitalizeIcon} from "@radix-ui/react-icons";
import ToolbarButton from "@/components/minimal-tiptap/components/toolbar-button";
import {useMedia} from "@/context/MediaQueryContext";
import { Paperclip, X } from "@/lib/icons";
import { LucideIcon } from "lucide-react";
import {Toggle} from "@/components/ui/toggle";
import {EmojiReactionPicker} from "@/components/minimal-tiptap/components/emoji-reaction/reaction-picker";
import { CHAT_COMMANDS, maybeDispatchSlashCommand, extractSlashCommandFromEditor } from "@/components/minimal-tiptap/extensions/slash-command/slashCommand";

export interface MinimalTiptapProps
    extends Omit<UseMinimalTiptapEditorProps, "onUpdate"> {
  value?: Content;
  isOutputText?: boolean;
  noBorder?: boolean;
  onChange?: (value: Content) => void;
  className?: string;
  editorContentClassName?: string;
  attachmentOnclick?: ()=>void
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
  SecondaryButtonIcon?: LucideIcon
  secondaryButtonOnclick?: (latestContent?: string) => Promise<void> | void;
  fixedToolbarToBottom?: boolean;
    toggleToolbar?: boolean
    onActionFiles?: (files: File[]) => void
}

const SECTION_2_ACTIONS: ("italic" | "bold" | "underline" | "strikethrough" | "code" | "clearFormatting")[] = ["italic", "bold", "code", "strikethrough"];
const SECTION_4_ACTIONS: ("orderedList" | "bulletList")[] = ["bulletList", "orderedList"];
const SECTION_5_ACTIONS: ("codeBlock" | "blockquote" | "horizontalRule")[] = ["blockquote", "codeBlock", "horizontalRule"];
const DEFAULT_ALLOWED_MIME_TYPES = ['*/*'];

const Toolbar = ({ editor, toggledTextEditor, setToggledTextEditor, toggleToolbar }: { editor: Editor, toggledTextEditor: boolean,  setToggledTextEditor: (b: boolean)=>void, toggleToolbar: boolean}) => {


  const {isMobile, isDesktop} = useMedia()
    toggleToolbar = toggleToolbar || isMobile


  return (
      <div className="shrink-0 overflow-x-auto p-1 pb-0 pl-0">
        <div className="flex w-max items-center gap-px justify-between">
          {/*<SectionOne editor={editor} activeLevels={[1, 2, 3]} variant="outline" />*/}
          {/*<Separator orientation="vertical" className="mx-2 h-7" />*/}


          {(toggleToolbar && !toggledTextEditor) ?
              <>
              <ToolbarButton
                  tooltip="Text format"
                  aria-label="Text format"
                  className="w-12"
                  variant={"outline"}
                  onClick={()=>{setToggledTextEditor(true)}}
              >
                <LetterCaseCapitalizeIcon className="size-5"/>

              </ToolbarButton>

                  <Separator orientation="vertical" className="mx-2 h-7"/>

                  <SectionFour
                  editor={editor}
                  activeActions={SECTION_4_ACTIONS}
                  mainActionCount={2}
                  variant="outline"
              />
              <EmojiReactionPicker editor={editor} />
              </>
              :
              <>
                {
                    toggleToolbar && <Toggle size={'sm'} className={''} onClick={()=>{setToggledTextEditor(false)}}><X className='p-0!'/></Toggle>
                }
                <SectionTwo
                    editor={editor}
                    activeActions={SECTION_2_ACTIONS}
                    mainActionCount={4}
                    variant="outline"
                />
                {!toggleToolbar && <><Separator orientation="vertical" className="mx-2 h-7"/>
                <SectionFour
                    editor={editor}
                    activeActions={SECTION_4_ACTIONS}
                    mainActionCount={2}
                    variant="outline"
                />
                <EmojiReactionPicker editor={editor} />
                </>}


                {isDesktop && <><Separator orientation="vertical" className="mx-2 h-7"/>
                <SectionFive
                    editor={editor}
                    activeActions={SECTION_5_ACTIONS}
                    mainActionCount={3}
                    variant="outline"
                /></>}


              </>



          }
        </div>

      </div>
  )

};

export const MinimalTiptapTextInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
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
          SecondaryButtonIcon,
          secondaryButtonOnclick,
          editable,
          children,
            attachmentOnclick,
            aiSlot,
            editorContentClassName,
          content,
            fixedToolbarToBottom,
            onActionFiles,
            output,
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

      const wrappedButtonOnclick = React.useMemo(() => {
        if (!buttonOnclick) return undefined;
        return async () => {
            // Intercept slash commands before the normal send (Send button).
            if (trySlashCommand()) return;
            const latestHtml = flushPendingChange();
            await buttonOnclick(latestHtml);
            throttleRef.current?.cancel();
        };
      }, [buttonOnclick, flushPendingChange, trySlashCommand]);

      const wrappedSecondaryButtonOnclick = React.useMemo(() => {
        if (!secondaryButtonOnclick) return undefined;
        return async () => {
            const latestHtml = flushPendingChange();
            await secondaryButtonOnclick(latestHtml);
            throttleRef.current?.cancel();
        };
      }, [secondaryButtonOnclick, flushPendingChange]);

      const slashCommands = React.useMemo(() => CHAT_COMMANDS, []);

      const editor = useMinimalTiptapEditor({
        value,
        onUpdate: onChange,
        onActionFiles,
        allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
        onSubmit: handleSubmit,
        placeholder: "Write a message...",
        slashCommands,
        output,
        throttleRef,
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

      const divRef = useRef<HTMLDivElement>(null);

        const [toggledTextEditor, setToggledTextEditor] = useState(false)



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
           const allowExternalSync =
               (!editorIsFocused && !isComposing) ||
               (isNewContentEmpty && !isEditorEmpty);

           if (allowExternalSync && !(isEditorEmpty && isNewContentEmpty) && currentHtml !== c.trim()) {
               editor.commands.setContent(c, false);
           }
        }

        if (editor.isEditable !== (editable ?? false)) {
            editor.setEditable(editable ?? false);
        }
      }, [editor, content, editable]);



      if (!editor) {
        return null;
      }

      return (
          <div
              ref={ref}
              className={cn(
                  "flex w-full flex-col overflow-hidden transition-all duration-200",
                  !isOutputText && !props.noBorder && "rounded-xl border border-input bg-background shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
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
            { editor.isEditable && (
                <div className={cn(
                    isMobile && fixedToolbarToBottom ? 'fixed bottom-0 w-full right-0 p-2 pt-0 bg-background z-[360]' : 'px-2 pb-2 pt-1'
                )}>
                    {children}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <Toolbar editor={editor} toggledTextEditor={toggledTextEditor}  setToggledTextEditor={setToggledTextEditor} toggleToolbar={toggleToolbar}/>
                    <div className="flex items-center gap-1.5 pr-1">
                        {aiSlot}
                        {
                            attachmentOnclick && !(isMobile && toggledTextEditor) &&
                            <Button size={"icon"} variant={'ghost'} className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={attachmentOnclick}><Paperclip className="h-4 w-4"/> </Button>

                        }
                      {SecondaryButtonIcon && wrappedSecondaryButtonOnclick && (
                          <Button onClick={wrappedSecondaryButtonOnclick} variant="ghost" size={"icon"} className="h-8 w-8 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10">
                            <SecondaryButtonIcon className="h-4 w-4" />
                          </Button>
                      )}
                      {PrimaryButtonIcon && wrappedButtonOnclick && (
                          <Button onClick={wrappedButtonOnclick} size={"icon"} className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"><PrimaryButtonIcon className="h-4 w-4"/></Button>
                      )}
                      {ButtonIcon && wrappedButtonOnclick && (
                          <Button size={"icon"} className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" onClick={wrappedButtonOnclick}><ButtonIcon className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                  <LinkBubbleMenu editor={editor} />
                </div>
            )}
          </div>
      );
    }
);

MinimalTiptapTextInput.displayName = "MinimalTiptapTask";

export default MinimalTiptapTextInput;
