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
import { CheckCircle } from "@/lib/icons";
import {useEffect, useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {ChannelNameExistsInterface} from "@/types/channel";

import {TeamInfoRawInterface} from "@/types/team";
import {useDispatch} from "react-redux";
import {updateUserTeamList} from "@/store/slice/userSlice";

const createTeamFormSchema = z.object({
    team_name: z
        .string()
        .trim()
        .min(4, "Team name must be at least 4 characters")
        .max(30, "Team name must be at most 30 characters")
        .regex(/^[A-Za-z0-9_\s]+$/, "Team name must only contain letters, numbers, and underscores"),
    team_uuid: z.string(),
});

type UpdateTeamFormValues = z.infer<typeof createTeamFormSchema>;

interface EditTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    teamId: string
}

const EditTeamNameDialog: React.FC<EditTeamDialogProps> = ({
                                                              dialogOpenState,
                                                              setOpenState,
                                                              teamId
                                                          }) => {
    const teamInfo = useFetch<TeamInfoRawInterface>(`${teamId ? GetEndpointUrl.GetTeamInfo+'/'+teamId : ''}`);
    const [originalTeamName, setOriginalTeamName] = useState(''); // Track original name

    const {
        control,
        handleSubmit,
        reset,
        watch,
        formState: { isValid },
    } = useForm<UpdateTeamFormValues>({
        resolver: zodResolver(createTeamFormSchema),
        mode: "onChange",
        defaultValues: {
            team_name: "",
            team_uuid: teamId,
        },
    });

    useEffect(() => {
        if (teamInfo.data?.data) {
            const originalName = teamInfo.data?.data.team_name;
            reset({
                team_name: originalName,
                team_uuid: teamId
            });
            setOriginalTeamName(originalName); // Set original name
        }
    }, [teamInfo.data?.data]);

    const dispatch = useDispatch();
    const { makeRequest, isSubmitting } = usePost();
    const [teamNameToCheck, setTeamNameToCheck] = useState<string | null>(null);
    const { data: isChannelNameAvailable, isLoading: isCheckingAvailability } = useFetch<ChannelNameExistsInterface>(
        teamNameToCheck ? `${GetEndpointUrl.CheckTeamNameAvailability}?team_name=${teamNameToCheck}` : ''
    );

    const onSubmit =  (data: UpdateTeamFormValues) => {
         makeRequest<UpdateTeamFormValues>({
            payload: data,
            apiEndpoint: PostEndpointUrl.UpdateTeamName,
            showToast: true
        }).then(()=> {

             setTeamNameToCheck(null);
             dispatch(updateUserTeamList({teamName: data.team_name, teamUUID: data.team_uuid}));
             teamInfo.mutate()
             closeModal();
         });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    const checkChannelNameAvailability = (teamName: string) => {
        setTeamNameToCheck(teamName);
    };

    const ch_name = watch("team_name");

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Edit Team</DialogTitle>
                    <DialogDescription className="hidden">
                        Edit team name
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-4 space-y-3">
                        <div className="grid gap-2">
                            <Label>Channel Name</Label>
                            <Controller
                                name="team_name"
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
                                            {teamNameToCheck === field.value && !isChannelNameAvailable?.exists && (
                                                <div className="flex items-center text-green-600 dark:text-green-400">
                                                    <CheckCircle className="w-4 h-4 mr-1"/>
                                                    <span className="text-xs md:text-sm">Channel name is available</span>
                                                </div>
                                            )}
                                            {teamNameToCheck === field.value && isChannelNameAvailable?.exists && (
                                                <p className="text-xs md:text-sm text-destructive">Channel name is already taken</p>
                                            )}
                                        </div>
                                    </>
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
                                (ch_name !== originalTeamName && // Only check if name changed
                                    (ch_name !== teamNameToCheck || isChannelNameAvailable?.exists))
                            }
                        >
                            {isSubmitting ? "Updating..." : "Update Team name"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditTeamNameDialog;