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
import { CheckCircle } from "@/lib/icons"; // Import the green tick icon
import {useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {
    ChannelInfoInterface,
    ChannelInfoListInterfaceResp,
    ChannelJoinInterface,
    ChannelNameExistsInterface
} from "@/types/channel";
import {useDispatch} from "react-redux";
import {addUserChannelList} from "@/store/slice/userSlice";
import {app_channel_path, app_home_path} from "@/types/paths";
import {useRouter} from "next/navigation"; // Import the useFetch hook

const createChannelFormSchema = z.object({
    channel_name: z
        .string()
        .trim()
        .min(4, "Channel name must be at least 4 characters")
        .max(30, "Channel name must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Channel name must only contain letters, numbers, and underscores"),
    channel_private: z.boolean(),
});

// Infer the type for the form values
type CreateChannelFormValues = z.infer<typeof createChannelFormSchema>;

interface CreateTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const CreateChannelDialog: React.FC<CreateTeamDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                              }) => {
    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: { isValid },
    } = useForm<CreateChannelFormValues>({
        resolver: zodResolver(createChannelFormSchema),
        mode: "onChange",
        defaultValues: {
            channel_name: "",
            channel_private: false,
        },
    });

    const router = useRouter()

    const { makeRequest, isSubmitting } = usePost();
    const [channelNameToCheck, setChannelNameToCheck] = useState<string | null>(null);

    const { data: isChannelNameAvailable, isLoading: isCheckingAvailability } = useFetch<ChannelNameExistsInterface>(
        channelNameToCheck ? `${GetEndpointUrl.CheckChannelNameAvailability}?ch_name=${channelNameToCheck}` : ''
    );

    // Handle form submission
    const onSubmit = (data: CreateChannelFormValues) => {
        makeRequest<CreateChannelFormValues, ChannelInfoInterface>({
            payload: data,
            apiEndpoint: PostEndpointUrl.CreateChannel,
        }).then((res)=> {

            setChannelNameToCheck(null)
            if(res) {
                router.push(app_channel_path +'/'+res.ch_uuid);

            }
            closeModal()
        });

    };

    // Close the dialog
    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    // Check channel name availability
    const checkChannelNameAvailability = (channelName: string) => {
        setChannelNameToCheck(channelName);
    };

    const ch_name = watch("channel_name");

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Create Channel</DialogTitle>
                    <DialogDescription className="hidden">
                        Create a new channel
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
                                            {channelNameToCheck == field.value && !isChannelNameAvailable?.exists && (
                                                <div className="flex items-center text-green-600 dark:text-green-400">
                                                    <CheckCircle className="w-4 h-4 mr-1"/>
                                                    <span
                                                        className="text-xs md:text-sm">Channel name is available</span>
                                                </div>
                                            )}
                                            {channelNameToCheck == field.value && isChannelNameAvailable?.exists && (
                                                <p className="text-xs md:text-sm text-destructive">Channel name is already
                                                    taken</p>
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
                        </div>
                        <DialogFooter>
                            <Button
                                type="submit"
                                disabled={!isValid || isSubmitting || isChannelNameAvailable?.exists || ch_name != channelNameToCheck}
                            >
                                {isSubmitting ? "Creating..." : "Create Channel"}
                            </Button>
                        </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateChannelDialog;