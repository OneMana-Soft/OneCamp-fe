"use client"

import * as React from 'react'
import '@/components/minimal-tiptap/styles/index.css'

import type { Content, Editor } from '@tiptap/react'
import type { UseMinimalTiptapEditorProps } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { EditorContent } from '@tiptap/react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/helpers/cn'
import { SectionOne } from '@/components/minimal-tiptap/components/section/one'
import { SectionTwo } from '@/components/minimal-tiptap/components/section/two'
import { SectionThree } from '@/components/minimal-tiptap/components/section/three'
import { SectionFour } from '@/components/minimal-tiptap/components/section/four'
import { SectionFive } from '@/components/minimal-tiptap/components/section/five'
import { LinkBubbleMenu } from '@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu'
import { useMinimalTiptapEditor } from '@/components/minimal-tiptap/hooks/use-minimal-tiptap'
import { MeasuredContainer } from '@/components/minimal-tiptap/components/measured-container'
import { useDispatch, useSelector } from 'react-redux'
import { openRightPanel } from '@/store/slice/desktopRightPanelSlice'
import { useMedia } from '@/context/MediaQueryContext'
import { Drawer } from 'vaul'
import { DocAiAssistantPanel } from '@/components/ai/DocAiAssistantPanel'
import { PostFileUploadURL, GetEndpointUrl } from "@/services/endPoints"
import axiosInstance from "@/lib/axiosInstance"
import { UploadFileInterfaceRes } from "@/types/file"
import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { HocuspocusProvider } from '@hocuspocus/provider'

export interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
    value?: Content
    onChange?: (value: Content) => void
    className?: string
    editorContentClassName?: string
    docId?: string
    provider?: HocuspocusProvider
}

const SECTION_2_ACTIONS: ("italic" | "bold" | "underline" | "strikethrough" | "code" | "clearFormatting")[] = ['italic', 'bold', 'underline', 'code', 'strikethrough', 'clearFormatting'];
const SECTION_4_ACTIONS: ("orderedList" | "bulletList")[] = ['bulletList', 'orderedList'];
const SECTION_5_ACTIONS: ("codeBlock" | "blockquote" | "horizontalRule")[] = ['blockquote', 'codeBlock', 'horizontalRule'];

const Toolbar = ({ editor, onAIClick, hasSelection }: { editor: Editor; onAIClick: () => void; hasSelection: boolean }) => (
    <div className="shrink-0 overflow-x-auto border-b border-border p-2">
        <div className="flex w-max items-center gap-px">
            <SectionOne editor={editor} activeLevels={[1, 2, 3]} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionTwo
                editor={editor}
                activeActions={SECTION_2_ACTIONS}
                mainActionCount={5}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionThree editor={editor} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFour
                editor={editor}
                activeActions={SECTION_4_ACTIONS}
                mainActionCount={2}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFive
                editor={editor}
                activeActions={SECTION_5_ACTIONS}
                mainActionCount={3}
                variant="outline"
            />
        </div>
    </div>
)

export const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, provider, ...props }, ref) => {
        const { toast } = useToast()
        const uploadFile = useUploadFile()

        const uploadFn = React.useCallback(async (file: File) => {
            if (!docId) {
                toast({
                    title: 'Error',
                    description: 'Document ID is required to upload images.',
                    variant: 'destructive'
                });
                throw new Error('docId required for image upload')
            }
            try {
                const res = await uploadFile.makeRequestToUploadToDoc([file], docId);
                if (!res || res.length === 0) {
                    throw new Error('Upload failed: no response data');
                }
                const data = res[0];
                const objUuid = data.object_uuid;
                const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') || '';
                const src = `${baseUrl}${GetEndpointUrl.GetDocAttachment}/${docId}/${objUuid}`;
                return { id: objUuid, src }
            } catch (error) {
                console.error('Doc image upload failed', error);
                const { fileToBase64 } = await import('@/components/minimal-tiptap/utils');
                const src = await fileToBase64(file);
                return { id: 'error', src };
            }
        }, [docId, toast, uploadFile]);

        }, [docId, toast, uploadFile]);

        const editor = useMinimalTiptapEditor({
            value,
            onUpdate: onChange,
            uploadFn,
            provider,
            ...props
        })

        if (!editor) {
            return null
        }

        return (
            <MeasuredContainer
                as="div"
                name="editor"
                ref={ref}
                className={cn(
                    'flex h-auto min-h-72 w-full flex-col  shadow-sm ',
                    className
                )}
            >
                <Toolbar editor={editor} onAIClick={handleAIClick} hasSelection={hasSelection} />
                <div className="flex-1 w-full relative">
                    <EditorContent editor={editor} className={cn('minimal-tiptap-editor', editorContentClassName)} />
                </div>
                <LinkBubbleMenu editor={editor} hide={suppressOverlays} />
                <SelectionAiBubbleMenu editor={editor} onAIClick={handleAIClick} hide={suppressOverlays} />

                {/* Mobile AI Drawer */}
                <Drawer.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                    <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000]" />
                        <Drawer.Content className="bg-background flex flex-col rounded-t-[20px] h-[85vh] mt-24 fixed bottom-0 left-0 right-0 z-[1001] outline-none border-t border-border">
                            <Drawer.Title className="sr-only">AI Assistant</Drawer.Title>
                            <Drawer.Description className="sr-only">AI powered document assistant for writing and transforming text.</Drawer.Description>
                            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted my-4" />
                            <div className="flex-1 overflow-y-auto">
                                <DocAiAssistantPanel 
                                    selectedText={selectedText} 
                                    docId={docId || ''} 
                                    onClose={() => setIsDrawerOpen(false)}
                                />
                            </div>
                        </Drawer.Content>
                    </Drawer.Portal>
                </Drawer.Root>
                </Drawer.Root>
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapThree'

export default MinimalTiptapDocInput