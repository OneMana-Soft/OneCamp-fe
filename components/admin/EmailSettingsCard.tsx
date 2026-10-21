"use client"

// The invitation email: who it comes from and what it says, beside a live
// preview of it.
//
// Design v3 (admin A10): a two-column editor when there is room (the form on
// the left as cards of rows, a 340px email frame on the right: raised, r12,
// e2, a 40px sunken header with From and Subject, the body at 14/22). The
// preview follows typing after 120ms and the changed body crossfades in over
// 140ms. Narrower (a phone, a 720px column), the preview goes under the form
// behind "Preview ⌄". The form spans two cards, so it keeps the save dock.
//
// "Send me a test" waits for the server: there is no endpoint that sends a
// test invitation yet.

import { useConfirm } from "@/hooks/useConfirm"
import { displayNameOf } from "@/lib/personName"
import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingRow, SettingsCard, SettingsSection } from "@/components/ui/settingsSection"
import { ChevronDown, RefreshCw, Trash2, Upload } from "@/lib/icons"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { AdminGet, AdminPost } from "@/services/endpoints/admin"
import { useToast } from "@/hooks/use-toast"
import { sanitizeImportedDocument } from "@/lib/sanitizeHtml"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import axiosInstance from "@/lib/axiosInstance"

interface EmailConfigResponse {
  has_logo: boolean
  /** The sender an admin chose, or "" for none. */
  sender_email: string
  /** Where invitations come from when no sender is chosen. */
  default_sender?: string
  /** What is sent: one never changed reads as today's default. */
  invitation_email_subject: string
  invitation_email_template: string
}

// Today's defaults, as the server has them (business/User/invitationEmail.go):
// the email says who invited them and to which workspace, and a reply goes to
// whoever invited them.
// The inviter's name is in the body, never the subject: a display name is
// whatever its owner typed, and the subject is shown before anyone opens the
// email. In a subject, {{inviter_name}} reads "A teammate" (the server's
// RenderInvitation does the same).
export const DEFAULT_SUBJECT = "You're invited to join {{workspace_url}} on OneCamp"
const DEFAULT_TEMPLATE = `<h2>{{inviter_name}} invited you to OneCamp</h2>
{{logo_image}}
<p>{{inviter_name}} invited you to join them at {{workspace_url}}.</p>
<p><a href="{{signup_link}}">Accept the invitation</a></p>
<p>The link works for 7 days. Reply to this email to reach {{inviter_name}}.</p>`

/** How long typing settles before the preview follows. */
export const PREVIEW_DEBOUNCE_MS = 120

/** The subject as sent: {{inviter_name}} is "A teammate" there, never the inviter's own name. Pure. */
export function subjectPreview(subject: string, workspace: string): string {
  return fillPreview(subject, { inviter_name: "A teammate", workspace_url: workspace })
}

/** Fills the variables an invitation's subject and template can use, for the preview. Pure. */
export function fillPreview(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole))
}

/**
 * The preview's body as a document of its own, for a sandboxed frame: the
 * email's own markup with a mail client's plain defaults, none of the app's,
 * at 14/22.
 */
