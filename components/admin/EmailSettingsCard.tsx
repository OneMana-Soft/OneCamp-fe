"use client"

import { useConfirm } from "@/hooks/useConfirm"
import { displayNameOf } from "@/lib/personName"
import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { Trash2, Mail, RefreshCw } from "@/lib/icons";
import { ImagePlus } from "lucide-react";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { sanitizeImportedDocument } from "@/lib/sanitizeHtml"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { apiErrorMessage } from "@/lib/utils/apiError"
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

/** The subject as sent: {{inviter_name}} is "A teammate" there, never the inviter's own name. Pure. */
export function subjectPreview(subject: string, workspace: string): string {
  return fillPreview(subject, { inviter_name: "A teammate", workspace_url: workspace })
}

/** Fills the variables an invitation's subject and template can use, for the preview. Pure. */
export function fillPreview(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole))
}

type EmailForm = { sender_email: string; subject: string; template: string }

const sameForm = (a: EmailForm, b: EmailForm) =>
  a.sender_email === b.sender_email && a.subject === b.subject && a.template === b.template

const EmailSettingsCard = () => {
  const { data: configData, isLoading, isError, mutate } = useFetch<{ data: EmailConfigResponse }>(GetEndpointUrl.GetEmailConfig)
  // The preview names whoever is looking as the one inviting.
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const post = usePost()
  const confirm = useConfirm()
  const { toast } = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<EmailForm>({ sender_email: "", subject: "", template: "" })
  const [hasLogo, setHasLogo] = useState(false)
  const [logoTs, setLogoTs] = useState(Date.now()) // Used to force refresh the logo image

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
        apiEndpoint: PostEndpointUrl.DeleteEmailLogo,
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
  const previewHtml = fillPreview(formData.template, {
    signup_link: previewSignupLink,
    logo_image: hasLogo ? `<img src="${getPublicLogoUrl()}" alt="Logo" style="max-height:80px; max-width:200px;" />` : "",
    inviter_name: previewInviter,
    workspace_url: previewWorkspace,
  })
  const previewSubject = subjectPreview(formData.subject, previewWorkspace)

  let body: React.ReactNode
  if (isLoading && !configData) {
    body = (
      <div aria-busy="true" aria-label="Loading the invitation email" className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-3" aria-hidden="true">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-96 w-full xl:max-w-md" aria-hidden="true" />
      </div>
    )
  } else if (isError && !configData) {
    // No form: its fields would be empty, and saving them would replace the
    // invitation's subject and template with nothing.
    body = <ErrorState subject="the invitation email" onRetry={() => void mutate()} />
  } else {
    body = (
      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <section className="space-y-3" aria-labelledby="email-logo-heading">
            {/* The workspace group's hue, as the admin menu draws Email. */}
            <h3 id="email-logo-heading" className="flex items-center gap-2 text-sm font-medium">
              <Tile hue={ADMIN_GROUP_HUE.workspace} size="sm">
                <ImagePlus />
              </Tile>
              Logo
            </h3>
            <div className="rounded-lg border border-border p-4">
              {hasLogo ? (
                <div className="w-full space-y-4">
                  <div className="flex min-h-[100px] items-center justify-center rounded-md border border-border bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPublicLogoUrl()}
                      alt="The logo invitation emails carry"
                      className="max-h-[80px] max-w-[200px] object-contain"
                    />
                  </div>
                  <Button
                    variant="outline"
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
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove logo
                  </Button>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed border-border p-6 text-center text-muted-foreground transition-colors hover:border-foreground/30">
                  <p className="text-sm">No logo yet. Invitations go out without one.</p>
                  <p className="text-xs">PNG, JPEG, WebP or SVG, up to 2 MB.</p>
                  <Button variant="secondary" size="sm" className="mt-1" onClick={() => fileInputRef.current?.click()}>
                    Choose an image
                  </Button>
                </div>
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
          </section>

          <section className="space-y-3" aria-labelledby="email-message-heading">
            <h3 id="email-message-heading" className="flex items-center gap-2 text-sm font-medium">
              <Tile hue={ADMIN_GROUP_HUE.workspace} size="sm">
                <Mail />
              </Tile>
              Message
            </h3>
            <SettingsList>
              <SettingRow
                label="Sender address"
                description="Leave it empty to send from your workspace's domain. Whatever you set must be a domain you control, or invitations are rejected as spoofed."
                controlId="senderEmail"
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
                  className="h-8 w-64"
                />
              </SettingRow>

              <div className="space-y-2 px-4 py-3">
                <Label htmlFor="subject" className="text-sm font-medium leading-5">Subject</Label>
                <Input
                  id="subject"
                  name="invitation-subject"
                  autoComplete="off"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="h-8"
                />
              </div>

              <div className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="template" className="text-sm font-medium leading-5">Template (HTML)</Label>
                  <Button variant="ghost" size="sm" onClick={handleResetToDefault} className="h-8 gap-1 px-2 text-xs">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" /> Reset to default
                  </Button>
                </div>
                <Textarea
                  id="template"
                  name="invitation-template"
                  className="min-h-[250px] font-mono text-xs"
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  placeholder="HTML goes here…"
                  aria-describedby="template-help"
                />
                <p id="template-help" className="text-xs text-muted-foreground">
                  Available variables: <code className="rounded-sm bg-muted px-1">{"{{inviter_name}}"}</code> (who sent it; a
                  subject says &ldquo;A teammate&rdquo; instead),{" "}
                  <code className="rounded-sm bg-muted px-1">{"{{workspace_url}}"}</code>,{" "}
                  <code className="rounded-sm bg-muted px-1">{"{{signup_link}}"}</code>,{" "}
                  <code className="rounded-sm bg-muted px-1">{"{{logo_image}}"}</code>. Replies go to whoever sent the
                  invitation.
                </p>
              </div>
            </SettingsList>
          </section>

          {/* Edits wait here until saved or put back, in view while the page
              scrolls; the Save button sat at the foot of a long form. */}
          <SaveBar
            dirty={isDirty}
            saving={post.isSubmitting}
            onSave={() => void handleSaveConfig()}
            onDiscard={() => setFormData(originalData)}
            what="invitation email changes"
          />
        </div>

        {/* The email as it is sent: a plain message on white, as a mail client
            shows it. It was dressed as a macOS window, with three coloured dots
            in raw hex under a heavy shadow, which is a fake screenshot. */}
        <div className="h-fit w-full flex-1 space-y-3 xl:sticky xl:top-0 xl:max-w-md 2xl:max-w-lg">
          <h3 className="text-sm font-medium">Preview</h3>
          <div className="flex min-h-[450px] flex-col overflow-hidden rounded-lg border border-border bg-white text-black">
            <div className="space-y-2 border-b border-neutral-200 px-6 py-4 text-sm">
              <div className="flex items-start">
                <span className="w-16 font-medium text-neutral-500">From</span>
                <span className="break-all font-medium text-neutral-800">
                  {formData.sender_email || configData?.data?.default_sender || (
                    <span className="italic text-neutral-500">your workspace default</span>
                  )}
                </span>
              </div>
              <div className="flex items-start">
                <span className="w-16 font-medium text-neutral-500">Subject</span>
                <span className="font-semibold text-neutral-900">{previewSubject || "No subject"}</span>
              </div>
              <div className="flex items-start">
                <span className="w-16 font-medium text-neutral-500">To</span>
                <span className="text-neutral-600">invitee@example.com</span>
              </div>
            </div>
            <SafeHtml
              as="div"
              className="prose prose-sm max-w-none flex-1 break-words bg-white p-8"
              html={previewHtml || "<div class='text-gray-400 italic'>The template is empty.</div>"}
              sanitizer={sanitizeImportedDocument}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsSection
      title="Invitation email"
      description="Who invitations come from and what they say. The preview shows the email as it is sent."
    >
      {body}
    </SettingsSection>
  )
}

export default EmailSettingsCard
