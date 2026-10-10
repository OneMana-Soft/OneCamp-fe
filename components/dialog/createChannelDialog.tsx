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
import { AlertCircle, CheckCircle, Loader2, Lock } from "@/lib/icons";
import {useEffect, useMemo, useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {
    ChannelInfoInterface,
    ChannelNameExistsInterface
} from "@/types/channel";
import {app_channel_path} from "@/types/paths";
import { isValidName, nameSchema } from "@/lib/validation/names";
import {useRouter} from "next/navigation";
import { ChannelSettingsList, SettingRow } from "@/components/dialog/editChannelDialog";

const createChannelFormSchema = z.object({
    channel_name: nameSchema("workspace", "Channel name"),
    channel_private: z.boolean(),
});

// Infer the type for the form values
type CreateChannelFormValues = z.infer<typeof createChannelFormSchema>;

interface CreateTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

/**
 * A new channel, laid out as Edit channel is: the name, its availability said
 * under it as it is typed, and the settings as rows between hairlines.
 *
 * It asked for a second step before Create would wake up: "Check
 * availability", an orange button beside the field (two orange buttons in one
 * small dialog), squeezing the field to half the width on a phone. The name
 * is checked by itself a moment after typing stops, as Edit channel's is.
 * The labels were in title case ("Channel Name", "Channel Private", "Create
 * Channel") and the switch sat straight after its label instead of at the
 * row's end.
 */
const CreateChannelDialog: React.FC<CreateTeamDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                              }) => {
    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: { isValid, errors },
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
        channelNameToCheck ? `${GetEndpointUrl.CheckChannelNameAvailability}?ch_name=${encodeURIComponent(channelNameToCheck)}` : ''
    );

    const ch_name = watch("channel_name");
    const nameSyntaxValid = useMemo(() => isValidName("workspace", ch_name), [ch_name]);

    // Checked a moment after typing stops, only for a name that could be one.
    useEffect(() => {
        if (!ch_name?.trim() || !nameSyntaxValid) {
            setChannelNameToCheck(null);
            return;
        }
        const t = setTimeout(() => setChannelNameToCheck(ch_name.trim()), 450);
        return () => clearTimeout(t);
    }, [ch_name, nameSyntaxValid]);

    const checkedCurrentName = !!ch_name && channelNameToCheck === ch_name.trim();
    const nameTaken = checkedCurrentName && isChannelNameAvailable?.exists === true;
    const nameAvailable = checkedCurrentName && isChannelNameAvailable?.exists === false;
    const waitingForCheck = !!ch_name?.trim() && nameSyntaxValid && (isCheckingAvailability || !checkedCurrentName);

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
        }).catch(() => {
            // makeRequest re-throws so callers can roll back optimistic updates, so without this
            // a failed create left an unhandled promise rejection.
            //
            // The dialog deliberately stays open. usePost has already shown why it failed, and
            // for the common case — "A channel named general already exists" — the useful thing
            // is to keep what they typed so they can adjust it, rather than reset the form and
            // make them start over.
        });

    };

    // Close the dialog
    const closeModal = () => {
        reset();
        setChannelNameToCheck(null);
        setOpenState(false);
    };

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-start">New channel</DialogTitle>
                    <DialogDescription className="sr-only">
                        Name the channel and choose who can find it.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <div className="space-y-1.5">
                        <Label htmlFor="newChannelName">Channel name</Label>
                        <Controller
                            name="channel_name"
                            control={control}
                            render={({field}) => (
                                <Input
                                    {...field}
                                    id="newChannelName"
                                    placeholder="launch-week"
                                    autoFocus
                                    autoComplete="off"
                                />
                            )}
                        />
                        {/* Validation and availability, one line, its room kept so
                            nothing below jumps as it changes. */}
                        <div data-name-status="" className="min-h-[18px] text-xs" aria-live="polite">
                            {errors.channel_name ? (
                                <span className="flex items-center gap-1 text-danger-ink">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    {errors.channel_name.message}
                                </span>
                            ) : waitingForCheck ? (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Checking availability…
                                </span>
                            ) : nameAvailable ? (
                                <span className="flex items-center gap-1 text-success-ink">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Name is available
                                </span>
                            ) : nameTaken ? (
                                <span className="flex items-center gap-1 text-danger-ink">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Name is already taken
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <ChannelSettingsList>
                        <Controller
                            name="channel_private"
                            control={control}
                            render={({field}) => (
                                <SettingRow
                                    icon={<Lock className="h-4 w-4" />}
                                    label="Private channel"
                                    description="Only invited members can find and join this channel."
                                    controlId="new-channel-private"
                                >
                                    <Switch id="new-channel-private" checked={field.value} onCheckedChange={field.onChange} />
                                </SettingRow>
                            )}
                        />
                    </ChannelSettingsList>

                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button type="button" variant="ghost" onClick={closeModal} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting || !nameAvailable}
                        >
                            {isSubmitting ? "Creating…" : "Create channel"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateChannelDialog;
