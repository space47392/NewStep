import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Avatar from '../Avatar';
import NSIcon from '../NSIcon';
import LinkifiedText from '../LinkifiedText';
import SwipeToReply from '../SwipeToReply';
import MessageEntrance from '../MessageEntrance';
import TypingIndicator from '../TypingIndicator';
import VoiceBubble from '../VoiceBubble';
import ChatPhoto from './ChatPhoto';
import { ReactionPills } from './Reactions';
import { summarizeReactions, type MessageReaction } from '../../lib/reactionSummary';
import { isEmojiOnly, layoutMessage, messagePreview } from '../../lib/chatFormat';
import { formatClockTime, formatDayLabel } from '../../lib/time';
import { colors, spacing, radius, fontSize, fontFamily } from '../../constants/theme';
import type { Message } from '../../types';

type Props = {
  message: Message;
  // Neighbours decide grouping, separators and which bubble shows the time.
  prev?: Message;
  next?: Message;
  myUserId?: string;
  // First name of the other person, for reply quotes.
  otherName: string;
  otherAvatarUrl: string | null;
  // The message this one replies to, if it's loaded.
  repliedTo?: Message;
  localPhotoUri?: string;
  localAudioUri?: string;
  pending: boolean;
  // This message's reactions (one row per person); undefined = none.
  reactions?: MessageReaction[];
  showSeen: boolean;
  canReply: boolean;
  // Pass stable functions (useStableCallback): the row is memoised.
  onLongPress: (message: Message) => void;
  onReply: (message: Message) => void;
  onJumpTo: (messageId: string) => void;
  onOpenPhoto: (url: string) => void;
  // Tapping a reaction pill; omitted when you can't react (e.g. they left).
  onToggleReaction?: (message: Message, emoji: string) => void;
};

