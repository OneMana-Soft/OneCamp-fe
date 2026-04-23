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

import { useToast } from "@/hooks/use-toast"
import { useUploadFile } from '@/hooks/useUploadFile'
import { GetEndpointUrl } from "@/services/endPoints"

export interface MinimalTiptapProps extends Omit<UseMinimalTiptapEditorProps, 'onUpdate'> {
    value?: Content
    onChange?: (value: Content) => void
    className?: string
    editorContentClassName?: string
    docId?: string
}

const Toolbar = ({ editor }: { editor: Editor }) => (
    <div className="shrink-0 overflow-x-auto border-b border-border p-2">
        <div className="flex w-max items-center gap-px">
            <SectionOne editor={editor} activeLevels={[1, 2, 3]} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionTwo
                editor={editor}
                activeActions={['italic', 'bold', 'underline', 'code', 'strikethrough', 'clearFormatting']}
                mainActionCount={5}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionThree editor={editor} variant="outline" />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFour
                editor={editor}
                activeActions={['bulletList', 'orderedList']}
                mainActionCount={2}
                variant="outline"
            />

            <Separator orientation="vertical" className="mx-2 h-7" />

            <SectionFive
                editor={editor}
                activeActions={['blockquote', 'codeBlock', 'horizontalRule']}
                mainActionCount={3}
                variant="outline"
            />
        </div>
    </div>
)

export const MinimalTiptapDocInput = React.forwardRef<HTMLDivElement, MinimalTiptapProps>(
    ({ value, onChange, className, editorContentClassName, docId, ...props }, ref) => {
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

        const editor = useMinimalTiptapEditor({
            value,
            onUpdate: onChange,
            uploadFn,
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
                <Toolbar editor={editor} />
                <EditorContent editor={editor} className={cn('minimal-tiptap-editor', editorContentClassName)} />
                <LinkBubbleMenu editor={editor} />
            </MeasuredContainer>
        )
    }
)

MinimalTiptapDocInput.displayName = 'MinimalTiptapThree'

export default MinimalTiptapDocInput