"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { BoardInfoInterface } from "@/types/board"
import { app_board_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import { addUserBoard } from "@/store/slice/userSlice"
import { X, LayoutDashboard } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

interface InlineBoardCreatorProps {
  className?: string
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function InlineBoardCreator({ className, isOpen: controlledIsOpen, onOpenChange }: InlineBoardCreatorProps) {
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
    makeRequest<{ board_title: string; board_private: boolean }, BoardInfoInterface>({
      payload: { board_title: title.trim(), board_private: true },
      apiEndpoint: PostEndpointUrl.CreateBoard,
    }).then((res) => {
      if (res?.board_uuid) {
        dispatch(addUserBoard({ board: { board_uuid: res.board_uuid, board_title: res.board_title || title.trim() } }))
        router.push(`${app_board_path}/${res.board_uuid}`)
        setTitle("")
        setIsOpen(false)
      }
    }).catch(() => {
      setError("Failed to create board. Please try again.")
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
        <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={title}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Board title..."
          className={cn(
            "h-7 text-xs px-2 py-0.5 flex-1",
            error && "border-destructive focus-visible:ring-destructive"
          )}
          disabled={isSubmitting}
          aria-invalid={!!error}
          aria-describedby={error ? "board-title-error" : undefined}
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
        <p id="board-title-error" className="text-[10px] text-destructive mt-0.5 pl-5" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
