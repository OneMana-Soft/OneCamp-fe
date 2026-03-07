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

export type AttachmentDocument = "pdf" | "text"

interface AttachmentCollageItem {
    attachment: AttachmentMediaReq
    span: number
    row: number
    height?: string
    aspectRatio?: number
}

export type AttachmentCollageLayoutType = "none" | "single" | "dual" | "triple" | "quad" | "mosaic"


export interface AttachmentCollageLayout {
    type: AttachmentCollageLayoutType
    items: AttachmentCollageItem[]
    maxWidth?: number
    maxHeight?: number
}

export const ATTACHMENT_MAX_IMAGE_GRID_SIZE = 4
