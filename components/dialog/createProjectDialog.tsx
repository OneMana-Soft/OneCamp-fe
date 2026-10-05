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
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {openUI} from "@/store/slice/uiSlice";
import {TeamListResponseInterface} from "@/types/team";
import {useFetch} from "@/hooks/useFetch";
import {useDispatch} from "react-redux";
import {addUserProjectList} from "@/store/slice/userSlice";
import {ProjectInfoInterface} from "@/types/project";
import { nameSchema } from "@/lib/validation/names";

const createProjectFormSchema = z.object({
  project_name: nameSchema("workspace", "Project name"),
  project_team_uuid: z
      .string()
      .min(1, "Pick a team")
});

// Infer the type for the form values
type CreateTeamFormValues = z.infer<typeof createProjectFormSchema>;

interface CreateProjectDialogProps {
  dialogOpenState: boolean;
  setOpenState: (state: boolean) => void;
}

const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
                                                             dialogOpenState,
                                                             setOpenState,
                                                           }) => {

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { isValid },
  } = useForm<CreateTeamFormValues>({
    resolver: zodResolver(createProjectFormSchema),
    mode: "onChange",
    defaultValues: {
      project_team_uuid: "",
      project_name: "",
    },

  });

  const { makeRequest, isSubmitting } = usePost();

  const [teamPopoverOpenState, setTeamPopoverOpenState] = useState(false)

  const teamsInfo = useFetch<TeamListResponseInterface>(GetEndpointUrl.TeamListUserIsAdmin)

  const dispatch = useDispatch()
  const router = useRouter()
  const teams = teamsInfo.data?.data ?? []
  const noTeams = !teamsInfo.isLoading && teams.length === 0

  // With one team there is nothing to choose.
  useEffect(() => {
    if (dialogOpenState && teams.length === 1 && !getValues("project_team_uuid")) {
      setValue("project_team_uuid", teams[0].team_uuid, { shouldValidate: true })
    }
  }, [dialogOpenState, teams, getValues, setValue])


  const onSubmit = async (data: CreateTeamFormValues) => {
    makeRequest<CreateTeamFormValues, ProjectInfoInterface>({
      payload: data,
      apiEndpoint: PostEndpointUrl.CreateProject
    }).then((res)=>{
      // Kept open on a failure, so what was typed isn't lost.
      if (!res) return
      dispatch(addUserProjectList({ projectUser: res }));
      closeModal()
      if (res.project_uuid) router.push(`/app/project/${res.project_uuid}`)
    });
  };

  // Close the dialog
  const closeModal = () => {
    reset()
    setOpenState(false);
  };

  return (
      <Dialog onOpenChange={closeModal} open={dialogOpenState}>
        <DialogContent id="create-project-dialog" className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-start">New project</DialogTitle>
            <DialogDescription>
              A project holds tasks, boards, forms and the time spent on them, for one team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4 space-y-3">
              <div className="grid gap-2 ">
                <Label htmlFor="projectName">Name</Label>
                <Controller
                    name="project_name"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <>
                          <Input
                              {...field}
                              id="projectName"
                              placeholder="Website redesign"
                              autoFocus
                          />

                            {error && (
                                <p className="text-sm text-destructive">{error.message}</p>
                            )}
                        </>
                    )}
                />
              </div>

              {noTeams && (
                  <div className="rounded-md border border-dashed p-3 text-sm">
                    <p>Projects belong to a team, and you don&apos;t have one yet.</p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          closeModal()
                          dispatch(openUI({ key: "createTeam", data: { then: "createProject" } }))
                        }}
                    >
                      Create a team first
                    </Button>
                  </div>
              )}
              { teams.length > 0 && (
                  <div className="flex items-center space-x-4">
                    <Label>Team</Label>
                    <Controller
                        name="project_team_uuid"
                        control={control}
                        render={({ field, fieldState: { error } }) => (
                          <>
                            <Popover open={teamPopoverOpenState} onOpenChange={setTeamPopoverOpenState}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className=" justify-start">
                                  {field.value ? (
                                      <>
                                        {teamsInfo.data?.data.find(
                                            (team) => team.team_uuid === field.value
                                        )?.team_name || "Unknown Team"}
                                      </>
                                  ) : (
                                      <>{'Select team'}</>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                container={typeof document !== "undefined" ? document.getElementById("create-project-dialog") ?? undefined : undefined}
                                className="p-0"
                                side="right"
                                align="start"
                              >
                                <Command>
                                  <CommandInput placeholder="Change team…" />
                                  <CommandList>
                                    <CommandEmpty>No results found.</CommandEmpty>
                                    <CommandGroup>
                                      {teamsInfo.data?.data.map((team) => (
                                          <CommandItem
                                              key={team.team_uuid}
                                              value={team.team_uuid}
                                              onSelect={(value) => {
                                                field.onChange(
                                                    teamsInfo.data?.data.find(
                                                        (t) => t.team_uuid === value
                                                    )?.team_uuid || null
                                                );
                                                setTeamPopoverOpenState(false);
                                              }}
                                          >
                                            <span>{team.team_name}</span>
                                          </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <div className='h-4'>
                              {error && (
                                <p className="text-sm text-destructive">{error.message}</p>
                              )}
                            </div>
                          </>
                        )}
                    />

                  </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="default" type="submit" disabled={!isValid || isSubmitting}>
                {isSubmitting ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
};

export default CreateProjectDialog;