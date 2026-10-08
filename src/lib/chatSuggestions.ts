import { fetchProfileById } from './profile';
import { fetchBlockedUserIds } from './blocks';
import {
  fetchSchoolMembersByGrade,
  fetchSchoolMembersByGradeById,
  fetchSchoolMembersByInterests,
  fetchSchoolMembersByInterestsById,
} from './schools';
import { SchoolMember } from '../types';

export type ChatSuggestion = SchoolMember & {
  // Why they're suggested — a shared interest, or the shared grade.
  reason: string | null;
};

// Classmates you haven't talked to yet, for the "Say hi" strip on the chat
// list. Same sources as Search's People You May Know (same grade, shared
// interests at your school), minus anyone you already have a chat with.
export async function fetchChatSuggestions(
  userId: string,
  existingChatUserIds: Set<string>,
  limit = 8
): Promise<ChatSuggestion[]> {
  const me = await fetchProfileById(userId);
  if (!me.school_id && !me.school_name) return [];

  const [byInterests, byGrade, blocked] = await Promise.all([
    me.interests.length > 0
      ? me.school_id
        ? fetchSchoolMembersByInterestsById(me.school_id, me.interests, userId, 12)
        : fetchSchoolMembersByInterests(me.school_name!, me.interests, userId, 12)
      : Promise.resolve([] as SchoolMember[]),
    me.grade
      ? me.school_id
        ? fetchSchoolMembersByGradeById(me.school_id, me.grade, userId, 12)
        : fetchSchoolMembersByGrade(me.school_name!, me.grade, userId, 12)
      : Promise.resolve([] as SchoolMember[]),
    fetchBlockedUserIds(userId).catch(() => new Set<string>()),
  ]);

  const mine = new Set(me.interests.map((i) => i.toLowerCase()));
  const seen = new Set<string>();
  const out: ChatSuggestion[] = [];
  for (const m of [...byInterests, ...byGrade]) {
    if (seen.has(m.id) || m.id === userId || blocked.has(m.id) || existingChatUserIds.has(m.id)) continue;
    seen.add(m.id);
    const shared = m.interests.find((i) => mine.has(i.toLowerCase()));
    out.push({ ...m, reason: shared ?? (m.grade && m.grade === me.grade ? m.grade : null) });
    if (out.length >= limit) break;
  }
  return out;
}
