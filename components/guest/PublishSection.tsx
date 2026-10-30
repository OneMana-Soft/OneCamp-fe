"use client"

/**
 * "Publish as a web page", inside a doc's "Anyone with the link" card (docs
 * programme C6, D-25). One external-access model: a doc's view link can also
 * be reached at a readable address, as a script-free page the server renders,
 * with the link's own expiry and turn-off. Its owner sets the address, whether
 * search engines may find it (off unless turned on), a password, and whether
 * members may copy it. A comment link stays in the app, so only a view link
 * is published.
 */

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { CopyLinkButton } from "@/components/dialog/shareParts"
import { Copy, ExternalLink, Globe, KeyRound } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { publishLink, settingsOf, tidySlug, unpublishLink, type PublishSettings } from "@/lib/publish/publish"
import { SECRET_HINT, secretProblem } from "@/lib/publish/secret"
import type { ResourceGuestLink } from "@/services/guestService"

/** One setting: its words on the left, its switch on the right. */
function SettingRow({ label, help, checked, disabled, onChange, icon, name }: {
  label: string
  help: string
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
  icon: React.ReactNode
  name: string
}) {
  const id = React.useId()
  return (
    <div className="flex items-center gap-3 py-1.5" data-publish-setting={name}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-hover text-ink-2 [&>svg]:size-3.5">{icon}</span>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-ui-sm text-ink">{label}</span>
        <span className="block text-meta text-ink-3">{help}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

export function PublishSection({ links, publishAllowed = true, onChanged }: {
  links: ResourceGuestLink[]
  publishAllowed?: boolean
  onChanged: (link: ResourceGuestLink) => void
}) {
  const view = links.find((l) => l.capability === "view")
  const published = view?.slug ? view : undefined
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [slugDraft, setSlugDraft] = React.useState(published?.slug ?? "")
  const [passwordOpen, setPasswordOpen] = React.useState(false)
  const [passwordDraft, setPasswordDraft] = React.useState("")
  React.useEffect(() => setSlugDraft(published?.slug ?? ""), [published?.slug])

  if (!view) {
    return links.length ? (
      <p className="text-meta text-ink-3" data-publish="needs-view">
        To publish this doc as a web page, make a “Can view” link: a published page is read-only.
      </p>
    ) : null
  }
  if (!publishAllowed && !published) {
    return (
      <p className="text-meta text-ink-3" data-publish="off-for-workspace">
        This workspace doesn&apos;t let pages be published to the web.
      </p>
    )
  }

  const run = async (act: () => Promise<ResourceGuestLink>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await act()
      onChanged(next)
      return true
    } catch (err) {
      setError(apiErrorMessage(err, "That couldn't be saved. Try again in a moment."))
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = (s: PublishSettings) => run(() => publishLink(view.id, s))

  const slugTyped = tidySlug(slugDraft)
  const slugChanged = !!published && slugTyped !== "" && slugTyped !== published.slug

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-sunken p-3" aria-label="Publish as a web page" data-publish={published ? "on" : "off"}>
      <SettingRow
        name="publish"
        icon={<Globe aria-hidden="true" />}
        label="Publish as a web page"
        help={published ? "A fast, read-only page at its own address, with this link's expiry." : "Give this link a readable address, as a fast, read-only page."}
        checked={!!published}
        disabled={busy}
        onChange={(on) => void (on ? save({ indexable: false, allow_copies: false }) : run(() => unpublishLink(view.id)))}
      />
      {published ? (
        <div className="content-rise flex flex-col gap-2 md:pl-10" data-publish-options="">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (slugChanged) void save(settingsOf(published, { slug: slugTyped }))
            }}
          >
            <label title={published.url} className="field-surface flex h-11 min-w-0 basis-full cursor-text items-center sm:basis-0 sm:flex-1 rounded-md px-2.5 text-base focus-within:ring-2 focus-within:ring-brand md:h-8 md:text-ui-sm">
              <span className="shrink-0 text-ink-3" aria-hidden="true">/p/</span>
              <input
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value)}
                aria-label="The page's address"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none"
                data-publish-slug=""
              />
            </label>
            {slugChanged ? (
              <Button size="sm" type="submit" busy={busy}>
                Save
              </Button>
            ) : (
              <>
                <CopyLinkButton href={published.url} label="Copy address" className="shrink-0 max-md:h-11" />
                <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1.5 max-md:h-11">
                  <a href={published.url} target="_blank" rel="noopener noreferrer" aria-label="Open the page">
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    <span className="max-sm:sr-only">Open</span>
                  </a>
                </Button>
              </>
            )}
          </form>
          <SettingRow
            name="indexable"
            icon={<Globe aria-hidden="true" />}
            label="Let search engines find this page"
            help="Google and others may list it in their results."
            checked={!!published.indexable}
            disabled={busy}
            onChange={(on) => void save(settingsOf(published, { indexable: on }))}
          />
          <SettingRow
            name="copies"
            icon={<Copy aria-hidden="true" />}
            label="Members can copy it"
            help="People in this workspace can copy the page into their own docs."
            checked={!!published.allow_copies}
            disabled={busy}
            onChange={(on) => void save(settingsOf(published, { allow_copies: on }))}
          />
          <SettingRow
            name="password"
            icon={<KeyRound aria-hidden="true" />}
            label="Require a password"
            help={published.has_password ? "Readers enter it once on each device. A new one ends every unlock before it." : "Readers enter it once on each device."}
            checked={!!published.has_password || passwordOpen}
            disabled={busy}
            onChange={(on) => {
              if (on) setPasswordOpen(true)
              else if (published.has_password) void save(settingsOf(published, { password: "" }))
              else setPasswordOpen(false)
            }}
          />
          {passwordOpen ? (
            <form
              className="flex items-center gap-2 md:pl-10"
              data-publish-password=""
              onSubmit={async (e) => {
                e.preventDefault()
                const problem = secretProblem("password", passwordDraft)
                if (problem) {
                  setError(problem)
                  return
                }
                if (await save(settingsOf(published, { password: passwordDraft }))) {
                  setPasswordDraft("")
                  setPasswordOpen(false)
                }
              }}
            >
              <Input
                type="password"
                value={passwordDraft}
                onChange={(e) => setPasswordDraft(e.target.value)}
                placeholder={published.has_password ? "A new password" : SECRET_HINT}
                aria-label="Password"
                autoComplete="new-password"
                className="min-w-0 flex-1"
              />
              <Button size="sm" type="submit" disabled={!passwordDraft} busy={busy}>
                {published.has_password ? "Change" : "Set password"}
              </Button>
            </form>
          ) : published.has_password ? (
            <Button variant="ghost" size="sm" className="self-start text-ink-2 max-md:h-11 md:ml-10" onClick={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden="true" className="size-3.5" />
              Change the password
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-ui-sm text-danger-ink">
          {error}
        </p>
      ) : null}
    </section>
  )
}
