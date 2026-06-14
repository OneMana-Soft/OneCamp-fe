"use client"

import {Button} from "@/components/ui/button";
import {Controller, useForm} from "react-hook-form";
import {z} from "zod";
import {zodResolver} from "@hookform/resolvers/zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {usePost} from "@/hooks/usePost";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {Switch} from "@/components/ui/switch";
import {CheckCircle, AlertCircle, Loader2, Lock, Megaphone, FileArchive} from "@/lib/icons";
import {useEffect, useMemo, useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp, ChannelNameExistsInterface} from "@/types/channel";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {useDispatch} from "react-redux";
import {removeUserChannelName, updateUserChannelName} from "@/store/slice/userSlice";

const NAME_REGEX = /^[A-Za-z0-9_\s]+$/;

const editChannelFormSchema = z.object({
    channel_name: z
        .string()
        .trim()
        .min(4, "Channel name must be at least 4 characters")
        .max(30, "Channel name must be at most 30 characters")
        .regex(NAME_REGEX, "Only letters, numbers, spaces and underscores"),
    channel_private: z.boolean(),
    channel_archived: z.boolean(),
    announcement_only: z.boolean(),
    channel_uuid: z.string(),
});

type EditChannelFormValues = z.infer<typeof editChannelFormSchema>;

// Payload sent to the single UpdateChannel endpoint — every setting is saved
// atomically in one request (no per-toggle side calls).
interface UpdateChannelPayload {
    channel_uuid: string;
    channel_name: string;
    channel_private: boolean;
    channel_archived: boolean;
    post_policy: "everyone" | "admins_only";
}

interface EditTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    channelId: string;
}

// A consistent settings row: icon + label + description on the left, control on
// the right. Keeps Private / Announcement / Archive visually aligned.
const SettingRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    description: string;
    children: React.ReactNode;
    tone?: "default" | "danger";
}> = ({icon, label, description, children, tone = "default"}) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
            <span className={tone === "danger" ? "mt-0.5 text-destructive" : "mt-0.5 text-muted-foreground"}>
                {icon}
            </span>
            <div className="space-y-0.5 min-w-0">
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
            </div>
        </div>
        <div className="shrink-0 pt-0.5">{children}</div>
    </div>
);

