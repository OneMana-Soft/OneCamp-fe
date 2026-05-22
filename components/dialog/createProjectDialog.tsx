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
import {useState} from "react";
import {TeamListResponseInterface} from "@/types/team";
import {useFetch} from "@/hooks/useFetch";
import {useDispatch} from "react-redux";
import {addUserProjectList} from "@/store/slice/userSlice";
import {ProjectInfoInterface} from "@/types/project";

const createProjectFormSchema = z.object({
  project_name: z
      .string()
      .trim()
      .min(4, "Project name must be at least 4 characters")
      .max(30, "Project name must be at most 30 characters")
      .regex(/^[A-Za-z0-9_\s]+$/, "Project name must only contain letters, numbers, and underscores"),
  project_team_uuid: z
      .string()
      .min(1, "Please select team")
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


  const onSubmit = async (data: CreateTeamFormValues) => {
    makeRequest<CreateTeamFormValues, ProjectInfoInterface>({
      payload: data,
      apiEndpoint: PostEndpointUrl.CreateProject
    }).then((res)=>{
      if (res) {
        dispatch(addUserProjectList({ projectUser: res }));
      }
      closeModal()
    });
  };

  // Close the dialog
  const closeModal = () => {
    reset()
    setOpenState(false);
  };

  return (
      <Dialog onOpenChange={closeModal} open={dialogOpenState}>
        <DialogContent id="create-project-dialog" className="max-w-[95vw] md:max-w-[30vw]">
          <DialogHeader>
            <DialogTitle className="text-start">Create Project</DialogTitle>
            <DialogDescription className="hidden">
              Create a new project
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4 space-y-3">
              <div className="grid gap-2 ">
                <Label>Project Name</Label>
                <Controller
                    name="project_name"
                    control={control}
                    render={({ field, fieldState: { error } }) => (
                        <>
                          <Input
                              {...field}
                              id="teamName"
                              placeholder="Type project name"
                              autoFocus
                          />

                            {error && (
                                <p className="text-sm text-destructive">{error.message}</p>
                            )}
                        </>
                    )}
                />
              </div>

              { teamsInfo.data?.data && (
                  <div className="flex items-center space-x-4">
                    <Label>Team:</Label>
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
                                  <CommandInput placeholder="Change team..." />
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
                {isSubmitting ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
};

export default CreateProjectDialog;