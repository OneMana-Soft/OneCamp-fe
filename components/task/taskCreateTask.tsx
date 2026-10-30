import TaskCreateForm from "@/components/task/taskCreateForm";
import {useRouter, useSearchParams} from "next/navigation";
import { taskAddressQuery } from "@/lib/task/taskAddressParams";
import { useTaskAddress } from "@/hooks/useTaskAddress";

export const TaskCreateTask = () => {

    const router = useRouter();
    // A link's fields (?title=…) fill the form, as the dialog's on a computer.
    const params = useSearchParams();
    const { ready, address } = useTaskAddress(taskAddressQuery(params));

    const handleClick = () => {
        router.back();
    }

    return (
        <div>
            {ready && <TaskCreateForm submitLabel="Create task" address={address} onSuccess={handleClick}/>}
        </div>
    )

}
