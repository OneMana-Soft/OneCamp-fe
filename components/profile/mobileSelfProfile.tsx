"use client"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { updateUserInfoStatus } from "@/store/slice/userSlice";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useFetchOnlyOnce, useMediaFetch } from "@/hooks/useFetch";
import { useUploadFile } from "@/hooks/useUploadFile";
import { usePost } from "@/hooks/usePost";
import { useTranslation } from "react-i18next";

import { USER_STATUS_OFFLINE, USER_STATUS_ONLINE, UserProfileInterface, UserProfileUpdateInterface } from "@/types/user";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { GetMediaURLRes } from "@/types/file";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { AppLanguageCombobox } from "@/components/dialog/appLanguageCombobox";
import { ArrowLeft, Trash, Camera, Calendar } from "lucide-react";
import axiosInstance from "@/lib/axiosInstance";

export const profileFormSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(4, "Full name must be at least 4 characters")
        .max(30, "Full name must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Full name must only contain letters, numbers, and underscores")
        .transform((e) => (e === "" ? undefined : e)),
    displayName: z
        .string()
        .trim()
        .min(4, "Display name must be at least 4 characters")
        .max(30, "Display name must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Display name must only contain letters, numbers, and underscores")
        .transform((e) => (e === "" ? undefined : e)),
    jobTitle: z
        .union([z.string().length(0), z.string().min(4).max(30)])
        .optional()
        .transform((e) => (e === "" ? undefined : e)),
    hobbies: z
        .union([z.string().length(0), z.string().min(4).max(30)])
        .optional()
        .transform((e) => (e === "" ? undefined : e)),
    language: z.string({
        required_error: "Please select a language.",
    }),
    status: z.boolean({})
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function MobileSelfProfile() {
    const router = useRouter();
    const dispatch = useDispatch();

    const profileInfo = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);
    const profileImageRes = useMediaFetch<GetMediaURLRes>(profileInfo?.data?.data?.user_profile_object_key ? GetEndpointUrl.PublicAttachmentURL + '/' + profileInfo.data.data.user_profile_object_key : '');

    const [selectedImage, setSelectedImage] = useState<string>("");
    const [selectedImageFile, selectedImageSetFile] = useState<FileList | null>(null);
    const uploadFile = useUploadFile();
    const post = usePost();
    const { t } = useTranslation();

    useEffect(() => {
        if (profileImageRes.data?.url) {
            setSelectedImage(profileImageRes.data.url);
        }
    }, [profileImageRes.data]);

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            fullName: "",
            displayName: "",
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
        let profileKey = profileInfo.data?.data.user_profile_object_key || "";

        if (selectedImage == "" && selectedImageFile == null) {
            profileKey = "";
        }
        if (selectedImageFile) {
            const responses = await uploadFile.makeRequestToUploadToPublic(selectedImageFile);
            if (responses.length > 0) {
                profileKey = responses[0].object_uuid;
            }
        }

        post.makeRequest<UserProfileUpdateInterface>({
            payload: {
                user_name: data.displayName || profileInfo.data?.data.user_name || "",
                user_full_name: data.fullName || profileInfo.data?.data.user_full_name || "",
                user_job_title: data.jobTitle || profileInfo.data?.data.user_job_title || "",
                user_profile_object_key: profileKey,
                user_app_lang: data.language || profileInfo.data?.data.user_app_lang || "en",
                user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
            },
            apiEndpoint: PostEndpointUrl.UpdateUserProfile
        }).then(() => {
            dispatch(updateUserInfoStatus({
                userUUID: profileInfo.data?.data.user_uuid || '',
                profileKey: profileKey,
                userName: data.displayName || profileInfo.data?.data.user_name || "",
                status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
            }));
            
            profileInfo.mutate({
                mag: profileInfo.data?.mag || '',
                ...profileInfo.data,
                data: {
                    ...profileInfo.data?.data,
                    user_uuid: profileInfo.data?.data.user_uuid || '',
                    user_name: data.displayName || profileInfo.data?.data.user_name || "",
                    user_full_name: data.fullName || profileInfo.data?.data.user_full_name || "",
                    user_job_title: data.jobTitle || profileInfo.data?.data.user_job_title || "",
                    user_profile_object_key: profileKey,
                    user_app_lang: data.language || profileInfo.data?.data.user_app_lang || "en",
                    user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                    user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
                }
            }, false);

            router.back();
        });
    };

    const handleConnectGoogleCalendar = async (e: React.MouseEvent) => {
        e.preventDefault();
        try {
            const response = await axiosInstance.get(GetEndpointUrl.GoogleCalendarAuthUrl);
            if (response.data?.data) {
                window.location.href = response.data.data;
            }
        } catch (e) {
            console.error("Failed to get Google Calendar Auth URL", e);
        }
    };

    const [gcalStatus, setGcalStatus] = useState<{ isConnected: boolean; taskSyncEnabled: boolean } | null>(null);
    const [updatingSync, setUpdatingSync] = useState(false);

    useEffect(() => {
        const fetchGcalStatus = async () => {
            try {
                const response = await axiosInstance.get(GetEndpointUrl.GoogleCalendarStatus);
                if (response.data?.data) {
                    setGcalStatus(response.data.data);
                }
            } catch (e) {
                console.error("Failed to get Google Calendar status", e);
            }
        };
        fetchGcalStatus();
    }, []);

    const handleToggleTaskSync = async (enabled: boolean) => {
        setUpdatingSync(true);
        try {
            await axiosInstance.post(PostEndpointUrl.UpdateGoogleCalendarSyncTask, { enabled });
            setGcalStatus(prev => prev ? { ...prev, taskSyncEnabled: enabled } : null);
        } catch (e) {
            console.error("Failed to update task sync preference", e);
        } finally {
            setUpdatingSync(false);
        }
    };

    const handleUnlinkGoogleCalendar = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!confirm("Are you sure you want to unlink Google Calendar?")) return;
        try {
            await axiosInstance.post(PostEndpointUrl.GoogleCalendarUnlink);
            setGcalStatus({ isConnected: false, taskSyncEnabled: false });
        } catch (e) {
            console.error("Failed to unlink Google Calendar", e);
        }
    };

    const nameIntialsArray = profileInfo.data?.data?.user_name?.split(" ") || ["Unknown"];
    let nameIntial = nameIntialsArray[0][0]?.toUpperCase() || "U";
    if (nameIntialsArray?.length > 1) {
        nameIntial += nameIntialsArray[1][0]?.toUpperCase() || "";
    }

    return (
        <div className="flex flex-col h-full bg-background w-full">

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="p-4 md:p-6 lg:p-8 space-y-8 pb-[calc(env(safe-area-inset-bottom)+7rem)]">
                    
                    {/* Avatar Upload Section */}
                    <div className="flex flex-col justify-center items-center">
                        <div className="relative group mb-4">
                            <Avatar className="h-40 w-40 border-4 border-muted">
                                <AvatarImage src={selectedImage || undefined} alt="Profile Image" />
                                <AvatarFallback className="text-4xl">{nameIntial}</AvatarFallback>
                            </Avatar>
                            <label
                                htmlFor="imageUploadMobile"
                                className="absolute bottom-1 right-2 p-3 bg-primary text-primary-foreground rounded-full shadow-lg cursor-pointer hover:bg-primary/90 transition-transform active:scale-95"
                            >
                                <Camera className="h-5 w-5" />
                            </label>
                            <Input
                                id="imageUploadMobile"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>
                        {selectedImage && (
                            <Button variant="ghost" className="text-muted-foreground hover:text-destructive transition-colors" size='sm' onClick={removeImage}>
                                <Trash className="h-4 w-4 mr-2" />{t('removeImage')}
                            </Button>
                        )}
                        <h2 className="text-2xl font-semibold text-foreground mt-4">{profileInfo.data?.data?.user_name}</h2>
                        <p className="text-sm text-muted-foreground">{profileInfo.data?.data?.user_email_id}</p>
                    </div>

                    {/* Form Section */}
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="bg-muted/10 p-5 rounded-2xl border space-y-4 shadow-sm">
                                <FormField
                                    control={form.control}
                                    name="fullName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs">Full Name</FormLabel>
                                            <FormControl>
                                                <Input {...field} className='bg-background/50 border-0 shadow-none text-base h-12 focus-visible:ring-1' placeholder="Enter your full name" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="displayName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs">Display Name</FormLabel>
                                            <FormControl>
                                                <Input {...field} className='bg-background/50 border-0 shadow-none text-base h-12 focus-visible:ring-1' placeholder="Enter a display name" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="jobTitle"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs">Job Title</FormLabel>
                                            <FormControl>
                                                <Input {...field} className='bg-background/50 border-0 shadow-none text-base h-12 focus-visible:ring-1' placeholder="e.g. Software Engineer" />
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
                                            <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs">Hobbies</FormLabel>
                                            <FormControl>
                                                <Input {...field} className='bg-background/50 border-0 shadow-none text-base h-12 focus-visible:ring-1' placeholder="What do you like to do?" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <FormField
                                        control={form.control}
                                        name="language"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col col-span-1">
                                                <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs">{t('language')}</FormLabel>
                                                <div className="mt-1">
                                                    <AppLanguageCombobox
                                                        onLangChange={field.onChange}
                                                        userLang={field.value}
                                                    />
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col col-span-1 border rounded-xl p-3 bg-background/50 items-center justify-center space-y-2">
                                                <FormLabel className="text-muted-foreground font-semibold uppercase tracking-wider text-xs m-0">{t('onlineLabel')}</FormLabel>
                                                <Switch
                                                    id="status"
                                                    checked={!!field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="m-0"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            
                            <div className="bg-muted/10 p-5 rounded-2xl border space-y-4 shadow-sm mt-4">
                                <h3 className="text-muted-foreground font-semibold uppercase tracking-wider text-xs mb-3">Integrations</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-background/50 rounded-xl border">
                                        <div className="flex items-center space-x-3">
                                            <div className="bg-blue-100 p-2 rounded-full">
                                                <Calendar className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Google Calendar</p>
                                                <p className="text-xs text-muted-foreground">Sync your tasks and personal events</p>
                                            </div>
                                        </div>
                                        {!gcalStatus?.isConnected ? (
                                            <Button variant="outline" size="sm" onClick={handleConnectGoogleCalendar}>
                                                Connect
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleUnlinkGoogleCalendar}>
                                                Unlink
                                            </Button>
                                        )}
                                    </div>

                                    {gcalStatus?.isConnected && (
                                        <div className="flex items-center justify-between p-3 bg-background/50 rounded-xl border animate-in fade-in slide-in-from-top-1">
                                            <div className="flex flex-col">
                                                <p className="text-sm font-medium text-foreground">Sync Tasks to Google Calendar</p>
                                                <p className="text-xs text-muted-foreground">Tasks with due dates will appear on your calendar</p>
                                            </div>
                                            <Switch
                                                checked={gcalStatus?.taskSyncEnabled}
                                                onCheckedChange={handleToggleTaskSync}
                                                disabled={updatingSync}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="pt-4">
                                <Button 
                                    className="w-full h-12 text-base font-medium rounded-xl shadow-lg" 
                                    disabled={uploadFile.isSubmitting || post.isSubmitting} 
                                    type="submit"
                                >
                                    {t('update')}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            </div>
        </div>
    );
}
