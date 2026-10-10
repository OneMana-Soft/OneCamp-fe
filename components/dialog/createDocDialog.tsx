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
import {Switch} from "@/components/ui/switch";
import {DocInfoInterface} from "@/types/doc";
import {app_doc_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import { nameSchema } from "@/lib/validation/names";

const createDocFormSchema = z.object({
    doc_title: nameSchema("title", "Doc title"),
    doc_private: z.boolean(),
});

type CreateDocFormValues = z.infer<typeof createDocFormSchema>;

interface CreateDocDialogProps {
    dialogOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

const CreateDocDialog: React.FC<CreateDocDialogProps> = ({
                                                                  dialogOpenState,
                                                                  setOpenState,
                                                              }) => {
    const {
        control,
        handleSubmit,
        reset,
        formState: { isValid },
    } = useForm<CreateDocFormValues>({
        resolver: zodResolver(createDocFormSchema),
        mode: "onChange",
        defaultValues: {
            doc_title: "",
            doc_private: false,
        },
    });

    const router = useRouter()

    const { makeRequest, isSubmitting } = usePost();

    const onSubmit = (data: CreateDocFormValues) => {
        makeRequest<CreateDocFormValues, DocInfoInterface>({
            payload: data,
            apiEndpoint: PostEndpointUrl.CreateDoc,
        }).then((res)=> {
            if(res && res.doc_uuid) {
                router.push(app_doc_path +'/'+res.doc_uuid);
            }
            closeModal()
        });

    };

    const closeModal = () => {
        reset();
        setOpenState(false);
    };

    return (
        <Dialog onOpenChange={closeModal} open={dialogOpenState}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-start">New doc</DialogTitle>
                    <DialogDescription className="text-start">
                        A page your team writes in together.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
                    <div className="grid gap-2">
                        <Label htmlFor="docTitle">Title</Label>
                        <Controller
                            name="doc_title"
                            control={control}
                            render={({field, fieldState: {error}}) => (
                                <>
                                    <Input
                                        {...field}
                                        id="docTitle"
                                        placeholder="Launch plan"
                                        autoFocus
                                        aria-invalid={!!error}
                                    />
                                    {error && (
                                        <p className="text-sm text-danger-ink">{error.message}</p>
                                    )}
                                </>
                            )}
                        />
                    </div>

                    {/* A setting row: what it is and what it means on the left,
                        the switch on the right, the label naming the switch. */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="grid gap-1">
                            <Label htmlFor="docPrivate">Private</Label>
                            <p id="docPrivate-hint" className="text-xs text-muted-foreground">
                                Only you, and the people you share it with, can open it.
                            </p>
                        </div>
                        <Controller
                            name="doc_private"
                            control={control}
                            render={({field}) => (
                                <Switch
                                    id="docPrivate"
                                    aria-describedby="docPrivate-hint"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            )}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? "Creating…" : "Create doc"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default CreateDocDialog;
