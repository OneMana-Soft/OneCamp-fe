import {PostsRes} from "@/types/post";
import {UserProfileDataInterface} from "@/types/user";
import {RecordingInfoInterface} from "@/types/recording";
import {CommentInfoInterface} from "@/types/comment";
import {ChannelInfoInterface} from "@/types/channel";
import {ProjectInfoInterface} from "@/types/project";
import {AttachmentMediaReq} from "@/types/attachment";

export interface DocInfoInterface {
    doc_uuid: string,
    id?: string,
    doc_title: string,
    doc_body: string,
    doc_snippet?: string,
    doc_edit_access: number,
    doc_read_access: number,
    doc_comment_access: number,
    doc_editing_users: UserProfileDataInterface[],
    doc_reading_users: UserProfileDataInterface[],
    doc_public_comment: boolean,
    doc_private: boolean,
    doc_commenting_users: UserProfileDataInterface[],
    doc_created_by: UserProfileDataInterface,
    doc_comments: CommentInfoInterface[],
    doc_comment_count: number,
    doc_created_at: string,
    doc_updated_at: string,
    doc_mqtt_topic: string,
    doc_deleted_at: string,
}

export interface DocInfoListInterface {
    docs: DocInfoInterface[],
    count: number,
}

export interface DocInfoListInterfaceResp {
    msg: string;
    pageCount?: number;
    data: DocInfoListInterface;
}

export interface DocInfoResponse {
    msg: string;
    data: DocInfoInterface;
}


export interface DocSidebarInfo {
    doc_uuid: string;
    doc_title: string;
}

export interface CreateDocCommentInterface {
    doc_comment_uuid?: string;
    doc_comment_body?: string;
    doc_uuid?: string;
    doc_comment_attachments?: AttachmentMediaReq[];
}


// Doc snapshot (version history). Mirrors the board snapshot shape; the blob
// (gzipped HTML body) lives in object storage, this is the metadata for the UI.
export interface DocSnapshotContributor {
    user_uuid: string;
    user_full_name?: string;
    user_name?: string;
    user_profile_object_key?: string;
}

export interface DocSnapshot {
    id: string;
    body_bytes: number;
    reason: "interval" | "mass_delete" | "manual";
    created_at: string;
    contributors?: DocSnapshotContributor[];
}

export interface DocSnapshotListResponse {
    msg: string;
    data: DocSnapshot[] | null;
}
