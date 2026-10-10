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
import {useEffect, useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import { useTeamNameCheck } from "@/components/dialog/useTeamNameCheck";
import { TeamNameStatus } from "@/components/dialog/teamNameStatus";

import {TeamInfoRawInterface} from "@/types/team";
import {useDispatch} from "react-redux";
import {updateUserTeamList} from "@/store/slice/userSlice";
import { nameSchema } from "@/lib/validation/names";

const createTeamFormSchema = z.object({
    team_name: nameSchema("workspace", "Team name"),
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
    const onSubmit =  (data: UpdateTeamFormValues) => {
         makeRequest<UpdateTeamFormValues>({
            payload: data,
            apiEndpoint: PostEndpointUrl.UpdateTeamName,
            showToast: true
        }).then(()=> {

             dispatch(updateUserTeamList({teamName: data.team_name, teamUUID: data.team_uuid}));
             teamInfo.mutate()
             closeModal();
         });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    const teamName = watch("team_name");
    const name = useTeamNameCheck(teamName, { valid: isValid, original: originalTeamName });

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Rename team</DialogTitle>
                    <DialogDescription className="sr-only">Give the team a new name.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-2 py-4">
                        <Label htmlFor="team-name">Team name</Label>
                        <Controller
                            name="team_name"
                            control={control}
                            render={({field, fieldState: {error}}) => (
                                <>
                                    <Input {...field} id="team-name" autoFocus aria-describedby="team-name-status" />
                                    <TeamNameStatus id="team-name-status" error={error?.message} {...name} />
                                </>
                            )}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                        <Button type="submit" disabled={!isValid || isSubmitting || name.unchanged || !name.available}>
                            {isSubmitting ? "Saving…" : "Save name"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditTeamNameDialog;