"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "@/lib/icons";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import {useEffect, useRef, useState} from "react";

export const MobileTextInput = () => {

    const editorRef = useRef<HTMLDivElement>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [initialHeight, setInitialHeight] = useState(126) // Default height

    useEffect(() => {
        if (!editorRef.current) return

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setInitialHeight(Math.max(entry.contentRect.height, 30) + 70)
            }
        })

        resizeObserver.observe(editorRef.current)

        return () => resizeObserver.disconnect()
    }, [])

    return(
        <DraggableDrawer isExpanded={isExpanded} setIsExpanded={setIsExpanded} initialHeight={initialHeight}>
            <div ref={editorRef}>
                <MinimalTiptapTextInput
                    attachmentOnclick={()=>{}}
                    throttleDelay={300}
                    className={cn("max-w-full rounded-xl h-auto border-none")}
                    editorContentClassName="overflow-auto mb-2"
                    output="html"
                    content={""}
                    placeholder={"Type a message..."}
                    editable={true}
                    ButtonIcon={SendHorizontal}
                    buttonOnclick={() => {
                    }}
                    fixedToolbarToBottom={true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={() => {
                    }}
                />
            </div>
        </DraggableDrawer>
    )
}