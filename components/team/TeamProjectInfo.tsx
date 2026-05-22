import { ProjectInfoInterface } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Trash, Users, RotateCcw } from "@/lib/icons";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";
import Link from "next/link";
import { app_project_path } from "@/types/paths";
import { ColorIcon } from "@/components/colorIcon/colorIcon";
import { cn } from "@/lib/utils/helpers/cn";

interface ProjectsInfoInterface {
    projectInfo: ProjectInfoInterface
    handleDelete: (id: string) => void
    handleUnDelete: (id: string) => void
    handleProjectMembers: (id: string) => void
    isAdmin: boolean
}

/**
 * Desktop project row used inside team detail. Notion-style: tight
 * 56px row with brand-colour avatar, name + member count subtitle, and
 * admin actions revealed on hover.
 */
export const TeamProjectInfo = ({
    projectInfo,
    handleDelete,
    handleUnDelete,
    isAdmin,
    handleProjectMembers,
}: ProjectsInfoInterface) => {
    const isDeleted = !isZeroEpoch(projectInfo.project_deleted_at || "")

    return (
        <div className="group flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-accent/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
                <ColorIcon name={projectInfo.project_uuid} size="sm" />
                <div className="flex flex-col min-w-0">
                    {projectInfo.project_is_member ? (
                        <Link
                            href={`${app_project_path}/${projectInfo.project_uuid}`}
                            className="text-sm font-medium text-foreground truncate hover:underline"
                        >
                            {projectInfo.project_name}
                        </Link>
                    ) : (
                        <span className="text-sm font-medium text-muted-foreground truncate">
                            {projectInfo.project_name}
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                        {projectInfo.project_member_count || 0}{" "}
                        {(projectInfo.project_member_count || 0) === 1 ? "member" : "members"}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleProjectMembers(projectInfo.project_uuid)}
                    aria-label="View project members"
                >
                    <Users className="h-4 w-4" />
                </Button>
                {isAdmin &&
                    (isDeleted ? (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-500/10"
                            onClick={() => handleUnDelete(projectInfo.project_uuid)}
                            aria-label="Restore project"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                            )}
                            onClick={() => handleDelete(projectInfo.project_uuid)}
                            aria-label="Archive project"
                        >
                            <Trash className="h-4 w-4" />
                        </Button>
                    ))}
            </div>
        </div>
    )
}
