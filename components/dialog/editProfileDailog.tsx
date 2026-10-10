import { displayNameOf, handleOf, secondaryNameOf } from "@/lib/personName";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { cn } from "@/lib/utils/helpers/cn"
import {zodResolver} from "@hookform/resolvers/zod";
import {useForm, type Resolver} from "react-hook-form";

import {Button} from "@/components/ui/button";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form";
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection";
import {Input} from "@/components/ui/input";

import {useEffect, useMemo, useRef, useState} from "react";

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "../ui/dialog";

import {Avatar, AvatarFallback, AvatarImage} from "../ui/avatar";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { Camera, Loader2 } from "@/lib/icons";
import {AppLanguageCombobox} from "@/components/dialog/appLanguageCombobox";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {USER_STATUS_OFFLINE, USER_STATUS_ONLINE, UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {useUserAvatar} from "@/hooks/useUserAvatar";
import {useUploadFile} from "@/hooks/useUploadFile";
import {useConfirm} from "@/hooks/useConfirm";
import {PHOTO_NOT_UPLOADED, saveProfile} from "@/components/profile/saveProfile";
import {useTranslation} from "react-i18next";
import {useDispatch} from "react-redux";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import { AppearanceSection, CalendarSection, SigningInSection } from "@/components/profile/ProfileSettingsSections";
import { profileFormSchema, profileNamesPayload, type ProfileFormValues, type SavedNames, profileNameField } from "@/lib/validation/profileForm";

const NO_NAMES: SavedNames = { fullName: "", displayName: "", handle: "" }

interface editProfileDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const EditProfileDialog: React.FC<editProfileDialogProps> = ({
                                                                 dialogOpenState,
                                                                 setOpenState,
                                                             }) => {
    const profileInfo = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const {src: imageSrc} = useUserAvatar(profileInfo.data?.data.user_profile_object_key);

    const [selectedImage, setSelectedImage] = useState<string>("");
    const [selectedImageFile, selectedImageSetFile] = useState<FileList | null>(null);
    const uploadFile = useUploadFile()
    const confirm = useConfirm()
    const [saving, setSaving] = useState(false)
    // A failure the dialog can't place under one field: said under the fields,
    // where the person is looking, and kept until they try again.
    const [saveProblem, setSaveProblem] = useState("")
    const {t} = useTranslation()

    const dispatch = useDispatch()

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (imageSrc) {
            setSelectedImage(imageSrc);
        }
    }, [imageSrc]);

    // What is saved now: a name or handle left as it is is never checked
    // again (lib/validation/profileForm).
    const saved = useMemo<SavedNames>(() => ({
        fullName: profileInfo.data?.data.user_full_name || "",
        displayName: profileInfo.data?.data.user_name || "",
        handle: profileInfo.data?.data.user_handle || "",
    }), [profileInfo.data])
    const savedRef = useRef<SavedNames>(NO_NAMES)
    savedRef.current = saved

    useEffect(() => {
        if (profileInfo.data?.data) {
            const defaultValues: Partial<ProfileFormValues> = {
                fullName: profileInfo.data?.data.user_full_name || "",
                handle: profileInfo.data?.data.user_handle || "",
                jobTitle: profileInfo.data?.data.user_job_title || "",
                displayName: profileInfo.data?.data.user_name || "",
                language: profileInfo.data?.data.user_app_lang || "en",
                hobbies: profileInfo.data?.data.user_hobbies || "",
                status: profileInfo.data?.data.user_status == USER_STATUS_ONLINE || false
            };
            form.reset(defaultValues);
        }
    }, [profileInfo.data]);


    const removeImage = () => {
        setSelectedImage("");
        selectedImageSetFile(null);
    };

    const onSubmit = async (data: ProfileFormValues) => {
        setSaveProblem("")
        let profileKey = profileInfo.data?.data.user_profile_object_key || "";

        if (selectedImage == "" && selectedImageFile == null) {
            profileKey = "";
        }
        if (selectedImageFile) {
            const responses = await uploadFile.makeRequestToUploadToPublic(selectedImageFile)
            if (responses.length === 0) {
                // The upload answers an empty list when it failed. Saving on
                // would keep the old photo and close as if the new one were in.
                setSaveProblem(PHOTO_NOT_UPLOADED)
                return
            }
            profileKey = responses[0].object_uuid
        }

        const names = profileNamesPayload(data, saved)
        setSaving(true)
        const outcome = await saveProfile({
            ...names,
            user_job_title:
                data.jobTitle || profileInfo.data?.data.user_job_title || "",
            user_profile_object_key: profileKey,
            user_app_lang:
                data.language || profileInfo.data?.data.user_app_lang || "en",
            user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
            user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
        })
        setSaving(false)
        if (!outcome.ok) {
            // Said where it can be fixed, and the dialog stays open to fix it.
            if (outcome.field === "handle") {
                form.setError("handle", { type: "server", message: outcome.message })
                form.setFocus("handle")
            } else {
                setSaveProblem(outcome.message)
            }
            return
        }
        dispatch(updateUserInfoStatus({
            userUUID: profileInfo.data?.data.user_uuid || '',
            profileKey: profileKey,
            userName: names.user_name,
            status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE

        }))
        profileInfo.mutate({
            ...profileInfo.data,
            data: {
                ...profileInfo.data?.data,
                user_uuid: profileInfo.data?.data.user_uuid || '',
                user_name: names.user_name,
                user_full_name: names.user_full_name,
                user_handle: names.user_handle ?? profileInfo.data?.data.user_handle,
                user_job_title:
                    data.jobTitle || profileInfo.data?.data.user_job_title || "",
                user_profile_object_key: profileKey,
                user_app_lang:
                    data.language || profileInfo.data?.data.user_app_lang || "en",
                user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE

            }
        }, false)

        closeModal(); // Close dialog after a save that worked
    };

    function closeModal() {
        setOpenState(false);
    }

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const imageDataURL = reader.result as string;
                setSelectedImage(imageDataURL);
            };
            reader.readAsDataURL(file);
            selectedImageSetFile(event.target.files);
        }
    };

    // Built for what is saved at the moment it validates, which the profile
    // only says once it has loaded.
    const resolver = useMemo<Resolver<ProfileFormValues>>(
        () => (values, context, options) => zodResolver(profileFormSchema(savedRef.current))(values, context, options),
        [],
    )
    const form = useForm<ProfileFormValues>({
        resolver,
        defaultValues: {
            fullName: "",
            displayName: "",
            handle: "",
            jobTitle: "",
            hobbies: "",
            language: "en",
            status: false
        },
        mode: "onChange",
    });

    // Escape, a click outside and the close button all come here. With changes
    // not saved it asks first: it used to throw them away without a word.
    const photoChanged = selectedImageFile !== null || (selectedImage === "" && !!imageSrc)
    const requestClose = () => {
        // Read when closing, not from the last render: a typed change does not
        // re-render this dialog, so a value kept from render was stale. Fields,
        // not isDirty, which lagged a change in this form; a field set back to
        // its saved value leaves dirtyFields.
        const formChanged = Object.keys(form.formState.dirtyFields).length > 0
        if (!formChanged && !photoChanged) {
            closeModal()
            return
        }
        confirm({
            title: "Discard your profile changes?",
            description: "Your changes to your name, photo or details haven't been saved.",
            confirmText: "Discard changes",
            cancelText: "Keep editing",
            destructive: true,
            onConfirm: closeModal,
        })
    }

    const shownName = displayNameOf(profileInfo.data?.data);
    const fullName = secondaryNameOf(profileInfo.data?.data);
    const handle = handleOf(profileInfo.data?.data);
    const nameIntial = getNameInitials(shownName || "Unknown");

    // The fields take the input's own height, the language picker's: 44px on
    // a phone, 36px from md up. They asked for h-10, which drew 40px beside the
    // 36px picker once a field's own height held on a computer.
    const field = undefined

    return (
        <Dialog onOpenChange={(open) => { if (!open) requestClose() }} open={dialogOpenState}>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl md:h-[85dvh]">
                <DialogHeader className="border-b border-border px-6 py-5 text-left">
                    <DialogTitle className="text-lg font-semibold">Your profile</DialogTitle>
                    <DialogDescription>How people here see you, how OneCamp looks to you, and how you sign in.</DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-6 py-6 custom-scrollbar">
                    {/* PROFILE: the one part of this window that waits for a button.
                        Its Save sits at the end of its own fields, not at the foot of
                        the window under sections that save the moment they change. */}
                    <SettingsSection title="Profile" description="Saved together when you press Save profile.">
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={selectedImage || undefined} alt="" className="object-cover" />
                                    <AvatarFallback className={cn("text-lg", getAvatarFallbackClass(shownName || "User"))}>{nameIntial}</AvatarFallback>
                                </Avatar>
                                {/* A pointer's shortcut to the button beside it. */}
                                <label
                                    htmlFor="imageUpload"
                                    aria-hidden="true"
                                    className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                                >
                                    <Camera className="h-5 w-5 text-white" />
                                </label>
                                <Input
                                    ref={fileInputRef}
                                    id="imageUpload"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="truncate text-sm font-medium text-foreground">{shownName}</p>
                                {(fullName || handle) && (
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[fullName, handle && `@${handle}`].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                                <p className="truncate text-xs text-muted-foreground">{profileInfo.data?.data.user_email_id}</p>
                                <div className="flex flex-wrap gap-1 pt-1">
                                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                        {selectedImage ? "Change photo" : "Add a photo"}
                                    </Button>
                                    {selectedImage && (
                                        <Button type="button" variant="ghost" size="sm" onClick={removeImage}>
                                            {t('removeImage')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <Form {...form}>
                            <form id="profile-edit-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
                                <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="displayName"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{profileNameField("displayName").label}</FormLabel>
                                                <FormControl>
                                                    <Input {...f} autoComplete="nickname" className={field} />
                                                </FormControl>
                                                <FormDescription className="text-xs">{profileNameField("displayName").help}</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="fullName"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{profileNameField("fullName").label}</FormLabel>
                                                <FormControl>
                                                    <Input {...f} autoComplete="name" className={field} />
                                                </FormControl>
                                                <FormDescription className="text-xs">{profileNameField("fullName").help}</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="handle"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{profileNameField("handle").label}</FormLabel>
                                                <div className="relative">
                                                    <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                                                    <FormControl>
                                                        <Input {...f} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={cn(field, "pl-7")} />
                                                    </FormControl>
                                                </div>
                                                <FormDescription className="text-xs">{profileNameField("handle").help}</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="jobTitle"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{t('jobTitle')}</FormLabel>
                                                <FormControl>
                                                    <Input {...f} autoComplete="organization-title" className={field} placeholder="Product designer…" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="hobbies"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>Hobbies</FormLabel>
                                                <FormControl>
                                                    <Input {...f} autoComplete="off" className={field} placeholder="Climbing, film photography…" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="language"
                                        render={({ field: f }) => (
                                            <FormItem>
                                                <FormLabel>{t('language')}</FormLabel>
                                                <FormControl>
                                                    <AppLanguageCombobox
                                                        onLangChange={f.onChange}
                                                        userLang={f.value}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field: f }) => (
                                        <FormItem>
                                            <SettingsList>
                                                <SwitchRow
                                                    label="Appear online"
                                                    description="Off, others see you as offline even while you're here."
                                                    checked={!!f.value}
                                                    onChange={f.onChange}
                                                />
                                            </SettingsList>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {saveProblem && (
                                    <p role="alert" className="text-sm text-danger-ink text-pretty">{saveProblem}</p>
                                )}
                                <div className="flex justify-end">
                                    <Button
                                        disabled={uploadFile.isSubmitting || saving}
                                        type="submit"
                                    >
                                        {(uploadFile.isSubmitting || saving) && <Loader2 className="animate-spin" aria-hidden="true" />}
                                        {uploadFile.isSubmitting || saving ? "Saving…" : "Save profile"}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </SettingsSection>

                    <AppearanceSection />
                    <CalendarSection />
                    <SigningInSection />
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditProfileDialog;
