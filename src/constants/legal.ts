// Everything NewStep promises its students, in one place: the Terms, the
// Privacy Policy and the Community Guidelines shown in Settings and at sign-up.
//
// BEFORE RELEASE:
//  - Set CONTACT_EMAIL to the address students and parents should write to.
//  - Have someone qualified read these texts — they're a plain-language
//    starting point written for this app, not legal advice.
//  - If anything here changes, bump LEGAL_UPDATED.

// Shown publicly in the app. Left empty until the team picks the address.
export const CONTACT_EMAIL = '';

export const LEGAL_UPDATED = 'October 24, 2026';

// Nobody younger can make an account (see the birthday step at sign-up).
export const MIN_AGE = 13;

export type LegalDoc = 'terms' | 'privacy' | 'guidelines';

export type LegalSection = { heading: string; body: string[] };

const contactLine = CONTACT_EMAIL
  ? `Email us at ${CONTACT_EMAIL}. We read every message.`
  : 'Reach us through the contact email on NewStep’s app store page. We read every message.';

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  guidelines: 'Community Guidelines',
};

export const LEGAL_INTROS: Record<LegalDoc, string> = {
  terms: 'The deal between you and NewStep, in plain words.',
  privacy: 'What we collect, why, and the control you have over it.',
  guidelines: 'How we keep NewStep a kind place to land at a new school.',
};

