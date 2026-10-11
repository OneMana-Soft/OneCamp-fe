"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { SETTINGS_STACK, SettingsSection } from "@/components/ui/settingsSection"
import { useMedia } from "@/context/MediaQueryContext"
import { useConfirm } from "@/hooks/useConfirm"
import { AppearanceSection, CalendarSection, SigningInSection } from "@/components/profile/ProfileSettingsSections"
import { ProfileIdentityBand } from "@/components/profile/ProfileIdentityBand"
import { AppearOnlineCard, ProfileFieldsCard } from "@/components/profile/ProfileFieldsCard"
import { PROFILE_HREF } from "@/lib/adminSections"

interface editProfileDialogProps {
    dialogOpenState: boolean
    setOpenState: (state: boolean) => void
}

/**
 * "Your profile", wherever it is opened from.
 *
 * On a computer the profile is a page of the settings shell (design v3,
 * admin D1), so this goes there and closes itself: every "Profile" entry point
 * (the avatar menu, the command palette, a shortcut) dispatches the same
 * openUI("selfUserProfile") and lands on the page without each one changing.
 *
 * On a phone it stays a dialog, built from the same parts as the page: the
 * identity band, the batched fields card and the instant cards under it.
 */
const EditProfileDialog: React.FC<editProfileDialogProps> = ({ dialogOpenState, setOpenState }) => {
    const { isDesktop } = useMedia()
    const router = useRouter()
    const confirm = useConfirm()
    const dirty = useRef(false)

    useEffect(() => {
        if (!dialogOpenState || !isDesktop) return
        router.push(PROFILE_HREF)
        setOpenState(false)
    }, [dialogOpenState, isDesktop, router, setOpenState])

    if (isDesktop) return null

    // Escape, a click outside and the close button all come here. With the
    // fields changed and not saved it asks first.
    const requestClose = () => {
        if (!dirty.current) return setOpenState(false)
        confirm({
            title: "Discard your profile changes?",
            description: "Your changes to your name or details haven't been saved.",
            confirmText: "Discard changes",
            cancelText: "Keep editing",
            destructive: true,
            onConfirm: () => setOpenState(false),
        })
    }

    return (
        <Dialog onOpenChange={(open) => { if (!open) requestClose() }} open={dialogOpenState}>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl">
                <DialogHeader className="px-5 pb-3 pt-5 text-left">
                    <DialogTitle>Your profile</DialogTitle>
                    <DialogDescription>How people here see you, how OneCamp looks to you, and how you sign in.</DialogDescription>
                </DialogHeader>
                <div className={`min-h-0 flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar ${SETTINGS_STACK}`}>
                    <ProfileIdentityBand />
                    <SettingsSection title="Details" description="How people here see you.">
                        <ProfileFieldsCard onDirtyChange={(d) => { dirty.current = d }} />
                    </SettingsSection>
                    <AppearOnlineCard />
                    <AppearanceSection />
                    <CalendarSection />
                    <SigningInSection />
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default EditProfileDialog
