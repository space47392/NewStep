// Curated onboarding/profile interest options — not a second taxonomy, just
// ordinary strings written into the same profiles.interests text[] column
// free-text entry always allowed. Shared by ChooseInterestsScreen
// (onboarding) and EditProfileScreen via InterestPicker so both offer the
// exact same options from one source instead of two lists that could drift.
export const MAX_INTERESTS = 5;

export const INTEREST_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Hobbies',
    items: [
      'Basketball', 'Soccer', 'Gaming', 'Music', 'Guitar', 'Art', 'Reading',
      'Photography', 'Movies', 'Cooking', 'Fitness', 'Swimming', 'Travel',
    ],
  },
  {
    title: 'Academic & Tech',
    items: ['Coding', 'Computer Science', 'Technology', 'Science', 'Biology', 'Chemistry', 'Physics', 'Math', 'Writing'],
  },
];
