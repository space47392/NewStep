export type RootStackParamList = {
  Auth: undefined;
  ChooseUsername: undefined;
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
  CreatePost: { post?: Post } | undefined;
  PostDetail: { post: Post };
  Conversation: { conversationId: string; otherUser: ChatProfile };
  UserProfile: { userId: string };
  School: { schoolName: string };
  Notifications: undefined;
  StoryViewer: { stories: Story[]; initialIndex: number };
  PhotoViewer: { photoUrls: string[]; initialIndex: number };
};

export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  school_name: string | null;
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

export type PostCategory = 'Need Help' | 'School Question' | 'Looking for Friends';

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
};

export type NotificationType =
  | 'like'
  | 'comment'
  | 'volunteer'
  | 'help_completed'
  | 'points_earned'
  | 'achievement_earned'
  | 'message';

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
  } | null;
};
