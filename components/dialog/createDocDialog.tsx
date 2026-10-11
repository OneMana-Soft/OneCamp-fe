"use client"

import { useEffect, useRef } from "react"

import { useCreateDoc } from "@/components/doc/useCreateDoc"

interface CreateDocDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

/**
 * "New doc", wherever it is asked for (⌘K, Home, the phone's +): no dialog
 * any more (content.md D27, the owner's decision). Opening it makes an
 * "Untitled" private doc and goes there with the title ready to type, as
 * Notion and Linear do; who can see it is chosen later, in Share. The name is
 * kept so every caller of openUI("createDoc") gets the new behaviour.
 */
const CreateDocDialog: React.FC<CreateDocDialogProps> = ({ dialogOpenState, setOpenState }) => {
    const { create } = useCreateDoc()
    const started = useRef(false)

    useEffect(() => {
        if (!dialogOpenState || started.current) return
        started.current = true
        void create().finally(() => {
            started.current = false
            setOpenState(false)
        })
    }, [dialogOpenState, create, setOpenState])

    return dialogOpenState ? (
        <span className="sr-only" role="status">
            Making a new doc…
        </span>
    ) : null
};

export default CreateDocDialog;