// One message in a 1:1 chat. Memoised so typing in the composer doesn't
// re-render every bubble on screen.
function MessageRow({
  message: item,
  prev,
  next,
  myUserId,
  otherName,
  otherAvatarUrl,
  repliedTo,
  localPhotoUri,
  localAudioUri,
  pending,
  reactions,
  showSeen,
  canReply,
  onLongPress,
  onReply,
  onJumpTo,
  onOpenPhoto,
  onToggleReaction,
}: Props) {
  const isMine = item.sender_id === myUserId;
  const isDeleted = !!item.deleted_at;
  const { showDaySeparator, gapLabel, isFirstInGroup, isLastInGroup, showTimestamp } = layoutMessage(prev, item, next);
  // The last bubble of a run carries the small avatar; earlier ones leave the
  // slot blank so the column stays aligned.
  const showAvatar = !isMine && isLastInGroup;
  const hasPhoto = !isDeleted && (!!item.photo_path || !!localPhotoUri);
  const hasAudio = !isDeleted && (!!item.audio_path || !!localAudioUri);
  const bigEmoji = !isDeleted && !hasPhoto && !hasAudio && !item.reply_to_message_id && isEmojiOnly(item.content);
  const longPress = () => onLongPress(item);
  const reactionCounts = isDeleted ? [] : summarizeReactions(reactions, myUserId);

  return (
    <View>
      {showDaySeparator && (
        <View style={styles.daySeparator}>
          <View style={styles.daySeparatorPill}>
            <NSIcon name="steps" size={14} />
            <Text style={styles.daySeparatorText}>{formatDayLabel(item.created_at)}</Text>
          </View>
        </View>
      )}
      {gapLabel ? <Text style={styles.gapMarker}>· {gapLabel} ·</Text> : null}
      <SwipeToReply enabled={canReply && !isDeleted} onReply={() => onReply(item)}>
        <MessageEntrance mine={isMine} createdAt={item.created_at}>
          <View
            style={[
              styles.bubbleRow,
              isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
              // A sender change gets a little extra room, unless a day separator already gives it.
              isFirstInGroup && !showDaySeparator && styles.bubbleRowGroupStart,
            ]}
          >
            {!isMine && (
              <View
                style={[
                  styles.avatarSlot,
                  // Line the avatar up with the bubble, not the time line under it.
                  (showTimestamp || (!!item.edited_at && !isDeleted)) && styles.avatarSlotAboveFooter,
                ]}
              >
                {/* A 1:1 chat has two senders, so "not mine" is always the other
                    person, even when this row's sender_id is null (deleted account). */}
                {showAvatar ? <Avatar uri={otherAvatarUrl} size={24} /> : null}
              </View>
            )}
            <View style={[styles.bubbleCol, isMine ? styles.bubbleColMine : styles.bubbleColTheirs]}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isDeleted || pending}
                onLongPress={longPress}
                style={[
                  styles.bubble,
                  isMine ? styles.bubbleMine : styles.bubbleTheirs,
                  // The last bubble of a run gets a "tail" corner towards its sender.
                  isLastInGroup && (isMine ? styles.bubbleTailMine : styles.bubbleTailTheirs),
                  // Bubbles in one run read as a stack: facing corners tuck in.
                  !isFirstInGroup && (isMine ? styles.bubbleJoinTopMine : styles.bubbleJoinTopTheirs),
                  !isLastInGroup && (isMine ? styles.bubbleJoinBottomMine : styles.bubbleJoinBottomTheirs),
                  isDeleted && styles.bubbleDeleted,
                  bigEmoji && styles.bubbleEmojiOnly,
                  hasPhoto && styles.bubblePhoto,
                  pending && styles.bubblePending,
                ]}
              >
                {isDeleted ? (
                  <Text style={styles.deletedText}>{isMine ? 'You deleted this message' : 'This message was deleted'}</Text>
                ) : (
                  <>
                    {/* Not loaded yet (an older page): leave the quote out rather than show a broken one. */}
                    {item.reply_to_message_id && repliedTo ? (
                      <TouchableOpacity
                        style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteTheirs]}
                        accessibilityLabel="Jump to the replied message"
                        onPress={(e) => {
                          e.stopPropagation();
                          onJumpTo(repliedTo.id);
                        }}
                      >
                        <Text style={[styles.replyQuoteName, isMine ? styles.replyQuoteNameMine : styles.replyQuoteNameTheirs]} numberOfLines={1}>
                          {repliedTo.sender_id === myUserId ? 'You' : otherName}
                        </Text>
                        <Text style={[styles.replyQuoteText, isMine ? styles.replyQuoteTextMine : styles.replyQuoteTextTheirs]} numberOfLines={2}>
                          {messagePreview(repliedTo)}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {hasPhoto ? <ChatPhoto path={item.photo_path} localUri={localPhotoUri} onOpen={onOpenPhoto} onLongPress={longPress} /> : null}
                    {hasAudio ? (
                      <VoiceBubble id={item.id} path={item.audio_path} localUri={localAudioUri} ms={item.audio_ms ?? 0} mine={isMine} onLongPress={longPress} />
                    ) : null}
                    {item.content ? (
                      <LinkifiedText
                        style={[
                          isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                          bigEmoji && [styles.emojiOnlyText, { transform: [{ rotate: isMine ? '6deg' : '-6deg' }] }],
                          hasPhoto && styles.photoCaption,
                        ]}
                      >
                        {item.content}
                      </LinkifiedText>
                    ) : null}
                  </>
                )}
              </TouchableOpacity>
              <ReactionPills
                counts={reactionCounts}
                alignEnd={isMine}
                onToggle={onToggleReaction && !pending ? (emoji) => onToggleReaction(item, emoji) : undefined}
              />
              <View style={styles.messageFooter}>
                {showTimestamp ? <Text style={styles.messageTimestamp}>{formatClockTime(item.created_at)}</Text> : null}
                {item.edited_at && !isDeleted ? <Text style={styles.editedLabel}>(edited)</Text> : null}
              </View>
              {showSeen ? (
                <View style={styles.readReceiptRow}>
                  <NSIcon name="steps" size={12} />
                  <Text style={styles.readReceipt}>Seen</Text>
                </View>
              ) : null}
            </View>
          </View>
        </MessageEntrance>
      </SwipeToReply>
    </View>
  );
}