const EditChannelDialog: React.FC<EditTeamDialogProps> = ({
    dialogOpenState,
    setOpenState,
    channelId,
}) => {
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(
        `${channelId ? GetEndpointUrl.ChannelBasicInfo + "/" + channelId : ""}`,
    );
    const [originalChannelName, setOriginalChannelName] = useState("");
    const dispatch = useDispatch();

    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: {isValid, errors},
    } = useForm<EditChannelFormValues>({
        resolver: zodResolver(editChannelFormSchema),
        mode: "onChange",
        defaultValues: {
            channel_name: "",
            channel_private: false,
            channel_archived: false,
            announcement_only: false,
            channel_uuid: channelId,
        },
    });

    useEffect(() => {
        if (channelInfo.data?.channel_info) {
            const info = channelInfo.data.channel_info;
            reset({
                channel_name: info.ch_name,
                channel_private: info.ch_private,
                channel_archived: !isZeroEpoch(info.ch_deleted_at || ""),
                announcement_only: info.ch_post_policy === "admins_only",
                channel_uuid: channelId,
            });
            setOriginalChannelName(info.ch_name);
        }
    }, [channelInfo.data?.channel_info]);

    const {makeRequest, isSubmitting} = usePost();

    // Channel-name availability: auto-checked with a short debounce (no manual
    // "Check" button). We only check when the name actually changed and is
    // syntactically valid; the current name is always allowed.
    const [channelNameToCheck, setChannelNameToCheck] = useState<string | null>(null);
    const {data: isChannelNameAvailable, isLoading: isCheckingAvailability} =
        useFetch<ChannelNameExistsInterface>(
            channelNameToCheck
                ? `${GetEndpointUrl.CheckChannelNameAvailability}?ch_name=${encodeURIComponent(channelNameToCheck)}`
                : "",
        );

    const ch_name = watch("channel_name");
    const nameChanged = ch_name !== originalChannelName;
    const nameSyntaxValid = useMemo(
        () => ch_name.trim().length >= 4 && ch_name.trim().length <= 30 && NAME_REGEX.test(ch_name.trim()),
        [ch_name],
    );

    useEffect(() => {
        if (!nameChanged || !nameSyntaxValid) {
            setChannelNameToCheck(null);
            return;
        }
        const t = setTimeout(() => setChannelNameToCheck(ch_name.trim()), 450);
        return () => clearTimeout(t);
    }, [ch_name, nameChanged, nameSyntaxValid]);

    const checkedCurrentName = channelNameToCheck === ch_name.trim();
    const nameTaken = checkedCurrentName && isChannelNameAvailable?.exists === true;
    const nameAvailable = checkedCurrentName && isChannelNameAvailable?.exists === false;
    // Block submit while a changed name is unverified or taken.
    const nameBlocked =
        nameChanged && (isCheckingAvailability || !checkedCurrentName || nameTaken);

    const onSubmit = (data: EditChannelFormValues) => {
        const payload: UpdateChannelPayload = {
            channel_uuid: data.channel_uuid,
            channel_name: data.channel_name.trim(),
            channel_private: data.channel_private,
            channel_archived: data.channel_archived,
            post_policy: data.announcement_only ? "admins_only" : "everyone",
        };
        makeRequest<UpdateChannelPayload>({
            payload,
            apiEndpoint: PostEndpointUrl.UpdateChannel,
            showToast: true,
        }).then(() => {
            if (data.channel_archived) {
                dispatch(removeUserChannelName({channelUUID: data.channel_name}));
            } else {
                dispatch(
                    updateUserChannelName({
                        channelUUID: data.channel_uuid,
                        channelName: data.channel_name.trim(),
                        channelPrivate: data.channel_private,
                    }),
                );
            }
            setChannelNameToCheck(null);
            channelInfo.mutate();
            closeModal();
        });
    };

    const closeModal = () => {
        reset();
        setChannelNameToCheck(null);
        setOpenState(false);
    };

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-start">Edit channel</DialogTitle>
                    <DialogDescription className="sr-only">
                        Update this channel&apos;s name, visibility, posting policy and archive state.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    {/* Channel name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="channelName">Channel name</Label>
                        <Controller
                            name="channel_name"
                            control={control}
                            render={({field}) => (
                                <Input
                                    {...field}
                                    id="channelName"
                                    placeholder="e.g. product_updates"
                                    autoFocus
                                    autoComplete="off"
                                />
                            )}
                        />
                        {/* Inline validation / availability status — single line, no layout jump */}
                        <div className="min-h-[18px] text-xs">
                            {errors.channel_name ? (
                                <span className="flex items-center gap-1 text-destructive">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {errors.channel_name.message}
                                </span>
                            ) : !nameChanged ? null : isCheckingAvailability || !checkedCurrentName ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Checking availability…
                                </span>
                            ) : nameAvailable ? (
                                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Name is available
                                </span>
                            ) : nameTaken ? (
                                <span className="flex items-center gap-1 text-destructive">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Name is already taken
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* Settings */}
                    <div className="space-y-2">
                        <Controller
                            name="channel_private"
                            control={control}
                            render={({field}) => (
                                <SettingRow
                                    icon={<Lock className="h-4 w-4" />}
                                    label="Private channel"
                                    description="Only invited members can find and join this channel."
                                >
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </SettingRow>
                            )}
                        />

                        <Controller
                            name="announcement_only"
                            control={control}
                            render={({field}) => (
                                <SettingRow
                                    icon={<Megaphone className="h-4 w-4" />}
                                    label="Announcement channel"
                                    description="Only channel moderators can post. Everyone can still read and react."
                                >
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </SettingRow>
                            )}
                        />

                        <Controller
                            name="channel_archived"
                            control={control}
                            render={({field}) => (
                                <SettingRow
                                    icon={<FileArchive className="h-4 w-4" />}
                                    label="Archive channel"
                                    description="Hide the channel and stop new posts. You can restore it later."
                                    tone={field.value ? "danger" : "default"}
                                >
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </SettingRow>
                            )}
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button type="button" variant="ghost" onClick={closeModal} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!isValid || isSubmitting || nameBlocked}>
                            {isSubmitting ? "Updating…" : "Update channel"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditChannelDialog;
