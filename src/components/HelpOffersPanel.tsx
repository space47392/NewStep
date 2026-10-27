import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { chooseHelper, fetchHelpOffers, HelpOffer, offerHelp, OFFER_MESSAGE_MAX, withdrawHelpOffer } from '../lib/helpOffers';
import { hasBlockedWords, KIND_WORDS_MESSAGE } from '../lib/contentFilter';
import { useToast } from '../contexts/ToastContext';
import { useWarmSheet } from './WarmSheet';
import Avatar from './Avatar';
import PrimaryButton from './PrimaryButton';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';
import { errorMessage } from '../lib/errors';

// On an open Need Help post: classmates offer to help (with an optional
// line about why), and the person who asked picks the one they want.
type Props = {
  postId: string;
  isAuthor: boolean;
  authorFirstName: string;
  // After a helper is chosen (the post moves to 'accepted').
  onChosen: () => void;
  onOpenProfile: (userId: string) => void;
};

export default function HelpOffersPanel({ postId, isAuthor, authorFirstName, onChosen, onOpenProfile }: Props) {
  const { showToast } = useToast();
  const { ask, sheet } = useWarmSheet('light');
  const [offers, setOffers] = useState<HelpOffer[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOffers(await fetchHelpOffers(postId));
    } catch {
      setOffers([]);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const myOffer = offers?.find((o) => o.mine) ?? null;

  const handleOffer = async () => {
    if (busy) return;
    if (message && hasBlockedWords(message)) {
      showToast(KIND_WORDS_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      await offerHelp(postId, message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage('');
      showToast(`Offer sent 🤝 ${authorFirstName} will choose a helper.`);
      await load();
    } catch (err) {
      showToast(errorMessage(err, "Couldn't send your offer."));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = () =>
    ask({
      title: 'Take back your offer?',
      actions: [
        {
          label: 'Take it back',
          danger: true,
          onPress: async () => {
            try {
              await withdrawHelpOffer(postId);
              await load();
            } catch (err) {
              showToast(errorMessage(err, "Couldn't do that."));
            }
          },
        },
      ],
    });

  const handleChoose = (o: HelpOffer) => {
    const first = o.full_name?.split(' ')[0] ?? 'them';
    ask({
      emoji: '🤝',
      title: `Choose ${first}?`,
      message: `${first} will be told you picked them. You can message each other right away.`,
      actions: [
        {
          label: `Choose ${first}`,
          onPress: async () => {
            try {
              await chooseHelper(postId, o.helper_id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onChosen();
            } catch (err) {
              showToast(errorMessage(err, "Couldn't choose a helper."));
            }
          },
        },
      ],
    });
  };

  if (offers === null) return <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />;

  // The person who asked: everyone who offered, to choose from.
  if (isAuthor) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.heading}>
          {offers.length === 0
            ? "No offers yet — we'll let you know when someone offers."
            : `${offers.length} ${offers.length === 1 ? 'person' : 'people'} offered to help. Choose who you'd like.`}
        </Text>
        {offers.map((o) => (
          <View key={o.helper_id} style={styles.offer}>
            <TouchableOpacity onPress={() => onOpenProfile(o.helper_id)} accessibilityRole="button">
              <Avatar uri={o.avatar_url} size={40} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {o.full_name ?? 'A classmate'}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[o.grade ? `${o.grade} grade` : null, o.helped_count > 0 ? `Helped ${o.helped_count} before` : 'New helper'].filter(Boolean).join(' · ')}
              </Text>
              {o.message ? <Text style={styles.message}>“{o.message}”</Text> : null}
            </View>
            <TouchableOpacity style={styles.choose} onPress={() => handleChoose(o)} accessibilityRole="button" accessibilityLabel={`Choose ${o.full_name ?? 'this helper'}`}>
              <Text style={styles.chooseText}>Choose</Text>
            </TouchableOpacity>
          </View>
        ))}
        {sheet}
      </View>
    );
  }

  // Someone who already offered.
  if (myOffer) {
    return (
      <View style={styles.wrap}>
        <View style={styles.sent}>
          <Text style={styles.sentTitle}>✓ You offered to help</Text>
          <Text style={styles.sentSub}>{authorFirstName} will choose a helper. We'll let you know if it's you.</Text>
          {myOffer.message ? <Text style={styles.message}>“{myOffer.message}”</Text> : null}
        </View>
        <TouchableOpacity onPress={handleWithdraw} style={styles.withdraw} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.withdrawText}>Take back my offer</Text>
        </TouchableOpacity>
        {sheet}
      </View>
    );
  }

  // Anyone else: offer, with an optional line.
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={`Why you? e.g. "I took that class last year" (optional)`}
        placeholderTextColor={colors.textLight}
        value={message}
        onChangeText={setMessage}
        maxLength={OFFER_MESSAGE_MAX}
      />
      <PrimaryButton title="I Can Help" icon="hand-left-outline" onPress={handleOffer} loading={busy} />
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 4,
  },
  choose: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chooseText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.onPrimary,
  },
  sent: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sentTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: colors.accentDark,
  },
  sentSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  withdraw: {
    alignSelf: 'center',
  },
  withdrawText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  input: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
});
