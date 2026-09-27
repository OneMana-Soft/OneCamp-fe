import TaskCreateForm from "@/components/task/taskCreateForm";
import {useRouter} from "next/navigation";

export const TaskCreateTask = () => {

    const router = useRouter();

    const handleClick = () => {
        router.back();
    }

    return (
        <div>
            <TaskCreateForm submitLabel="Create Task" onSuccess={handleClick}/>
        </div>
    )

}