export const LEGAL_DOCS: Record<LegalDoc, LegalSection[]> = {
  terms: [
    {
      heading: 'Welcome',
      body: [
        'NewStep helps students settle in at a new school: meet classmates, ask for help, offer help and share how the day is really going. These Terms are an agreement between you and the NewStep team. By creating an account or using NewStep, you agree to them.',
      ],
    },
    {
      heading: 'Who can use NewStep',
      body: [
        `You must be at least ${MIN_AGE} years old. If you are under 18, please go over these Terms with a parent or guardian — by using NewStep you confirm that they are okay with it.`,
        'One person, one account. Use your real first name so classmates know who they are talking to, and keep your password to yourself. You are responsible for what happens on your account.',
      ],
    },
    {
      heading: 'Your content',
      body: [
        'Posts, photos, comments, messages, stories, stars and lanterns you share stay yours. You give NewStep permission to store and show them to the people they are meant for (for example, students at your school), only so the app can work.',
        'Only share things you have the right to share, and never share someone else’s private information or photos without their permission.',
      ],
    },
    {
      heading: 'Be kind — it’s the rule',
      body: [
        'Everything you do on NewStep must follow the Community Guidelines. We may remove content or limit, suspend or close accounts that break them, especially when someone’s safety is involved.',
      ],
    },
    {
      heading: 'Helping each other',
      body: [
        'Help on NewStep comes from fellow students, not from school staff or professionals. Use your own judgement, meet in public places at school, and tell a trusted adult if anything feels off.',
        'NewStep is not an emergency or crisis service. If you or someone else is in danger, call 911. In the US you can call or text 988 at any time to reach the Suicide & Crisis Lifeline.',
      ],
    },
    {
      heading: 'Leaving NewStep',
      body: [
        'You can delete your account at any time in Settings. That permanently removes your profile and the content tied to it, as described in the Privacy Policy.',
      ],
    },
    {
      heading: 'The fine print',
      body: [
        'NewStep is provided “as is.” We work hard to keep it running and safe, but we can’t promise it will always be available or free of mistakes, and we aren’t responsible for what other users say or do. To the extent the law allows, the NewStep team is not liable for indirect or incidental damages from using the app.',
        'We may update these Terms as NewStep grows. If the changes matter, we’ll tell you in the app before they take effect. Continuing to use NewStep after that means you accept the new Terms.',
      ],
    },
    { heading: 'Questions', body: [contactLine] },
  ],

  privacy: [
    {
      heading: 'The short version',
      body: [
        'We collect only what NewStep needs to work. We never sell your information, we don’t show ads, and you can delete your account and data whenever you want.',
      ],
    },
    {
      heading: 'What we collect',
      body: [
        'Account: your email address, password (stored encrypted by our sign-in provider) and name.',
        'Profile: your username, school, grade, interests, whether you’re new to your school, and a profile photo if you add one.',
        'What you share: posts, photos, comments, messages, stories, help offers, School Sky stars and moods, and lanterns.',
        'Safety: reports you send, people you block, and moderation records.',
        'Device: a push notification token if you allow notifications.',
        'At sign-up we ask for your birthday only to check that you are old enough. We don’t store the date itself.',
      ],
    },
    {
      heading: 'How we use it',
      body: [
        'To run NewStep: show your profile and posts to students at your school, deliver messages and notifications, match you with classmates who share your interests, and keep track of help and thank-yous.',
        'To keep everyone safe: review reports, enforce the Community Guidelines and stop abuse.',
      ],
    },
    {
      heading: 'Who can see what',
      body: [
        'Your profile and posts are visible to other NewStep students. Your email address is never shown to anyone. Messages are visible only to you and the person you’re talking with.',
        'Lanterns appear without your name. They are still linked to your account behind the scenes so we can act if a lantern breaks the rules or suggests someone may be in danger.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We don’t sell or rent your information. We use a small number of service providers to run the app: Supabase stores the app’s data and handles sign-in, and Expo delivers push notifications. They only process data on our behalf.',
        'We may share information if the law requires it, or when it’s needed to protect someone from serious harm.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'We keep your information while your account is open. When you delete your account in Settings, your profile, posts, comments, stories and other content are permanently deleted. Messages you sent stay visible to the person you sent them to, without your name.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can edit your profile, delete posts and messages, block people, turn off notifications in your phone’s settings and delete your account at any time.',
        'Depending on where you live (for example, California), you may have extra rights, such as asking what we hold about you. Contact us and we’ll help.',
      ],
    },
    {
      heading: 'Students under 13',
      body: [
        `NewStep is not for anyone under ${MIN_AGE}, and we don’t knowingly collect their information. If you believe a child under ${MIN_AGE} has an account, contact us and we’ll delete it.`,
      ],
    },
    {
      heading: 'Changes',
      body: ['If we change this policy in a way that matters, we’ll let you know in the app first.'],
    },
    { heading: 'Contact', body: [contactLine] },
  ],

  guidelines: [
    {
      heading: 'Why we have these',
      body: [
        'Starting at a new school is hard. NewStep should feel like the friendliest hallway on campus — a place where anyone can ask a question without feeling silly.',
      ],
    },
    {
      heading: 'Be kind',
      body: [
        'Treat everyone the way you’d want to be treated on your first day. No bullying, harassment, insults, threats, or ganging up on anyone.',
        'No hate based on race, ethnicity, religion, gender, sexual orientation, disability or where someone is from.',
      ],
    },
    {
      heading: 'Keep it safe',
      body: [
        'No sexual content, no violence or threats, and nothing that encourages self-harm or dangerous challenges.',
        'No drugs, alcohol, weapons or anything illegal.',
        'If you’re struggling, you’re not alone — call or text 988 (US) any time, and talk to a trusted adult.',
      ],
    },
    {
      heading: 'Respect privacy',
      body: [
        'Don’t share anyone’s phone number, address, private messages or photos without their permission — and keep your own private details private too.',
      ],
    },
    {
      heading: 'Be real',
      body: [
        'Use your own name, don’t pretend to be someone else, and only offer help you actually mean to give. No spam, scams or selling.',
      ],
    },
    {
      heading: 'Meeting up',
      body: [
        'If you meet someone you know from NewStep, meet at school or in a public place, and let a friend or adult know where you’ll be.',
      ],
    },
    {
      heading: 'If something’s wrong',
      body: [
        'Use Report on any post, comment, message or profile, and Block anyone you don’t want to hear from. Reports are private — the other person isn’t told who reported them.',
        'We review reports and may remove content or close accounts that break these guidelines. If someone is in danger, call 911.',
      ],
    },
  ],
};
