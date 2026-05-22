"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { RefreshCw, GitBranch } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  taskId: string
  taskName: string
}

export default function CreateBranchDialog({ open, onOpenChange, onSuccess, taskId, taskName }: Props) {
  const { toast } = useToast()
  const post = usePost()
  const [branchName, setBranchName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = () => {
    const slug = taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 50)
    setBranchName(`feature/${taskId.substring(0, 8)}-${slug}`)
    setError(null)
  }

  const handleClose = () => {
    setBranchName("")
    setError(null)
    onOpenChange(false)
  }

  const handleCreate = async () => {
    setError(null)
    if (!branchName.trim()) {
      setError("Please enter a valid branch name.")
      return
    }
    // Basic git branch name validation
    if (/[~^:?*\[\\]/.test(branchName) || branchName.endsWith("/") || branchName.includes("..")) {
      setError("Invalid branch name format.")
      return
    }

    setCreating(true)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.GitHubCreateBranch,
        appendToUrl: `/${taskId}`,
        payload: { branch_name: branchName.trim() },
        showErrorToast: true,
      })
      toast({ title: "Branch Created", description: `Branch "${branchName.trim()}" created on GitHub` })
      onSuccess()
      handleClose()
    } catch {
      // Error toast handled by usePost
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else handleOpen() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> Create GitHub Branch
          </DialogTitle>
          <DialogDescription>
            A new branch will be automatically created on the linked GitHub repository.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="branch-name" className={error ? "text-destructive" : ""}>Branch Name</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="branch-name"
                placeholder="feature/task-123-description"
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value)
                  if (error) setError(null)
                }}
                className={`pl-9 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoComplete="off"
              />
            </div>
            {error ? (
              <p className="text-xs font-medium text-destructive">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                We've auto-generated a name based on the task, but you can edit it.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={creating}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !branchName.trim()}>
            {creating ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
