export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Feed: undefined;
  Help: undefined;
  Chat: undefined;
  Volunteer: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  CreatePost: undefined;
  PostDetail: { post: Post };
};

export type Profile = {
  id: string;
  full_name: string | null;
  school_name: string | null;
  grade: string | null;
  interests: string[];
  avatar_url: string | null;
  points: number;
  updated_at: string;
};

export type PostCategory = 'Need Help' | 'School Question' | 'Looking for Friends';

export type PostStatus = 'open' | 'accepted' | 'completed';

export type Post = {
  id: string;
  author_id: string;
  content: string;
  category: PostCategory;
  status: PostStatus;
  created_at: string;
  profiles: {
    full_name: string | null;
    school_name: string | null;
    avatar_url: string | null;
  } | null;
  helper: {
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
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};
