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
import {PostEndpointUrl} from "@/services/endPoints";
import {TeamInfoInterface} from "@/types/team";
import { useTeamNameCheck } from "@/components/dialog/useTeamNameCheck";
import { TeamNameStatus } from "@/components/dialog/teamNameStatus";
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
    setOpenState(false);
  };

  const team_name = watch('team_name')
  const name = useTeamNameCheck(team_name, { valid: isValid })

  return (
      <Dialog onOpenChange={closeModal} open={dialogOpenState}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-start">New team</DialogTitle>
            <DialogDescription>A team holds its own projects and people.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-2 py-4">
              <Label htmlFor="team-name">Team name</Label>
              <Controller
                  name="team_name"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                      <>
                        <Input {...field} id="team-name" placeholder="Design" autoFocus aria-describedby="team-name-status" />
                        <TeamNameStatus id="team-name-status" error={error?.message} {...name} />
                      </>
                  )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={!isValid || isSubmitting || !name.available}>
                {isSubmitting ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
};

export default CreateTeamDialog;