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

// --- Response Wrappers ---

const GenericResponseSchema = z.object({
  msg: z.string().optional(),
  data: z.any(),
}).passthrough();

export const UserProfileResponseSchema = GenericResponseSchema.extend({
  data: UserProfileDataSchema,
});
