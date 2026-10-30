"use client"

import * as React from "react"

import { ChromeSheet } from "@/components/docEditor/chrome/Sheet"
import { InlineError } from "@/components/docEditor/chrome/parts"
import { NodeMark } from "@/components/docFiles/NodeMark"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { checkLinkUrl, linkProvider, linkSite } from "@/lib/docs/docNode"
import { isComposingKey } from "@/lib/keys/ime"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { createLink, type NodePlace } from "@/services/docFilesService"

/**
 * Add a link (docs F1b): a document that lives somewhere else (a Google Doc,
 * a Figma file, a folder in Drive) as a row of its own, opening in a new tab.
 * https only, checked as the server checks it (lib/docs/docNode
 * checkLinkUrl, through the shared URL check); a wrong one is said in its
 * field, never sent. Its name is optional: the server reads the site's title
 * when it's left empty.
 */
export function AddLinkDialog({ place, onClose }: { place: NodePlace; onClose: () => void }) {
  const [url, setUrl] = React.useState("")
  const [name, setName] = React.useState("")
  const [problem, setProblem] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const checked = checkLinkUrl(url)
  // Whose document it is, as soon as the address says.
  const provider = checked.ok ? linkProvider(checked.url) : null

  const add = async () => {
    if (busy) return
    const link = checkLinkUrl(url)
    if (!link.ok) {
      setProblem(link.problem)
      return
    }
    setBusy(true)
    setError("")
    try {
      await createLink(link.url, name, place)
      onClose()
    } catch (e) {
      setError(apiErrorMessage(e, "The link wasn't added. Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isComposingKey(e.nativeEvent)) {
      e.preventDefault()
      void add()
    }
  }

  return (
    <ChromeSheet
      onClose={onClose}
      title="Add a link"
      description="A Google Doc, a Figma file, a folder in Drive: anything at an https:// address. It opens in a new tab."
      data-add-link-dialog=""
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} disabled={!url.trim()} onClick={() => void add()} className="gap-1.5">
            Add link
          </Button>
        </>
      }
    >
      <Field label="Link" error={problem || undefined}>
        <Input
          autoFocus
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          placeholder="https://"
          onChange={(e) => {
            setUrl(e.target.value)
            setProblem("")
          }}
          onBlur={() => {
            if (url.trim() && !checked.ok) setProblem(checked.problem)
          }}
          onKeyDown={onEnter}
        />
      </Field>
      {provider ? (
        <p data-link-provider={provider.id} className="-mt-2 flex items-center gap-2 text-ui-sm text-ink-2">
          <NodeMark node={{ id: "new-link", kind: "link", linkUrl: checked.ok ? checked.url : "" }} size={16} />
          {provider.id === "site" ? provider.name : `${provider.name} · ${linkSite(checked.ok ? checked.url : "")}`}
        </p>
      ) : null}
      <Field label="Name (optional)" help="Left empty, it takes the site's own title.">
        <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} />
      </Field>
      <InlineError>{error}</InlineError>
    </ChromeSheet>
  )
}
