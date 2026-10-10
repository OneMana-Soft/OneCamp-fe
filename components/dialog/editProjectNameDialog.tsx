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

import {ProjectInfoRawInterface} from "@/types/project";
import {useDispatch} from "react-redux";
import {updateUserProjectList} from "@/store/slice/userSlice";
import { nameSchema } from "@/lib/validation/names";

const createTeamFormSchema = z.object({
    project_name: nameSchema("workspace", "Project name"),
    project_uuid: z.string(),
});

type UpdateTeamFormValues = z.infer<typeof createTeamFormSchema>;

interface EditTeamDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
    projectId: string
}

const EditTeamNameDialog: React.FC<EditTeamDialogProps> = ({
                                                              dialogOpenState,
                                                              setOpenState,
                                                              projectId
                                                          }) => {
    const dispatch = useDispatch();
    const projectInfo = useFetch<ProjectInfoRawInterface>(`${projectId ? GetEndpointUrl.GetProjectInfo+'/'+ projectId : ''}`);
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
            project_name: "",
            project_uuid: projectId,
        },
    });


    useEffect(() => {
        if (projectInfo.data?.data) {
            const originalName = projectInfo.data?.data.project_name;
            reset({
                project_name: originalName,
                project_uuid: projectId
            });
            setOriginalTeamName(originalName); // Set original name
        }
    }, [projectInfo.data?.data]);

    const { makeRequest, isSubmitting } = usePost();


    const onSubmit =  (data: UpdateTeamFormValues) => {
         makeRequest<UpdateTeamFormValues>({
            payload: data,
            apiEndpoint: PostEndpointUrl.UpdateProjectName,
            showToast: true
        }).then(()=> {

            dispatch(updateUserProjectList({projectName: data.project_name, projectUUID: data.project_uuid}));
             projectInfo.mutate()
             closeModal();
         });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };



    const p_name = watch("project_name");

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="max-w-[95vw] md:max-w-[30vw]">
                <DialogHeader>
                    <DialogTitle className="text-start">Rename the project</DialogTitle>
                    <DialogDescription className="hidden">
                        Edit project name
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-4 space-y-3">
                        <div className="grid gap-2">
                            <Label htmlFor="projectName">Project name</Label>
                            <Controller
                                name="project_name"
                                control={control}
                                render={({field, fieldState: {error}}) => (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                {...field}
                                                id="projectName"
                                                placeholder="e.g. Q4 launch"
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            {error && (
                                                <p className="text-xs md:text-sm text-danger-ink">{error.message}</p>
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
                                (p_name == originalTeamName)
                            }
                        >
                            {isSubmitting ? "Updating…" : "Rename"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default EditTeamNameDialog;