"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { DocInfoInterface } from "@/types/doc"
import { app_doc_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import { addUserDoc } from "@/store/slice/userSlice"
import { X } from "@/lib/icons";
import { File as FileIcon } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn"

interface InlineDocCreatorProps {
  className?: string
  /** Controlled open state. When provided, component is fully controlled by parent. */
  isOpen?: boolean
  /** Callback when open state changes. */
  onOpenChange?: (open: boolean) => void
}

export function InlineDocCreator({ className, isOpen: controlledIsOpen, onOpenChange }: InlineDocCreatorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen
  const setIsOpen = (open: boolean) => {
    setInternalIsOpen(open)
    onOpenChange?.(open)
  }

  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { makeRequest, isSubmitting } = usePost()
  const router = useRouter()
  const dispatch = useDispatch()

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const validate = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) return "Title is required"
    if (trimmed.length < 4) return "Title must be at least 4 characters"
    if (trimmed.length > 100) return "Title must be at most 100 characters"
    return null
  }

  const handleCreate = () => {
    const validationError = validate(title)
    if (validationError) {
      setError(validationError)
      return
    }
    if (isSubmitting) return

    setError(null)
    makeRequest<{ doc_title: string; doc_private: boolean }, DocInfoInterface>({
      payload: { doc_title: title.trim(), doc_private: true },
      apiEndpoint: PostEndpointUrl.CreateDoc,
    }).then((res) => {
      if (res?.doc_uuid) {
        // Show it in the sidebar immediately (prepended, capped) instead of
        // waiting for the next sidebar refetch on reload.
        dispatch(addUserDoc({ doc: { doc_uuid: res.doc_uuid, doc_title: res.doc_title || title.trim() } }))
        router.push(`${app_doc_path}/${res.doc_uuid}`)
        setTitle("")
        setIsOpen(false)
      }
    }).catch(() => {
      // Error toast is shown by usePost; we just keep the input open
      setError("Failed to create document. Please try again.")
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleCreate()
    }
    if (e.key === "Escape") {
      setIsOpen(false)
      setTitle("")
      setError(null)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    if (error) setError(null)
  }

  if (!isOpen) return null

  return (
    <div className={cn("px-2 py-1", className)}>
      <div className="flex items-center gap-1">
        <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={title}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Doc title..."
          className={cn(
            "h-7 text-xs px-2 py-0.5 flex-1",
            error && "border-destructive focus-visible:ring-destructive"
          )}
          disabled={isSubmitting}
          aria-invalid={!!error}
          aria-describedby={error ? "doc-title-error" : undefined}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => {
            setIsOpen(false)
            setTitle("")
            setError(null)
          }}
          aria-label="Cancel"
          disabled={isSubmitting}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      {error && (
        <p id="doc-title-error" className="text-[10px] text-destructive mt-0.5 pl-5" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
