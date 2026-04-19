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
import {LucideIcon, Paperclip, X} from "lucide-react";
import {Toggle} from "@/components/ui/toggle";
import {EmojiReactionPicker} from "@/components/minimal-tiptap/components/emoji-reaction/reaction-picker";

export interface MinimalTiptapProps
    extends Omit<UseMinimalTiptapEditorProps, "onUpdate"> {
  value?: Content;
  isOutputText?: boolean;
  onChange?: (value: Content) => void;
  className?: string;
  editorContentClassName?: string;
  attachmentOnclick?: ()=>void
  PrimaryButtonIcon?: LucideIcon
  children?: React.ReactNode
  ButtonIcon?: LucideIcon
  buttonOnclick?: () => Promise<void> | void;
  SecondaryButtonIcon?: LucideIcon
  secondaryButtonOnclick?: () => Promise<void> | void;
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
            editorContentClassName,
          content,
            fixedToolbarToBottom,
            onActionFiles,
          ...props
        },
        ref
    ) => {
        const {isMobile} = useMedia()

      const handleSubmit = React.useCallback(() => {
        if (buttonOnclick && !isMobile) {
            buttonOnclick();
            return true;
        }
        return false;
      }, [buttonOnclick, isMobile]);

      const editor = useMinimalTiptapEditor({
        value,
        onUpdate: onChange,
        onActionFiles,
        allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
        onSubmit: handleSubmit,
        ...props,
      });

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

           if (!(isEditorEmpty && isNewContentEmpty) && currentHtml !== c.trim()) {
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
                  "flex  w-full flex-col  rounded-md border border-input justify-between focus-within:border-primary",
                  (isOutputText? '': 'max-h-[85vh]'),
                  className
              )}
          >
            <EditorContent
                editor={editor}
                className={cn(
                    "minimal-tiptap-editor min-h-[10px] overflow-y-scroll ",
                    editorContentClassName
                )}
                content={content as string}
                ref={divRef}
                data-gramm="false"
            />
            { editor.isEditable && (
                <div   className={isMobile && fixedToolbarToBottom ?'fixed bottom-0 w-full right-0 p-2 bg-gray-50 dark:bg-gray-900 pt-0 ':""}>
                    {children}
                  <div className="flex justify-between md:mr-2 ">
                    <Toolbar editor={editor} toggledTextEditor={toggledTextEditor}  setToggledTextEditor={setToggledTextEditor} toggleToolbar={toggleToolbar}/>
                    <div className="flex justify-center items-center gap-x-2">
                        {
                            attachmentOnclick && !(isMobile && toggledTextEditor) &&
                            <Button size={"icon"} variant={'ghost'} className="rounded-full" onClick={attachmentOnclick}><Paperclip /> </Button>

                        }
                      {SecondaryButtonIcon && secondaryButtonOnclick && (
                          <Button onClick={secondaryButtonOnclick}  size={"icon"} className="bg-destructive rounded-full">
                            <SecondaryButtonIcon/>
                          </Button>
                      )}
                      {PrimaryButtonIcon && buttonOnclick && (
                          <Button onClick={buttonOnclick} size={"icon"} className="rounded-full bg-green-700"><PrimaryButtonIcon/></Button>
                      )}
                      {ButtonIcon && buttonOnclick && (
                          <Button size={"icon"} className="rounded-full" onClick={buttonOnclick}><ButtonIcon /></Button>
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
