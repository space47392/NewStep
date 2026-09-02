import { supabase } from './supabase';
import { ReportReason, ReportTargetType } from '../types';

// Maps a target type to the one reports.* column that gets populated — see
// the reports_target_matches_type check constraint in safety_moderation_schema.sql.
const TARGET_COLUMN: Record<ReportTargetType, string> = {
  post: 'post_id',
  comment: 'comment_id',
  story: 'story_id',
  profile: 'reported_user_id',
  message: 'message_id',
};

// Stores only the target's id/reference — never the reported content itself
// (no post/comment/message text is copied in). RLS has no SELECT policy for
// this table at all, so this is a fire-and-forget insert; there's nothing to
// read back.
export async function submitReport(params: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const column = TARGET_COLUMN[params.targetType];
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    target_type: params.targetType,
    [column]: params.targetId,
    reason: params.reason,
    details: params.details?.trim() || null,
  });

  // 23505 = unique_violation — already reported this exact thing; treat as a
  // no-op success rather than surfacing an error for a harmless double-submit.
  if (error && error.code !== '23505') throw error;
}
