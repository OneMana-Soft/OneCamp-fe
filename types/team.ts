import {UserProfileDataInterface} from "@/types/user";
import {ProjectInfoInterface} from "@/types/project";

export interface TeamInfoInterface {
    id: string
    uid?: string;
    team_uuid: string;
    team_name: string;
    team_projects?: ProjectInfoInterface[];
    team_is_admin?: boolean;
    team_member_count ?: number;
    team_is_member?: boolean;
    team_members?: UserProfileDataInterface[];
    team_admins?: UserProfileDataInterface[];
    team_created_by?: UserProfileDataInterface;
    team_created_at?: string;
    team_updated_at?: string;
    team_deleted_at?: string;
}

export interface TeamNameExistsInterface {
    exists: boolean;
}

export interface TeamListResponseInterface {
    data: TeamInfoInterface[]
    has_more: boolean;
}

export interface TeamInfoRawInterface {
    data: TeamInfoInterface;
}

export interface TeamMemberAddOrRemoveInterface {
    member_uuid: string
    team_uuid: string
}

export interface TeamDeleteOrUndeleteInterface {
    team_uuid: string
}