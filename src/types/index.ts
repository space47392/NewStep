export type RootStackParamList = {
  Auth: undefined;
  ChooseUsername: undefined;
  // Shown once, right after ChooseUsername, only for a brand-new signup in
  // this same app session — see AppNavigator. Distinct from MainStackParamList's
  // own "ChooseSchool" (the always-available Profile entry point); same
  // screen component, two different navigators, no relation between the two.
  ChooseSchool: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Feed: undefined;
  Search: undefined;
  Help: undefined;
  Chat: undefined;
  Volunteer: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  // { screen } lets a stack screen (e.g. Notifications) deep-link into a
  // specific tab — standard React Navigation nested-navigator navigation,
  // not a new architecture.
  Tabs: { screen: keyof MainTabParamList } | undefined;
  // prefillContent: lets a caller (e.g. StoryViewer's "I Can Help") start a
  // new post with a draft already in the box — the user still has to review
  // and tap Post themselves, same as editing an existing draft would.
  // prefillCategory: same idea, for the category chips.
  // sourceStoryId/sourceStoryAuthorName: School Story context for "I Can
  // Help" — sourceStoryId is persisted onto the created post (posts.source_story_id);
  // sourceStoryAuthorName is shown only in this screen's compose banner, never stored.
  CreatePost:
    | {
        post?: Post;
        prefillContent?: string;
        prefillCategory?: PostCategory;
        sourceStoryId?: string;
        sourceStoryAuthorName?: string | null;
      }
    | undefined;
  // focusComment: true lets a caller (e.g. FeedScreen's "X Comments" link)
  // ask the screen to focus the comment input as soon as it opens.
  PostDetail: { post: Post; focusComment?: boolean };
  // prefillText: same idea as CreatePost's prefillContent, for a caller (e.g.
  // StoryViewer's "Say Hi") that wants to start the composer with a friendly
  // draft already typed — never sent automatically, the user still has to hit Send.
  Conversation: { conversationId: string; otherUser: ChatProfile; prefillText?: string };
  UserProfile: { userId: string };
  // schoolId is optional — every existing caller only had a free-text name to
  // pass, and still does; this screen falls back to schoolName wherever
  // schoolId isn't available. schoolName is still required so the header
  // always has something to show even before/without a directory match.
  School: { schoolId?: string; schoolName: string };
  Notifications: undefined;
  FollowList: { userId: string; mode: 'followers' | 'following' };
  SavedPosts: undefined;
  ChooseSchool: undefined;
  EditProfile: undefined;
  StoryViewer: { stories: Story[]; initialIndex: number };
  PhotoViewer: { photoUrls: string[]; initialIndex: number };
};

export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  school_name: string | null;
  // Nullable — set only once a user picks from the school directory (see
  // ChooseSchoolScreen). NULL is a normal, fully-functional state: every
  // school-scoped feature falls back to school_name until this is set.
  // Never treated as proof of enrollment.
  school_id: string | null;
  grade: string | null;
  interests: string[];
  avatar_url: string | null;
  points: number;
  // null = hasn't answered "Are you new to this school?" yet — distinct from
  // false ("Not right now") on purpose, since the question is optional.
  is_new_student: boolean | null;
  // Client-immutable — see guard_profile_role_update() in
  // safety_moderation_schema.sql. No UI reads or sets this yet.
  role: 'user' | 'moderator' | 'admin';
  updated_at: string;
  // Public total, same shape as `points` — see thanks_received_schema.sql.
  // Only ever incremented by thank_helper(); client-immutable otherwise.
  thanks_received_count: number;
};

// See safety_moderation_schema.sql's reports table.
export type ReportTargetType = 'post' | 'comment' | 'story' | 'profile' | 'message';
export type ReportReason = 'harassment' | 'spam' | 'inappropriate' | 'impersonation' | 'hate' | 'other';

// The public-safe subset of Profile shown on the leaderboard — deliberately
// narrower than a full Profile select (no interests/username/grade/updated_at).
export type LeaderboardEntry = Pick<Profile, 'id' | 'full_name' | 'school_name' | 'avatar_url' | 'points'>;

