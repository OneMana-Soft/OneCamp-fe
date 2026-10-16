"use client"

// Your name and details, one batched card (design v3, admin D1): the fields
// are typed, so they wait for the card's footer, "Saved together", and Save
// is pressed once for all of them. Two columns from 640px of CARD width (a
// container query, so the phone's dialog and a narrow window stack them),
// 32px fields, one-line helpers. Shared by the profile page and the phone's
// profile dialog, which each carried their own copy of these fields.
//
// Appear online is not here: it is a switch, so it saves the moment it
// changes, in its own card (AppearOnlineCard).

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { SettingsCard, SettingsCardFooter, SettingsRowsSkeleton, SwitchRow } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { AppLanguageCombobox } from "@/components/dialog/appLanguageCombobox"
import { Check } from "@/lib/icons"
import { normalizeHandle } from "@/lib/validation/names"
import {
  profileFormSchema,
  profileNameField,
  profileNamesPayload,
  type ProfileFormValues,
  type SavedNames,
} from "@/lib/validation/profileForm"
import { USER_STATUS_OFFLINE, USER_STATUS_ONLINE } from "@/types/user"
import { useSelfProfile } from "@/components/profile/useSelfProfile"

const NO_NAMES: SavedNames = { fullName: "", displayName: "", handle: "" }

/** The fields, batched with the card's footer. `onSaved` runs after a save that held. */
export function ProfileFieldsCard({ onSaved, onDirtyChange }: { onSaved?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const { profile, save } = useSelfProfile()
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState("")
  const [justSaved, setJustSaved] = useState(false)

  const saved = useMemo<SavedNames>(
    () => ({
      fullName: profile?.user_full_name || "",
      displayName: profile?.user_name || "",
      handle: profile?.user_handle || "",
    }),
    [profile],
  )
  const savedRef = useRef<SavedNames>(NO_NAMES)
  savedRef.current = saved

  const defaults = useMemo<ProfileFormValues>(
    () => ({
      fullName: profile?.user_full_name || "",
      displayName: profile?.user_name || "",
      handle: profile?.user_handle || "",
      jobTitle: profile?.user_job_title || "",
      hobbies: profile?.user_hobbies || "",
      language: profile?.user_app_lang || "en",
      status: profile?.user_status === USER_STATUS_ONLINE,
    }),
    [profile],
  )

  // Built for what is saved at the moment it validates, which the profile
  // only says once it has loaded.
  const resolver = useMemo<Resolver<ProfileFormValues>>(
    () => (values, context, options) => zodResolver(profileFormSchema(savedRef.current))(values, context, options),
    [],
  )
  const form = useForm<ProfileFormValues>({ resolver, defaultValues: defaults, mode: "onChange" })

  // A fresh answer (first load, or another part of the page saved) resets
  // the fields, unless the person is in the middle of editing them.
  const loaded = !!profile
  useEffect(() => {
    if (!loaded) return
    if (Object.keys(form.formState.dirtyFields).length === 0) form.reset(defaults)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, defaults])

  const dirtyCount = Object.keys(form.formState.dirtyFields).length
  const dirty = dirtyCount > 0
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  const handleValue = form.watch("handle")
  const handleState = form.formState.errors.handle
    ? "invalid"
    : normalizeHandle(handleValue || "") && normalizeHandle(handleValue || "") !== normalizeHandle(saved.handle)
      ? "valid"
      : "same"

  const onSubmit = async (data: ProfileFormValues) => {
    setProblem("")
    setSaving(true)
    const names = profileNamesPayload(data, saved)
    const outcome = await save({
      ...names,
      user_job_title: data.jobTitle || profile?.user_job_title || "",
      user_app_lang: data.language || profile?.user_app_lang || "en",
      user_hobbies: data.hobbies || profile?.user_hobbies || "",
    })
    setSaving(false)
    if (!outcome.ok) {
      // Said where it can be fixed.
      if (outcome.field === "handle") {
        form.setError("handle", { type: "server", message: outcome.message })
        form.setFocus("handle")
      } else {
        setProblem(outcome.message)
      }
      return
    }
    form.reset({ ...data, handle: names.user_handle ?? data.handle })
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 1900)
    onSaved?.()
  }

  if (!profile) {
    return (
      <SettingsCard>
        <SettingsRowsSkeleton rows={3} control="field" />
      </SettingsCard>
    )
  }

  const nameField = (name: "displayName" | "fullName", autoComplete: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{profileNameField(name).label}</FormLabel>
          <FormControl>
            <Input {...field} autoComplete={autoComplete} />
          </FormControl>
          <FormDescription className="you-helper">{profileNameField(name).help}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SettingsCard
      dirty={dirty}
      footer={
        <SettingsCardFooter
          hint={
            justSaved ? (
              <span data-saved-tick="" className="saved-tick inline-flex items-center gap-1 font-medium">
                <Check className="size-3.5" aria-hidden="true" />
                Saved
              </span>
            ) : (
              "Saved together. Your name and handle change everywhere at once."
            )
          }
          dirty={dirty}
          saving={saving}
          saveDisabled={Object.keys(form.formState.errors).length > 0}
          onSave={() => void form.handleSubmit(onSubmit)()}
          onReset={() => {
            setProblem("")
            form.reset(defaults)
          }}
        />
      }
    >
      <span className="sr-only" role="status" aria-live="polite">
        {justSaved ? "Saved" : ""}
      </span>
      <Form {...form}>
        <form
          id="profile-fields"
          onSubmit={form.handleSubmit(onSubmit)}
          className="you-fields @container set-row"
          aria-label="Your name and details"
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 @min-[640px]:grid-cols-2">
            {nameField("displayName", "nickname")}
            {nameField("fullName", "name")}
            <FormField
              control={form.control}
              name="handle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{profileNameField("handle").label}</FormLabel>
                  <div className="relative">
                    <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-3">
                      @
                    </span>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="pl-6 pr-8"
                      />
                    </FormControl>
                    {handleState === "valid" && (
                      <Check
                        data-handle-ok=""
                        aria-label="This handle can be used"
                        className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-success-ink"
                      />
                    )}
                  </div>
                  <FormDescription className="you-helper">{profileNameField("handle").help}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jobTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("jobTitle")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="organization-title" placeholder="Product designer…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hobbies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hobbies</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" placeholder="Climbing, film photography…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("language")}</FormLabel>
                  <FormControl>
                    <AppLanguageCombobox onLangChange={field.onChange} userLang={field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {problem && (
            <p role="alert" className="mt-3 text-xs text-danger-ink text-pretty">
              {problem}
            </p>
          )}
          {/* Enter in a field saves, as in any form. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Form>
    </SettingsCard>
  )
}

/** Appear online: a switch, so it saves the moment it changes, in its own card. */
export function AppearOnlineCard() {
  const { profile, save } = useSelfProfile()
  const { status, run } = useSaveStatus()
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  if (!profile) return null
  const online = optimistic ?? profile.user_status === USER_STATUS_ONLINE
  const change = async (next: boolean) => {
    setOptimistic(next)
    await run(async () => {
      const outcome = await save({ user_status: next ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE })
      if (!outcome.ok) throw new Error(outcome.message)
    })
    setOptimistic(null)
  }
  return (
    <SettingsCard>
      <SwitchRow
        id="appear-online"
        label="Appear online"
        description="When off, others see you as offline even while you're here."
        checked={online}
        status={status}
        onChange={(v) => void change(v)}
      />
    </SettingsCard>
  )
}
