import {zodResolver} from "@hookform/resolvers/zod";
import {useForm} from "react-hook-form";
import {z} from "zod";

import {Button} from "@/components/ui/button";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form";
import {Input} from "@/components/ui/input";

import {useEffect, useState} from "react";

import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,} from "../ui/dialog";

import {Avatar, AvatarFallback, AvatarImage} from "../ui/avatar";
import {Separator} from "../ui/separator";
import {Trash, Calendar, Camera} from "lucide-react";
import {AppLanguageCombobox} from "@/components/dialog/appLanguageCombobox";
import {useFetchOnlyOnce, useMediaFetch} from "@/hooks/useFetch";
import {USER_STATUS_OFFLINE, USER_STATUS_ONLINE, UserProfileInterface, UserProfileUpdateInterface} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {GetMediaURLRes} from "@/types/file";
import {useUploadFile} from "@/hooks/useUploadFile";
import {usePost} from "@/hooks/usePost";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/ui/switch";
import {useDispatch} from "react-redux";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import axiosInstance from "@/lib/axiosInstance";
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";

const profileFormSchema = z.object({
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

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface editProfileDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const EditProfileDialog: React.FC<editProfileDialogProps> = ({
                                                                 dialogOpenState,
                                                                 setOpenState,
                                                             }) => {
    const profileInfo = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const profileImageRes = useMediaFetch<GetMediaURLRes>(profileInfo && profileInfo.data?.data.user_profile_object_key ? GetEndpointUrl.PublicAttachmentURL+'/'+profileInfo.data.data.user_profile_object_key : '');

    const [selectedImage, setSelectedImage] = useState<string>("");
    const [selectedImageFile, selectedImageSetFile] = useState<FileList | null>(null);
    const uploadFile = useUploadFile()
    const post = usePost()
    const {t} = useTranslation()

    const dispatch = useDispatch()

    useEffect(() => {
        if (profileImageRes.data?.url) {
            setSelectedImage(profileImageRes.data.url);
        }
    }, [profileImageRes.data]);

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
    }, [profileInfo.data]);


    const removeImage = () => {
        setSelectedImage("");
        selectedImageSetFile(null);
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

    const onSubmit = async (data: ProfileFormValues) => {
        let profileKey = profileInfo.data?.data.user_profile_object_key || "";

        if (selectedImage == "" && selectedImageFile == null) {
            profileKey = "";
        }
        if (selectedImageFile) {

            const responses = await uploadFile.makeRequestToUploadToPublic(selectedImageFile)
            if (responses.length > 0) {
                profileKey = responses[0].object_uuid
            }


        }


            post.makeRequest<UserProfileUpdateInterface>({
                payload: {
                    user_name: data.displayName || profileInfo.data?.data.user_name || "",
                    user_full_name: data.fullName || profileInfo.data?.data.user_full_name || "",
                    user_job_title:
                        data.jobTitle || profileInfo.data?.data.user_job_title || "",
                    user_profile_object_key: profileKey,
                    user_app_lang:
                        data.language || profileInfo.data?.data.user_app_lang || "en",
                    user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                    user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE
                },
                apiEndpoint: PostEndpointUrl.UpdateUserProfile

            }).then(()=>{
                dispatch(updateUserInfoStatus({
                    userUUID: profileInfo.data?.data.user_uuid || '',
                    profileKey: profileKey,
                    userName: data.displayName || profileInfo.data?.data.user_name || "",
                    status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE

                }))
                profileInfo.mutate({
                    mag: profileInfo.data?.mag || '',
                    ...profileInfo.data,
                    data: {
                        ...profileInfo.data?.data,
                        user_uuid: profileInfo.data?.data.user_uuid || '',
                        user_name: data.displayName || profileInfo.data?.data.user_name || "",
                        user_full_name: data.fullName || profileInfo.data?.data.user_full_name || "",
                        user_job_title:
                            data.jobTitle || profileInfo.data?.data.user_job_title || "",
                        user_profile_object_key: profileKey,
                        user_app_lang:
                            data.language || profileInfo.data?.data.user_app_lang || "en",
                        user_hobbies: data.hobbies || profileInfo.data?.data.user_hobbies || "",
                        user_status: data.status ? USER_STATUS_ONLINE : USER_STATUS_OFFLINE

                    }
                }, false)
            })




        // profileInfo.mutate();

        closeModal(); // Close dialog after submission
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

    const nameIntialsArray = profileInfo.data?.data.user_name.split(" ") || [
        "Unknown",
    ];

    let nameIntial = nameIntialsArray[0][0].toUpperCase();

    if (nameIntialsArray?.length > 1) {
        nameIntial += nameIntialsArray[1][0].toUpperCase();
    }

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            {/*<DialogTrigger asChild>*/}
            {/*    <Button variant="secondary">Save</Button>*/}
            {/*</DialogTrigger>*/}
            <DialogContent className="sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
                <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
                    {/* Left Sidebar - Profile Summary */}
                    <div className="md:w-1/3 bg-muted/30 p-8 flex flex-col items-center border-r">
                        <DialogHeader className="w-full mb-8">
                            <DialogTitle className="text-2xl font-bold tracking-tight">{t('profile')}</DialogTitle>
                            <DialogDescription className="text-xs">{t('editProfile')}</DialogDescription>
                        </DialogHeader>
                        
                        <div className="relative group mb-6">
                            <Avatar className="h-40 w-40 ring-4 ring-background shadow-xl transition-transform duration-300 group-hover:scale-[1.02]">
                                <AvatarImage src={selectedImage || undefined} alt="Profile Image" className="object-cover" />
                                <AvatarFallback className="text-4xl font-bold bg-primary/10">{nameIntial}</AvatarFallback>
                            </Avatar>
                            <label
                                htmlFor="imageUpload"
                                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-all duration-300 backdrop-blur-[2px]"
                            >
                                <Camera className="text-white h-8 w-8" />
                            </label>
                            <Input
                                id="imageUpload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>

                        {selectedImage && (
                            <Button variant="ghost" size="sm" onClick={removeImage} className="text-destructive hover:text-destructive hover:bg-destructive/10 mb-4 h-8 px-2">
                                <Trash className="h-3 w-3 mr-2" />{t('removeImage')}
                            </Button>
                        )}
                        
                        <div className="text-center space-y-1">
                            <h3 className="font-semibold text-lg text-foreground truncate max-w-full">
                                {profileInfo.data?.data.user_name}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate max-w-full">
                                {profileInfo.data?.data.user_email_id}
                            </p>
                        </div>
                    </div>

                    {/* Right Content - Form */}
                    <div className="md:w-2/3 p-8 overflow-y-auto bg-background custom-scrollbar">
                        <Form {...form}>
                            <form id="profile-edit-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="fullName"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-muted/20 border-0 focus-visible:ring-1 h-10" />
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
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-muted/20 border-0 focus-visible:ring-1 h-10" />
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
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('jobTitle')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-muted/20 border-0 focus-visible:ring-1 h-10" />
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
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hobbies</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-muted/20 border-0 focus-visible:ring-1 h-10" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="language"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-col">
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('language')}</FormLabel>
                                                <AppLanguageCombobox
                                                    onLangChange={field.onChange}
                                                    userLang={field.value}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between space-x-2 border rounded-lg px-4 py-2 bg-muted/20 border-transparent h-10 mt-auto">
                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground m-0 cursor-pointer" htmlFor="status-switch">{t('onlineLabel')}</FormLabel>
                                                <Switch
                                                    id="status-switch"
                                                    checked={!!field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="scale-90"
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <Separator className="my-2" />
                                
                                </form>
                        </Form>

                        <div className="space-y-6 mt-6">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t('integrations') || 'Integrations'}</h3>
                                
                                <div className="group relative overflow-hidden rounded-xl border bg-muted/10 p-4 transition-all hover:bg-muted/20">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 shadow-sm ring-1 ring-blue-500/20">
                                                <Calendar className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold">Google Calendar</p>
                                                <p className="text-[10px] text-muted-foreground leading-tight">Sync your workflow and events</p>
                                            </div>
                                        </div>
                                        {!gcalStatus?.isConnected ? (
                                            <Button variant="outline" size="sm" type="button" onClick={handleConnectGoogleCalendar} className="h-8 rounded-full px-4 text-xs font-medium">
                                                Connect
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" size="sm" type="button" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2" onClick={handleUnlinkGoogleCalendar}>
                                                Unlink
                                            </Button>
                                        )}
                                    </div>

                                    {gcalStatus?.isConnected && (
                                        <div className="mt-4 flex items-center justify-between rounded-lg bg-background/50 p-3 ring-1 ring-border/50 animate-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-0.5">
                                                <p className="text-xs font-medium text-foreground">Sync Tasks</p>
                                                <p className="text-[10px] text-muted-foreground">Due dates will appear on your calendar</p>
                                            </div>
                                            <Switch
                                                checked={gcalStatus?.taskSyncEnabled}
                                                onCheckedChange={handleToggleTaskSync}
                                                disabled={updatingSync}
                                                className="scale-75"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Security</h3>
                                <ChangePasswordSection />
                            </div>
                        </div>

                        <DialogFooter className="pt-8">
                            <Button 
                                form="profile-edit-form"
                                disabled={uploadFile.isSubmitting || post.isSubmitting} 
                                type="submit"
                                className="w-full h-11 rounded-xl shadow-lg shadow-primary/20 font-semibold text-sm transition-all hover:translate-y-[-1px]"
                            >
                                {t('update')} Profile
                            </Button>
                        </DialogFooter>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default EditProfileDialog;
