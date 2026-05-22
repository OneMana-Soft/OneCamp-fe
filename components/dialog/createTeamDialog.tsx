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
import {useState} from "react";
import {useFetch} from "@/hooks/useFetch";
import {TeamInfoInterface, TeamNameExistsInterface} from "@/types/team";
import {addUserTeamList} from "@/store/slice/userSlice";
import {useDispatch} from "react-redux";


const createTeamFormSchema = z.object({
  team_name: z
      .string()
      .trim()
      .min(4, "Team name must be at least 4 characters")
      .max(30, "Team name must be at most 30 characters")
      .regex(/^[A-Za-z0-9_\s]+$/, "Project name must only contain letters, numbers, and underscores"),
});

type CreateTeamFormValues = z.infer<typeof createTeamFormSchema>;

interface CreateTeamDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
}

const CreateTeamDialog: React.FC<CreateTeamDialogProps> = ({
                                                             dialogOpenState,
                                                             setOpenState,
                                                           }) => {

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isValid },
  } = useForm<CreateTeamFormValues>({
    resolver: zodResolver(createTeamFormSchema),
    mode: "onChange",
    defaultValues: {
      team_name: "",
    },

  });

  const [teamNameToCheck, setTeamNameToCheck] = useState<string | null>(null);


  const { data: isTeamNameAvailable, isLoading: isCheckingAvailability } = useFetch<TeamNameExistsInterface>(
      teamNameToCheck ? `${GetEndpointUrl.CheckTeamNameAvailability}?team_name=${teamNameToCheck}` : ''
  );

  const { makeRequest, isSubmitting } = usePost();

  const dispatch = useDispatch()


  const onSubmit =  (data: CreateTeamFormValues) => {
    makeRequest<CreateTeamFormValues, TeamInfoInterface>({
      payload: data,
      apiEndpoint: PostEndpointUrl.CreateTeam
    }).then((res)=>{

      if(res) {
        dispatch(addUserTeamList({teamUser:res}))

      }
      closeModal()

    });

  };

  // Close the dialog
  const closeModal = () => {
    reset()
    setTeamNameToCheck(null)
    setOpenState(false);
  };

  const checkChannelNameAvailability = (channelName: string) => {
    setTeamNameToCheck(channelName);
  };

  const team_name = watch('team_name')

  return (
      <Dialog onOpenChange={closeModal} open={dialogOpenState}>
        <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
          <DialogHeader>
            <DialogTitle className="text-start">Create Team</DialogTitle>
            <DialogDescription>

            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="team_name">Team Name</Label>
                <Controller
                    name="team_name"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                                {...field}
                                id="teamName"
                                placeholder="Type team name"
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
                            {teamNameToCheck == field.value && isTeamNameAvailable?.exists === false && (
                                <div className="flex items-center text-green-600 dark:text-green-400">
                                  <CheckCircle className="w-4 h-4 mr-1"/>
                                  <span
                                      className="text-xs md:text-sm">Channel name is available</span>
                                </div>
                            )}
                            {teamNameToCheck == field.value && isTeamNameAvailable?.exists === true && (
                                <p className="text-xs md:text-sm text-destructive">Team name is already
                                  taken</p>
                            )}
                          </div>
                        </>
                    )}
                />
              </div>
            </div>
            <DialogFooter>
            <Button type="submit" disabled={!isValid || isSubmitting || teamNameToCheck !== team_name ||  isTeamNameAvailable?.exists}>
                {isSubmitting ? "Creating..." : "Create Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
};

export default CreateTeamDialog;