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
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {openUI} from "@/store/slice/uiSlice";
import { nameSchema } from "@/lib/validation/names";


const createTeamFormSchema = z.object({
  team_name: nameSchema("workspace", "Team name"),
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
      teamNameToCheck ? `${GetEndpointUrl.CheckTeamNameAvailability}?team_name=${encodeURIComponent(teamNameToCheck)}` : ''
  );

  const { makeRequest, isSubmitting } = usePost();

  const dispatch = useDispatch()
  const next = useSelector((state: RootState) => state.ui.createTeam.data?.then as string | undefined)


  const onSubmit =  (data: CreateTeamFormValues) => {
    makeRequest<CreateTeamFormValues, TeamInfoInterface>({
      payload: data,
      apiEndpoint: PostEndpointUrl.CreateTeam
    }).then((res)=>{
      // Kept open on a failure, so what was typed isn't lost.
      if (!res) return
      dispatch(addUserTeamList({teamUser:res}))
      closeModal()
      // Opened from "New project" with no team yet: carry on to the project.
      if (next === "createProject") dispatch(openUI({ key: "createProject" }))
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
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-start">New team</DialogTitle>
            <DialogDescription>

            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="team_name">Name</Label>
                <Controller
                    name="team_name"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                                {...field}
                                id="teamName"
                                placeholder="Design"
                                autoFocus
                            />
                            <Button
                                type="button"
                                onClick={() => checkChannelNameAvailability(field.value)}
                                disabled={!field.value || isSubmitting || isCheckingAvailability || !isValid}
                            >
                              {isCheckingAvailability ? "Checking…" : "Check availability"}
                            </Button>
                          </div>
                          <div>
                            {error && (
                                <p className="text-xs md:text-sm text-destructive">{error.message}</p>
                            )}
                            {teamNameToCheck == field.value && isTeamNameAvailable?.exists === false && (
                                <div className="flex items-center text-success">
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
                {isSubmitting ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
};

export default CreateTeamDialog;