function previewDocument(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:20px;background:#fff;color:#1a1a1a;font:14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;overflow-wrap:anywhere}
a{color:#1a56db}img{max-width:100%}h1,h2,h3{line-height:1.3}.empty{color:#888;font-style:italic}
</style></head><body>${body}</body></html>`
}

/**
 * A value that follows another after it has been still for `ms`, or at once
 * when `now` (the form was just filled, saved or put back).
 */
function useSettled<T>(value: T, ms: number, now: boolean): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (now) {
      setSettled(value)
      return
    }
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms, now])
  return now ? value : settled
}

type EmailForm = { sender_email: string; subject: string; template: string }

const sameForm = (a: EmailForm, b: EmailForm) =>
  a.sender_email === b.sender_email && a.subject === b.subject && a.template === b.template

const EmailSettingsCard = () => {
  const { data: configData, isLoading, isError, mutate } = useFetch<{ data: EmailConfigResponse }>(AdminGet.GetEmailConfig)
  // The preview names whoever is looking as the one inviting.
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const post = usePost()
  const confirm = useConfirm()
  const { toast } = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<EmailForm>({ sender_email: "", subject: "", template: "" })
  const [hasLogo, setHasLogo] = useState(false)
  const [logoTs, setLogoTs] = useState(Date.now()) // Used to force refresh the logo image
  const [previewOpen, setPreviewOpen] = useState(false)

  // What the server holds, for telling an edit from the saved text.
  const [originalData, setOriginalData] = useState<EmailForm>({ sender_email: "", subject: "", template: "" })
  // The form is filled once. A later answer (SWR refetches on focus) only moves
  // the baseline: it used to overwrite the form, wiping an edit in progress.
  const filled = useRef(false)

  useEffect(() => {
    if (!configData?.data) return
    const data = configData.data
    const server: EmailForm = {
      // Empty when unset, NOT a literal address. This used to prefill our own
      // domain, which is not the customer's: an admin who opened this screen
      // and pressed Save adopted it as their sender, and their invitations
      // then failed SPF from a domain they do not own. Empty is also correct
      // rather than merely safe, because the backend already computes
      // noreply@<this install's domain> when no sender is configured. Showing
      // nothing lets that default stand.
      sender_email: data.sender_email || "",
      subject: data.invitation_email_subject || DEFAULT_SUBJECT,
      template: data.invitation_email_template || DEFAULT_TEMPLATE,
    }
    setOriginalData(server)
    setHasLogo(data.has_logo || false)
    if (!filled.current) {
      filled.current = true
      setFormData(server)
    }
  }, [configData])

  const isDirty = filled.current && !sameForm(formData, originalData)

  const handleSaveConfig = async () => {
    if (post.isSubmitting) return

    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.UpdateEmailConfig,
        payload: {
          sender_email: formData.sender_email,
          invitation_email_subject: formData.subject,
          invitation_email_template: formData.template
        },
        showToast: true
      })
      // Update our baseline for dirty checking
      setOriginalData(formData)
    } catch {
      // usePost says why, in one toast.
    }
  }

  const handleResetToDefault = () => {
    setFormData(prev => ({
      ...prev,
      subject: DEFAULT_SUBJECT,
      template: DEFAULT_TEMPLATE
    }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Quick frontend validation: 2MB max
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Couldn't upload the logo",
        description: "It must be 2 MB or smaller.",
        variant: "destructive"
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const formDataUpload = new FormData()
    formDataUpload.append("logo", file)

    try {
      const res = await axiosInstance.post(PostEndpointUrl.UploadEmailLogo, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      if (res.data.status !== "failed") {
        setHasLogo(true)
        setLogoTs(Date.now())
        toast({ title: "Logo uploaded" })
      } else {
        toast({ title: "Couldn't upload the logo", description: res.data.msg || "Try another image.", variant: "destructive" })
      }
    } catch (error) {
      toast({
        title: "Couldn't upload the logo",
        description: apiErrorMessage(error, "Try again in a moment."),
        variant: "destructive"
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    try {
      await post.makeRequest({
        apiEndpoint: AdminPost.DeleteEmailLogo,
        method: "DELETE",
        showToast: true
      })
      setHasLogo(false)
    } catch {
      // usePost says why, in one toast.
    }
  }

  const getPublicLogoUrl = () => {
    const backendDomain = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000"
    return `${backendDomain}/public/email/logo?ts=${logoTs}`
  }

  // Safe URL for preview so anchor tags don't break. Built from this install's
  // own address; it was hard-coded to ours, so every customer's preview showed
  // them a link to somebody else's workspace.
  const appURL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "")
  const previewSignupLink = `${appURL}/signup?token=preview`
  const previewWorkspace = appURL.replace(/^https?:\/\//, "") || (typeof window !== "undefined" ? window.location.host : "")
  const previewInviter = displayNameOf(selfProfile.data?.data) || "Your name"
  // The preview follows the form once typing settles.
  const shown = useSettled(formData, PREVIEW_DEBOUNCE_MS, !isDirty)
  const previewHtml = fillPreview(shown.template, {
    signup_link: previewSignupLink,
    logo_image: hasLogo ? `<img src="${getPublicLogoUrl()}" alt="Logo" style="max-height:80px; max-width:200px;" />` : "",
    inviter_name: previewInviter,
    workspace_url: previewWorkspace,
  })
  const previewSubject = subjectPreview(shown.subject, previewWorkspace)
  // Each settled change remounts the body, so it crossfades in.
  const versions = useRef<{ html: string; n: number }>({ html: "", n: 0 })
  if (versions.current.html !== previewHtml) versions.current = { html: previewHtml, n: versions.current.n + 1 }

  let body: React.ReactNode
  if (isLoading && !configData) {
    body = (
      <div aria-busy="true" aria-label="Loading the invitation email" className="@container">
        <div className="grid gap-6 @min-[820px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3" aria-hidden="true">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" aria-hidden="true" />
        </div>
      </div>
    )
  } else if (isError && !configData) {
    // No form: its fields would be empty, and saving them would replace the
    // invitation's subject and template with nothing.
    body = <ErrorState subject="the invitation email" onRetry={() => void mutate()} />
  } else {
    body = (
      <div className="@container">
        <div className="grid gap-6 @min-[820px]:grid-cols-[minmax(0,1fr)_340px] @min-[820px]:items-start">
          <div className="min-w-0 space-y-6">
            <SettingsSection level={3} title="Logo">
              <SettingsCard>
                <div className="set-row">
                  {hasLogo ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex h-20 min-w-[160px] items-center justify-center rounded-lg bg-white p-3 ring-1 ring-inset ring-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getPublicLogoUrl()}
                          alt="The logo invitation emails carry"
                          className="max-h-14 max-w-[200px] object-contain"
                        />
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={post.isSubmitting}
                        onClick={() =>
                          confirm({
                            title: "Remove the email logo?",
                            description: "Invitation emails go out without a logo until you upload one again.",
                            confirmText: "Remove logo",
                            destructive: true,
                            onConfirm: () => void handleRemoveLogo(),
                          })
                        }
                      >
                        <Trash2 aria-hidden="true" />
                        Remove logo
                      </Button>
                    </div>
                  ) : (
                    <button type="button" data-logo-drop="" className="cfg-drop w-full" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="cfg-drop-glyph size-5 text-ink-3" aria-hidden="true" />
                      <span className="text-sm text-muted-foreground">No logo yet. Choose an image</span>
                      <span className="text-xs text-ink-3">PNG, JPEG, WebP or SVG, up to 2 MB</span>
                    </button>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    aria-label="Choose a logo image"
                    onChange={handleLogoUpload}
                  />
                </div>
              </SettingsCard>
            </SettingsSection>

            <SettingsSection level={3} title="Message">
              <SettingsCard>
                <SettingRow
                  label="Sender address"
                  description="Empty sends from your workspace's domain. Any address you set must be on a domain you control."
                  controlId="senderEmail"
                  control="field"
                >
                  <Input
                    id="senderEmail"
                    name="sender-email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={configData?.data?.default_sender || "noreply@yourdomain.com"}
                    value={formData.sender_email}
                    onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
                    aria-describedby="senderEmail-desc"
                    className="w-full @xl:w-64"
                  />
                </SettingRow>

                <SettingRow layout="stacked" label="Subject" controlId="subject">
                  <Input
                    id="subject"
                    name="invitation-subject"
                    autoComplete="off"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </SettingRow>

                <div className="set-row space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="template" className="text-sm font-medium leading-5">Template (HTML)</Label>
                    <Button variant="ghost" size="sm" onClick={handleResetToDefault}>
                      <RefreshCw aria-hidden="true" /> Reset to default
                    </Button>
                  </div>
                  <Textarea
                    id="template"
                    name="invitation-template"
                    className="min-h-[220px] font-mono text-2xs"
                    value={formData.template}
                    onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                    placeholder="HTML goes here…"
                    aria-describedby="template-help"
                  />
                  <p id="template-help" className="text-xs text-muted-foreground text-pretty">
                    Variables: <code className="font-mono text-2xs">{"{{inviter_name}}"}</code> (a subject says
                    &ldquo;A teammate&rdquo;), <code className="font-mono text-2xs">{"{{workspace_url}}"}</code>,{" "}
                    <code className="font-mono text-2xs">{"{{signup_link}}"}</code>,{" "}
                    <code className="font-mono text-2xs">{"{{logo_image}}"}</code>. Replies go to whoever invited them.
                  </p>
                </div>
              </SettingsCard>
            </SettingsSection>

            {/* The form spans two cards, so its edits wait in the dock. */}
            <SaveBar
              dirty={isDirty}
              saving={post.isSubmitting}
              onSave={() => void handleSaveConfig()}
              onDiscard={() => setFormData(originalData)}
              what="invitation email changes"
            />
          </div>

          {/* The email as it is sent, in a frame of its own: raised, r12, e2. */}
          <section aria-labelledby="email-preview-title" className="min-w-0 space-y-3 @min-[820px]:sticky @min-[820px]:top-4">
            <button
              type="button"
              aria-expanded={previewOpen}
              aria-controls="email-preview"
              onClick={() => setPreviewOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring @min-[820px]:hidden"
            >
              Preview
              <ChevronDown className={cn("size-4 text-ink-3 transition-transform duration-150", previewOpen && "rotate-180")} aria-hidden="true" />
            </button>
            <h3 id="email-preview-title" className="hidden text-sm font-medium text-foreground @min-[820px]:block">
              Preview
            </h3>
            <div id="email-preview" data-email-frame="" className={cn("cfg-mail", previewOpen ? "block" : "hidden @min-[820px]:block")}>
              <dl className="cfg-mail-head text-2xs">
                <dt className="text-ink-3">From</dt>
                <dd className="truncate font-medium text-foreground">
                  {formData.sender_email || configData?.data?.default_sender || <span className="text-muted-foreground">your workspace default</span>}
                </dd>
                <dt className="text-ink-3">Subject</dt>
                <dd className="truncate font-medium text-foreground">{previewSubject || "No subject"}</dd>
              </dl>
              {/* Sandboxed: nothing in a template can run here. */}
              <div key={versions.current.n} className="cfg-mail-body" data-fresh={versions.current.n > 1 ? "true" : undefined}>
                <iframe
                  title="The invitation email, as it is sent"
                  sandbox=""
                  srcDoc={previewDocument(sanitizeImportedDocument(previewHtml) || "<p class='empty'>The template is empty.</p>")}
                  className="block h-[380px] w-full border-0 bg-white"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <SettingsSection
      id="email-templates"
      title="Invitation email"
      description="Who invitations come from and what they say. The preview shows the email as it is sent."
    >
      {body}
    </SettingsSection>
  )
}

export default EmailSettingsCard
