"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Settings, ImagePlus, Trash2, Mail, Save, RefreshCw } from "lucide-react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"

interface EmailConfigResponse {
  has_logo: boolean
  sender_email: string
  invitation_email_subject: string
  invitation_email_template: string
}

const DEFAULT_SUBJECT = "You're invited to OneCamp!"
const DEFAULT_TEMPLATE = `<h2>Welcome to OneCamp!</h2>
{{logo_image}}
<p>You've been invited to join. Click the link below to set up your account:</p>
<p><a href="{{signup_link}}">Accept Invitation</a></p>
<p>This link expires in 7 days.</p>`

const EmailSettingsCard = () => {
  const { data: configData, isLoading, mutate } = useFetch<{ data: EmailConfigResponse }>(GetEndpointUrl.GetEmailConfig)
  const post = usePost()
  const { toast } = useToast()
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    sender_email: "",
    subject: "",
    template: ""
  })
  
  const [hasLogo, setHasLogo] = useState(false)
  const [logoTs, setLogoTs] = useState(Date.now()) // Used to force refresh the logo image

  // Keep a reference to the "original" data straight from the server for dirty checking
  const [originalData, setOriginalData] = useState({
    sender_email: "",
    subject: "",
    template: ""
  })

  useEffect(() => {
    if (configData?.data) {
      const data = configData.data
      const initialForm = {
        sender_email: data.sender_email || "noreply@onemana.dev",
        subject: data.invitation_email_subject || DEFAULT_SUBJECT,
        template: data.invitation_email_template || DEFAULT_TEMPLATE,
      }
      setFormData(initialForm)
      setOriginalData(initialForm)
      setHasLogo(data.has_logo || false)
    }
  }, [configData])

  const isDirty = 
    formData.sender_email !== originalData.sender_email ||
    formData.subject !== originalData.subject ||
    formData.template !== originalData.template

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
    } catch (e) {
      // Error handled by usePost
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
        title: "File too large",
        description: "Logo must be less than 2MB",
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
        toast({ title: "Success", description: "Email logo uploaded successfully." })
      } else {
          toast({ title: "Error", description: res.data.msg || "Failed to upload logo", variant: "destructive" })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.msg || "Failed to upload logo",
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
    } catch (e) {
      // Handled by usePost
    }
  }

  const getPublicLogoUrl = () => {
    const backendDomain = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000"
    return `${backendDomain}/public/email/logo?ts=${logoTs}`
  }

  // Safe URL for preview so anchor tags don't break
  const previewHtml = formData.template
    .replace(/\{\{signup_link\}\}/g, 'https://onecamp.onemana.dev/signup?token=preview')
    .replace(/\{\{logo_image\}\}/g, hasLogo ? `<img src="${getPublicLogoUrl()}" alt="Logo" style="max-height:80px; max-width:200px;" />` : '')

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            Email Settings
          </CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Configure the sender address and template for automated invitation emails.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="px-0 flex-1 overflow-y-auto pr-4 custom-scrollbar pb-10 min-h-0">
        {isLoading ? (
          <div className="text-sm text-muted-foreground animate-pulse">Loading configuration...</div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-8 lg:gap-12 h-full">
            {/* Form Section */}
            <div className="space-y-6 flex-1 min-w-[50%]">
              
              {/* Logo Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Email Logo</h3>
                </div>
                <div className="p-4 rounded-lg border border-border bg-card/50 flex flex-col items-start gap-4">
                  {hasLogo ? (
                    <div className="w-full space-y-4">
                      <div className="bg-white p-4 rounded border flex items-center justify-center min-h-[100px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={getPublicLogoUrl()} 
                          alt="Email Logo" 
                          className="max-h-[80px] max-w-[200px] object-contain"
                        />
                      </div>
                      <Button variant="destructive" size="sm" onClick={handleRemoveLogo} disabled={post.isSubmitting}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Logo
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full text-center p-6 border-2 border-dashed rounded-lg text-muted-foreground flex flex-col items-center gap-2 transition-colors hover:border-primary/50 hover:bg-muted/50">
                      <ImagePlus className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No logo uploaded</p>
                      <p className="text-xs">PNG, JPEG, WebP, SVG up to 2MB</p>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Select Image
                      </Button>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    onChange={handleLogoUpload}
                  />
                </div>
              </div>

              <Separator />

              {/* Template Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Message Template</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="senderEmail">Sender Email Address</Label>
                    <Input 
                      id="senderEmail" 
                      type="email" 
                      placeholder="noreply@yourdomain.com" 
                      value={formData.sender_email}
                      onChange={(e) => setFormData({...formData, sender_email: e.target.value})}
                    />
                  </div>
                  
                  <div className="grid gap-2">
                    <Label htmlFor="subject">Email Subject</Label>
                    <Input 
                      id="subject" 
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="template">HTML Template</Label>
                      <Button variant="ghost" size="sm" onClick={handleResetToDefault} className="h-8 text-xs px-2">
                        <RefreshCw className="h-3 w-3 mr-1" /> Reset to Default
                      </Button>
                    </div>
                    <Textarea 
                      id="template" 
                      className="font-mono text-xs min-h-[250px]"
                      value={formData.template}
                      onChange={(e) => setFormData({...formData, template: e.target.value})}
                      placeholder="HTML goes here..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Available variables: <code className="bg-muted px-1 rounded">{"{{signup_link}}"}</code>, <code className="bg-muted px-1 rounded">{"{{logo_image}}"}</code>
                    </p>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button 
                    onClick={handleSaveConfig} 
                    disabled={!isDirty || post.isSubmitting}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </div>

            </div>

            {/* Preview Section */}
            <div className="flex-1 w-full xl:max-w-md 2xl:max-w-lg space-y-4 xl:sticky xl:top-0 h-fit">
               <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Live Preview</h3>
                </div>
                <div className="rounded-xl border border-black/10 bg-white shadow-xl overflow-hidden text-black min-h-[450px] flex flex-col">
                  {/* macOS style header */}
                  <div className="bg-[#f6f6f6] flex items-center px-4 py-3 border-b border-[#e5e5e5]">
                    <div className="flex gap-2 mr-4">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
                      <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
                    </div>
                    <div className="text-xs font-semibold text-gray-500 text-center flex-1 pr-12">New Message</div>
                  </div>
                  {/* Email header mockup */}
                  <div className="bg-white px-6 py-4 border-b border-[#e5e5e5] text-sm space-y-2">
                    <div className="flex items-start">
                      <span className="text-gray-400 font-medium w-16">From:</span> 
                      <span className="font-medium text-gray-800 break-all">{formData.sender_email || "noreply@onemana.dev"}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-400 font-medium w-16">Subject:</span> 
                      <span className="font-bold text-gray-900">{formData.subject || "No subject"}</span>
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-400 font-medium w-16">To:</span> 
                      <span className="text-gray-500">invitee@example.com</span>
                    </div>
                  </div>
                  {/* Email body preview */}
                  <div 
                    className="p-8 prose prose-sm max-w-none flex-1 bg-white break-words"
                    dangerouslySetInnerHTML={{ __html: previewHtml || "<div class='text-gray-400 italic'>Template is empty...</div>" }}
                  />
                </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default EmailSettingsCard
