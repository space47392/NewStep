import { soundsLikeCrisis } from '../crisis';

// Missing one of these means a student in danger doesn't see support lines,
// so every phrasing that has come up belongs here.
describe('soundsLikeCrisis', () => {
  it.each([
    'I want to kill myself',
    'i wanna die',
    'I wanted to die last night',
    'sometimes I just want to end it all',
    'thinking about suicide',
    'I keep thinking about self-harm',
    'self harm',
    'I cut myself again',
    'there is no reason to live',
    'everyone would be better off without me',
    "I don't want to be here anymore",
    'I don’t want to be here anymore', // curly apostrophe, the iOS default
    'I dont want to be here',
    'kms',
    'honestly kms.',
    // Ambiguous, but erring towards showing support is the safe mistake.
    'the park is 5 kms away',
    'K I L L  M Y S E L F',
    '죽고 싶어',
    '죽고싶다',
    '자살',
    '살기 싫어',
    '그냥 사라지고 싶어',
  ])('flags %p', (text) => {
    expect(soundsLikeCrisis(text)).toBe(true);
  });

  it.each([
    '',
    'I had a great day!',
    'This math test is killing me',
    'I could die laughing',
    'my bookmarks are a mess', // "kms" inside a word
    'I want to be here with my friends',
    'my hands are cold',
    '오늘 너무 피곤해',
  ])('does not flag %p', (text) => {
    expect(soundsLikeCrisis(text)).toBe(false);
  });
});
