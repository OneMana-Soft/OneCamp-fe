import { z } from "zod";

// --- Base Schemas ---

const UserProfileDataSchema = z.object({
  user_uuid: z.string().uuid(),
  user_name: z.string(),
  user_full_name: z.string().optional(),
  user_email_id: z.string().email().optional(),
  user_profile_object_key: z.string().optional().nullable(),
  user_is_admin: z.boolean().optional(),
  user_status: z.string().optional(),
  user_job_title: z.string().optional(),
}).passthrough();

// --- Module Schemas ---

const ChannelInfoSchema = z.object({
  ch_uuid: z.string().uuid(),
  ch_name: z.string(),
  ch_private: z.boolean(),
  ch_icon: z.string().optional().nullable(),
  ch_about: z.string().optional().nullable(),
  unread_post_count: z.number().optional().default(0),
  ch_member_count: z.number().optional().default(0),
  ch_created_at: z.string().optional(),
}).passthrough();

// --- Response Wrappers ---

const GenericResponseSchema = z.object({
  msg: z.string().optional(),
  data: z.any(),
}).passthrough();

export const UserProfileResponseSchema = GenericResponseSchema.extend({
  data: UserProfileDataSchema,
});

export const ChannelInfoListSchema = z.object({
  // Backend can sometimes return `null` instead of `[]` for channels_list.
  // Normalize null/undefined to an empty array before validation so Zod doesn't throw.
  channels_list: z.preprocess(
    (val) => (val == null ? [] : val),
    z.array(ChannelInfoSchema),
  ),
  msg: z.string().optional(),
}).passthrough();