// Public-safe subset of Profile for school member discovery — deliberately
// excludes points/username-adjacent internals; see fetchSchoolMembers().
export type SchoolMember = Pick<Profile, 'id' | 'full_name' | 'username' | 'avatar_url' | 'grade' | 'interests'>;

// Public-safe subset of Profile for people search — see search.ts's
// searchUsers(). Same fields SchoolMember exposes, plus school_name (search
// results span schools, unlike a single school's member list).
export type PersonSearchResult = Pick<
  Profile,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'school_name' | 'grade' | 'interests'
>;

// Public-safe subset of Profile for "Community Contributors" — ranked by
// real contribution signals only (thanks_received_count), never
// followers/likes. See schools.ts's fetchSchoolContributors*().
export type SchoolContributor = Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'points' | 'thanks_received_count'>;

// One row from search_schools_by_name() — see search_discovery_schema.sql.
// Deliberately just a name + count, never per-student data.
export type SchoolSearchResult = {
  schoolName: string;
  studentCount: number;
};

// One row from the schools directory table (Step 15 — schools_directory_schema.sql).
// Selecting one is a self-reported community label, never proof of
// enrollment or a "verified" mark — see ChooseSchoolScreen.
export type School = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string;
  district: string | null;
};

// One row of a user's private points_history ledger (see points_history_schema.sql).
// Only ever inserted by handle_post_completed() — never client-writable.
export type PointsHistoryEntry = {
  id: string;
  amount: number;
  reason: string;
  post_id: string | null;
  created_at: string;
};

// Static achievement definition (see achievements_schema.sql) — public, read-only.
export type Achievement = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  metric: string;
  requirement: number;
};

// An Achievement merged with whether/when the profile being viewed earned it.
export type AchievementProgress = Achievement & {
  earned: boolean;
  earnedAt: string | null;
};

export type PostCategory = 'Need Help' | 'School Question' | 'Looking for Friends' | 'Event';

export type PostStatus = 'open' | 'accepted' | 'completed';

export type Post = {
  id: string;
  author_id: string;
  content: string;
  category: PostCategory;
  status: PostStatus;
  like_count: number;
  photo_urls: string[];
  created_at: string;
  // Set only when this post was created via a School Story's "I Can Help"
  // action (see posts_story_origin.sql) — null for every other post. Never
  // exposes story content/author, just whether one exists; ON DELETE SET
  // NULL means a later-deleted story silently clears this, nothing breaks.
  source_story_id: string | null;
  // Structured date/time/location for category === 'Event' posts only — see
  // school_events_schema.sql. Null for every other category; a "Community
  // Event," never school-verified. event_end_time/event_location are optional.
  event_date: string | null;
  event_end_time: string | null;
  event_location: string | null;
  // PostgREST embedded aggregate — see POST_SELECT in lib/posts.ts. Absent on any
  // select that doesn't ask for it, so always optional-chain when reading it.
  comments?: { count: number }[];
  profiles: {
    id: string;
    full_name: string | null;
    school_name: string | null;
    avatar_url: string | null;
  } | null;
  helper: {
    id: string;
    full_name: string | null;
    school_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type Comment = {
  id: string;
  post_id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ChatProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type Conversation = {
  id: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  otherUser: ChatProfile;
  unreadCount: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  // Nullable, self-referencing — see message_replies_schema.sql. The reply
  // preview is resolved client-side from messages already loaded, never
  // duplicated; this is just the pointer.
  reply_to_message_id: string | null;
};

export type NotificationType =
  | 'like'
  | 'comment'
  | 'volunteer'
  | 'help_completed'
  | 'points_earned'
  | 'achievement_earned'
  | 'message'
  | 'follow'
  | 'story_wave'
  | 'thanks_received';

// See notifications_schema.sql — stores only IDs/relationships, never
// duplicated profile or post data. actor/achievement are joined at read time
// (fetchNotifications), same as posts already join their author.
export type AppNotification = {
  id: string;
  type: NotificationType;
  post_id: string | null;
  conversation_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: ChatProfile | null;
  achievement: Pick<Achievement, 'id' | 'key' | 'name' | 'icon'> | null;
};

export type Story = {
  id: string;
  author_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    school_name: string | null;
  } | null;
};