export default memo(MessageRow);

// The other person's "typing…" bubble, laid out like their messages.
export function TypingRow({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <View style={[styles.bubbleRow, styles.bubbleRowTheirs]}>
      <View style={styles.avatarSlot}>
        <Avatar uri={avatarUrl} size={24} />
      </View>
      <View style={[styles.bubble, styles.bubbleTheirs]}>
        <TypingIndicator />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A small inset card inside the bubble — who said it, then what.
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginBottom: 6,
  },
  replyQuoteMine: {
    borderLeftColor: colors.onPrimary,
    backgroundColor: 'rgba(42,29,18,0.1)',
  },
  replyQuoteTheirs: {
    borderLeftColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  replyQuoteName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
  },
  replyQuoteNameMine: {
    color: colors.onPrimary,
  },
  replyQuoteNameTheirs: {
    color: colors.primaryDark,
  },
  gapMarker: {
    alignSelf: 'center',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginVertical: spacing.sm,
  },
  replyQuoteText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
  },
  replyQuoteTextMine: {
    color: 'rgba(42,29,18,0.75)',
  },
  replyQuoteTextTheirs: {
    color: colors.textMid,
  },
  daySeparator: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  daySeparatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  daySeparatorText: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  // Extra top margin for the first bubble in a new run — combined with every
  // row's own spacing.xs marginBottom, a sender change reads with the same
  // total gap (spacing.xs + spacing.xs) the whole list used to have
  // uniformly; consecutive same-sender bubbles now sit closer together
  // (spacing.xs alone) instead.
  bubbleRowGroupStart: {
    marginTop: spacing.xs,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarSlot: {
    width: 24,
    height: 24,
    marginRight: spacing.xs,
  },
  // = messageFooter's marginTop (2) + one 16px text line.
  avatarSlotAboveFooter: {
    marginBottom: 18,
  },
  bubbleJoinTopMine: {
    borderTopRightRadius: 6,
  },
  bubbleJoinBottomMine: {
    borderBottomRightRadius: 6,
  },
  bubbleJoinTopTheirs: {
    borderTopLeftRadius: 6,
  },
  bubbleJoinBottomTheirs: {
    borderBottomLeftRadius: 6,
  },
  bubbleCol: {
    maxWidth: '76%',
  },
  bubbleColMine: {
    alignItems: 'flex-end',
  },
  bubbleColTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleTailMine: {
    borderBottomRightRadius: 4,
  },
  bubbleTailTheirs: {
    borderBottomLeftRadius: 4,
  },
  bubblePending: {
    opacity: 0.6,
  },
  bubbleTheirs: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  bubbleDeleted: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleTextMine: {
    fontFamily: fontFamily.regular,
    color: colors.onPrimary,
    fontSize: fontSize.md,
    lineHeight: 21,
  },
  bubbleTextTheirs: {
    fontFamily: fontFamily.regular,
    color: colors.textDark,
    fontSize: fontSize.md,
    lineHeight: 21,
  },
  deletedText: {
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    color: colors.textLight,
    fontSize: fontSize.sm,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  messageTimestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: colors.textLight,
  },
  editedLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
    fontStyle: 'italic',
  },
  readReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
    marginTop: 1,
  },
  readReceipt: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    marginTop: 1,
  },
  bubblePhoto: {
    padding: 4,
  },
  photoCaption: {
    paddingHorizontal: spacing.sm,
    paddingTop: 6,
    paddingBottom: 4,
  },
  bubbleEmojiOnly: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  emojiOnlyText: {
    fontSize: 36,
    lineHeight: 44,
  },
});
