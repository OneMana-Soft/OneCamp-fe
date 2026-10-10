"use client"

import { displayNameOf, handleOf, secondaryNameOf } from "@/lib/personName";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { updateUserInfoStatus } from "@/store/slice/userSlice";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileFormSchema, profileNamesPayload, type ProfileFormValues, type SavedNames, profileNameField } from "@/lib/validation/profileForm";

import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useTranslation } from "react-i18next";

import { USER_STATUS_OFFLINE, USER_STATUS_ONLINE, UserProfileInterface } from "@/types/user";
import { GetEndpointUrl } from "@/services/endPoints";
import { PHOTO_NOT_UPLOADED, saveProfile } from "@/components/profile/saveProfile";
import { useUserAvatar } from "@/hooks/useUserAvatar";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppLanguageCombobox } from "@/components/dialog/appLanguageCombobox";
import { Camera, Loader2 } from "@/lib/icons";
import { AppearanceSection, CalendarSection, SigningInSection } from "@/components/profile/ProfileSettingsSections";
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { cn } from "@/lib/utils/helpers/cn";

// The same rules as the desktop editor (lib/validation/profileForm): names in
// any language, a handle of one's own, and nothing already saved checked again.
const NO_NAMES: SavedNames = { fullName: "", displayName: "", handle: "" };

export function MobileSelfProfile() {
    const router = useRouter();
    const dispatch = useDispatch();

    const profileInfo = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const {src: imageSrc} = useUserAvatar(profileInfo?.data?.data?.user_profile_object_key);

    const [selectedImage, setSelectedImage] = useState<string>("");
    const [selectedImageFile, selectedImageSetFile] = useState<FileList | null>(null);
    const uploadFile = useUploadFile();
    const [savingProfile, setSavingProfile] = useState(false);
    // A failure the page can't place under one field: said under the fields,
    // above Save, and kept until the next try.
    const [saveProblem, setSaveProblem] = useState("");
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (imageSrc) {
            setSelectedImage(imageSrc);
        }
    }, [imageSrc]);

    const saved = useMemo<SavedNames>(() => ({
        fullName: profileInfo.data?.data.user_full_name || "",
        displayName: profileInfo.data?.data.user_name || "",
        handle: profileInfo.data?.data.user_handle || "",
    }), [profileInfo.data]);
    const savedRef = useRef<SavedNames>(NO_NAMES);
    savedRef.current = saved;
    const resolver = useMemo<Resolver<ProfileFormValues>>(
        () => (values, context, options) => zodResolver(profileFormSchema(savedRef.current))(values, context, options),
        [],
    );

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
    }, [profileInfo.data, form]);

    const removeImage = () => {
        setSelectedImage("");
        selectedImageSetFile(null);
    };

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

    const onSubmit = async (data: ProfileFormValues) => {
        setSaveProblem("");
        let profileKey = profileInfo.data?.data.user_profile_object_key || "";

        if (selectedImage == "" && selectedImageFile == null) {
            profileKey = "";
        }
        if (selectedImageFile) {
            const responses = await uploadFile.makeRequestToUploadToPublic(selectedImageFile);
            if (responses.length === 0) {
                // The upload answers an empty list when it failed: saving on
                // kept the old photo and went back as if the new one were in.
                setSaveProblem(PHOTO_NOT_UPLOADED);
                return;
            }
            profileKey = responses[0].object_uuid;
        }

        const names = profileNamesPayload(data, saved);
        setSavingProfile(true);
        const outcome = await saveProfile({
            ...names,
            user_job_title: data.jobTitle || profileInfo.data?.data.user_job_title || "",
            user_profile_object_key: profileKey,
            user_app_lang: data.language || profileInfo.data?.data.user_app_lang || "en",
            user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
            user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
        });
        setSavingProfile(false);
        if (!outcome.ok) {
            // Said where it can be fixed, and the page stays to fix it.
            if (outcome.field === "handle") {
                form.setError("handle", { type: "server", message: outcome.message });
                form.setFocus("handle");
            } else {
                setSaveProblem(outcome.message);
            }
            return;
        }

        dispatch(updateUserInfoStatus({
            userUUID: profileInfo.data?.data.user_uuid || '',
            profileKey: profileKey,
            userName: names.user_name,
            status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
        }));

        profileInfo.mutate({
            ...profileInfo.data,
            data: {
                ...profileInfo.data?.data,
                user_uuid: profileInfo.data?.data.user_uuid || '',
                user_name: names.user_name,
                user_full_name: names.user_full_name,
                user_handle: names.user_handle ?? profileInfo.data?.data.user_handle,
                user_job_title: data.jobTitle || profileInfo.data?.data.user_job_title || "",
                user_profile_object_key: profileKey,
                user_app_lang: data.language || profileInfo.data?.data.user_app_lang || "en",
                user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
            }
        }, false);

        router.back();
    };

    const shownName = displayNameOf(profileInfo.data?.data);
    const fullName = secondaryNameOf(profileInfo.data?.data);
    const handle = handleOf(profileInfo.data?.data);
    const userSeed = shownName || "User";
    const nameIntial = getNameInitials(userSeed);

    const field = "h-11"
    const saving = uploadFile.isSubmitting || savingProfile

    return (
        <div className="flex flex-col h-full bg-background w-full">
            <div className="flex-1 overflow-y-auto w-full">
                <div className="space-y-10 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+7rem)]">
                    {/* PROFILE: waits for Save profile, which ends its own fields. */}
                    <SettingsSection title="Profile" description="Saved together when you press Save profile.">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={selectedImage || undefined} alt="" />
                                <AvatarFallback className={cn("text-lg font-semibold", getAvatarFallbackClass(userSeed))}>
                                    {nameIntial}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="truncate text-base font-medium text-foreground">{shownName}</p>
                                {(fullName || handle) && (
                                    <p className="truncate text-sm text-muted-foreground">
                                        {[fullName, handle && `@${handle}`].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                                <p className="truncate text-sm text-muted-foreground">{profileInfo.data?.data?.user_email_id}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => fileInputRef.current?.click()}>
                                <Camera aria-hidden="true" />
                                {selectedImage ? "Change photo" : "Add a photo"}
                            </Button>
                            {selectedImage && (
                                <Button type="button" variant="ghost" size="sm" className="h-10" onClick={removeImage}>
                                    {t("removeImage")}
                                </Button>
                            )}
                            <Input
                                ref={fileInputRef}
                                id="imageUploadMobile"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
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
                                                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">@</span>
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
                                            <FormLabel>Job title</FormLabel>
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
                                <Button className="h-11 w-full" disabled={saving} type="submit">
                                    {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                                    {saving ? "Saving…" : "Save profile"}
                                </Button>
                            </form>
                        </Form>
                    </SettingsSection>

                    <AppearanceSection />
                    <CalendarSection />
                    <SigningInSection />
                </div>
            </div>
        </div>
    );
}
