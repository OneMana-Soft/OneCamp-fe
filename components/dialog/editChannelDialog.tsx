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
import { CheckCircle } from "@/lib/icons";
import {useEffect, useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {ChannelInfoInterfaceResp, ChannelNameExistsInterface} from "@/types/channel";
import {isZeroEpoch} from "@/lib/utils/validation/isZeroEpoch";
import {useDispatch} from "react-redux";
import {removeUserChannelName, updateUserChannelName} from "@/store/slice/userSlice";

const createChannelFormSchema = z.object({
    channel_name: z
        .string()
        .trim()
        .min(4, "Channel name must be at least 4 characters")
        .max(30, "Channel name must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Channel name must only contain letters, numbers, and underscores"),
    channel_private: z.boolean(),
    channel_archived: z.boolean(),
    channel_uuid: z.string(),
});

type UpdateChannelFormValues = z.infer<typeof createChannelFormSchema>;

interface EditTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    channelId: string
}

const EditChannelDialog: React.FC<EditTeamDialogProps> = ({
                                                              dialogOpenState,
                                                              setOpenState,
                                                              channelId
                                                          }) => {
    const channelInfo = useFetch<ChannelInfoInterfaceResp>(`${channelId ? GetEndpointUrl.ChannelBasicInfo+'/'+channelId : ''}`);
    const [originalChannelName, setOriginalChannelName] = useState(''); // Track original name

    const dispatch = useDispatch()
    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: { isValid },
    } = useForm<UpdateChannelFormValues>({
        resolver: zodResolver(createChannelFormSchema),
        mode: "onChange",
        defaultValues: {
            channel_name: "",
            channel_private: false,
            channel_archived: false,
            channel_uuid: channelId,
        },
    });

    useEffect(() => {
        if (channelInfo.data?.channel_info) {
            const originalName = channelInfo.data.channel_info.ch_name;
            reset({
                channel_name: originalName,
                channel_private: channelInfo.data.channel_info.ch_private,
                channel_archived: !isZeroEpoch(channelInfo.data.channel_info.ch_deleted_at || ''),
                channel_uuid: channelId
            });
            setOriginalChannelName(originalName); // Set original name
        }
    }, [channelInfo.data?.channel_info]);

    const { makeRequest, isSubmitting } = usePost();
    const [channelNameToCheck, setChannelNameToCheck] = useState<string | null>(null);
    const { data: isChannelNameAvailable, isLoading: isCheckingAvailability } = useFetch<ChannelNameExistsInterface>(
        channelNameToCheck ? `${GetEndpointUrl.CheckChannelNameAvailability}?ch_name=${channelNameToCheck}` : ''
    );

    const onSubmit =  (data: UpdateChannelFormValues) => {
         makeRequest<UpdateChannelFormValues>({
            payload: data,
            apiEndpoint: PostEndpointUrl.UpdateChannel,
            showToast: true
        }).then(()=> {

            if(data.channel_archived) {
                dispatch(removeUserChannelName({channelUUID: data.channel_name}));
            }
            else {
                dispatch(updateUserChannelName({channelUUID: data.channel_uuid, channelName: data.channel_name, channelPrivate: data.channel_private}));
            }
             setChannelNameToCheck(null);
             channelInfo.mutate()
             closeModal();
         });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    const checkChannelNameAvailability = (channelName: string) => {
        setChannelNameToCheck(channelName);
    };

    const ch_name = watch("channel_name");

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Edit Channel</DialogTitle>
                    <DialogDescription className="hidden">
                        Edit channel
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-4 space-y-3">
                        <div className="grid gap-2">
                            <Label>Channel Name</Label>
                            <Controller
                                name="channel_name"
                                control={control}
                                render={({field, fieldState: {error}}) => (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                {...field}
                                                id="teamName"
                                                placeholder="Type channel name"
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                onClick={() => checkChannelNameAvailability(field.value)}
                                                disabled={!field.value || isSubmitting || isCheckingAvailability || !isValid}
                                            >
                                                {isCheckingAvailability ? "Checking..." : "Check Availability"}
                                            </Button>
                                        </div>
                                        <div>
                                            {error && (
                                                <p className="text-xs md:text-sm text-destructive">{error.message}</p>
                                            )}
                                            {channelNameToCheck === field.value && !isChannelNameAvailable?.exists && (
                                                <div className="flex items-center text-green-600 dark:text-green-400">
                                                    <CheckCircle className="w-4 h-4 mr-1"/>
                                                    <span className="text-xs md:text-sm">Channel name is available</span>
                                                </div>
                                            )}
                                            {channelNameToCheck === field.value && isChannelNameAvailable?.exists && (
                                                <p className="text-xs md:text-sm text-destructive">Channel name is already taken</p>
                                            )}
                                        </div>
                                    </>
                                )}
                            />
                        </div>

                        <div className="flex items-center space-x-4">
                            <Label>Channel Private</Label>
                            <Controller
                                name="channel_private"
                                control={control}
                                render={({field}) => (
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </div>

                        <div className="flex items-center space-x-4">
                            <Label>Channel archived</Label>
                            <Controller
                                name="channel_archived"
                                control={control}
                                render={({field}) => (
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                )}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={
                                !isValid ||
                                isSubmitting ||
                                (ch_name !== originalChannelName && // Only check if name changed
                                    (ch_name !== channelNameToCheck || isChannelNameAvailable?.exists))
                            }
                        >
                            {isSubmitting ? "Updating..." : "Update Channel"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditChannelDialog;