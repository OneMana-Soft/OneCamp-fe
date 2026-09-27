export interface AttachmentMediaReq {
    attachment_uuid: string
    attachment_file_name: string
    attachment_obj_key ?: string
    attachment_type: AttachmentType
    attachment_size: number
    attachment_created_at: string
    attachment_width?: number
    attachment_height?: number
    attachment_duration?: number
    attachment_raw_type?: string
    initial_url?: string
}


export type AttachmentType = 'image' | 'video' | 'audio' | 'document' | 'other';

export const ATTACHMENT_MAX_IMAGE_GRID_SIZE = 4
