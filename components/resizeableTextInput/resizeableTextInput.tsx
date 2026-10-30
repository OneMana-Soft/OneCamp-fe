"use client"

import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { useThrottle } from "@/components/minimal-tiptap/hooks/use-throttle"
import { cn } from "@/lib/utils/helpers/cn"

interface ResizableTextInputProps {
    delay?: number
    content: string
    className?: string
    placeholder?: string
    textUpdate: (content: string) =>  void
    textUpdateOnEnter?: (content: string) => Promise<void> | void
    disabled?: boolean
}

export default function ResizeableTextInput({
                                                delay = 250,
                                                content,
                                                textUpdate,
                                                className,
                                                disabled = false,
                                                placeholder,
                                                textUpdateOnEnter,
                                            }: ResizableTextInputProps) {
    const [localText, setLocalText] = useState(content)

    // Throttled text update function (preserve exact user input; avoid trimming)
    const throttledSetText = useThrottle(
        useCallback(
            (value: string) => {
                if (value !== content) {
                    textUpdate(value)
                }
            },
            [textUpdate, content],
        ),
        delay,
    )

    useEffect(() => {
        setLocalText(content)
    }, [content])

    // Handle text input changes
    const handleTextChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value
            setLocalText(newValue)
            throttledSetText(newValue)
        },
        [throttledSetText],
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Enter" && !e.shiftKey && textUpdateOnEnter) {
                e.preventDefault()
                textUpdateOnEnter(localText.trim())
            }
        },
        [textUpdateOnEnter, localText],
    )

    const classes = cn("border-0 shadow-none overflow-hidden resize-none !py-0 !min-h-[1.5rem] !px-0", className)

    // Prefer placeholder as accessible name; fall back to a generic label if empty
    const ariaLabel = placeholder ? undefined : "Editable text input"

    return (
        <Textarea
            value={localText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            rows={1}
            className={classes}
            spellCheck={false}
            style={{
                minHeight: "1.5rem",
                paddingTop: "0",
                paddingBottom: "0",
                paddingLeft: "0",
                paddingRight: "0",
            }}
            disabled={disabled}
        />
    )
}
