"use client"

// Tables B5c-2 (airtable-07's branding): the builder's Look, a form's cover and its logo. Each picture goes up
// through the app's one upload (POST /user/uploadFile, src_key "form"), the form keeps its id when it's saved, and
// the form's page asks the server for it by the form's link. A form with no logo of its own wears the workspace's,
// so that is what shows here until one is added: the builder shows what a visitor will see.

import React from "react"

import { Button } from "@/components/ui/button"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import type { ProjectForm } from "@/lib/forms/forms"
import { ImagePlus, Loader2 } from "@/lib/icons"
import { postUpload } from "@/lib/upload"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { savedFormPicture } from "@/services/formService"
import { workspaceLogoURL } from "@/services/workspaceLogo"

/** The kinds a form's picture may be (business/Form lookKinds): every browser draws them, and none can run. */
export const LOOK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export type LookKind = "cover" | "logo"
/** Pictures picked while the builder is open, by upload id: drawn from the browser's own copy until the form is saved. */
export type Picked = Readonly<Record<string, string>>

/** What a form wears, ready to draw: its own picture (picked now, or saved with it), or for a logo the workspace's. Pure. */
export function lookShown(form: Pick<ProjectForm, "token" | "cover_id" | "logo_id">, picked: Picked): { cover?: string; logo?: string } {
  const own = (kind: LookKind) => {
    const id = kind === "cover" ? form.cover_id : form.logo_id
    if (!id) return undefined
    return picked[id] ?? (form.token ? savedFormPicture(form.token, kind, id) : undefined)
  }
  return { cover: own("cover"), logo: own("logo") ?? workspaceLogoURL() }
}

export function LookSection({ form, picked, onPicked, onRemove }: {
  form: ProjectForm
  picked: Picked
  /** A picture just uploaded for the form: its upload's id, and the browser's copy to draw it from. */
  onPicked: (kind: LookKind, id: string, src: string) => void
  onRemove: (kind: LookKind) => void
}) {
  const shown = lookShown(form, picked)
  return (
    <section aria-labelledby="form-look" data-form-look-edit="" className="grid gap-3 rounded-xl bg-sunken p-3">
      <h3 id="form-look" className="text-sm font-semibold text-ink">Look</h3>
      <Picture kind="cover" form={form} src={shown.cover} own={!!form.cover_id} onPicked={onPicked} onRemove={onRemove} />
      <Picture kind="logo" form={form} src={shown.logo} own={!!form.logo_id} onPicked={onPicked} onRemove={onRemove} />
    </section>
  )
}

/** One picture's row: what it looks like now, a button to add or replace it, and one to take the form's own off. */
function Picture({ kind, form, src, own, onPicked, onRemove }: {
  kind: LookKind
  form: ProjectForm
  src?: string
  own: boolean
  onPicked: (kind: LookKind, id: string, src: string) => void
  onRemove: (kind: LookKind) => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState("")
  // A picture that can't load (the workspace has no logo, or one was taken off since) is left out, not drawn broken.
  const [broken, setBroken] = React.useState<string | null>(null)
  const label = kind === "cover" ? "Cover" : "Logo"
  const pick = async (file: File | undefined) => {
    if (!file) return
    setProblem("")
    if (!LOOK_TYPES.includes(file.type)) return setProblem("Add a PNG, JPEG, WebP or GIF picture.")
    setBusy(true)
    try {
      // OWN_ERRORS: the row says what went wrong, in the server's words, with no toast as well.
      const res = await postUpload(file, { src_key: "form", src_value: form.id || "new" }, OWN_ERRORS)
      onPicked(kind, res.data.object_uuid, URL.createObjectURL(file))
    } catch (e) {
      setProblem(apiErrorMessage(e, `Couldn't add the ${kind}. Try again.`))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }
  const draw = src && broken !== src ? src : undefined
  const hint =
    kind === "cover"
      ? "A wide picture across the top of the form: 1500 px across or more."
      : own
        ? "Over the title, on a white tile."
        : draw
          ? "Your workspace's logo, until you add one."
          : "None yet: one you add shows over the title."
  return (
    <div className="flex flex-wrap items-center gap-3" data-look={kind}>
      <span
        aria-hidden="true"
        className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg", kind === "cover" ? "h-12 w-24 bg-raised ring-1 ring-inset ring-line" : "size-12 bg-white p-1 ring-1 ring-inset ring-black/5")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin text-ink-3" />
        ) : draw ? (
          // eslint-disable-next-line @next/next/no-img-element -- the picked file, or a picture on the API's origin
          <img src={draw} alt="" className={cn("size-full", kind === "cover" ? "object-cover" : "object-contain")} onError={() => setBroken(draw)} />
        ) : (
          <ImagePlus className={cn("size-4", kind === "cover" ? "text-ink-3" : "text-zinc-400")} />
        )}
      </span>
      <span className="grid min-w-0 flex-1 basis-40 gap-0.5">
        <span className="text-ui-sm font-medium text-ink">{label}</span>
        <span className="text-meta text-ink-3">{hint}</span>
        {problem ? (
          <span role="alert" className="text-meta text-danger-ink">
            {problem}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 gap-1.5">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {own ? `Replace ${kind}` : `Add a ${kind}`}
        </Button>
        {own ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(kind)} aria-label={`Remove the ${kind}`}>
            Remove
          </Button>
        ) : null}
      </span>
      <input
        ref={input}
        type="file"
        accept={LOOK_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={`The form's ${kind} picture`}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}
