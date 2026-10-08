import { useCallback, useRef, useState } from 'react';
import { Text, FlatList, RefreshControl, TouchableOpacity, View, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchConversations } from '../../lib/chat';
import { getChatDrafts } from '../../lib/chatDrafts';
import { fetchChatSuggestions, ChatSuggestion } from '../../lib/chatSuggestions';
import InterestIcon from '../../components/InterestIcon';
import { formatRelativeTime } from '../../lib/time';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import { ConversationRowSkeleton } from '../../components/Skeleton';
import FadeInView from '../../components/FadeInView';
import NSIcon from '../../components/NSIcon';
import { Conversation, MainStackParamList } from '../../types';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../../constants/theme';

export default function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // True only after a load attempt that never previously succeeded fails —
  // a background refresh failure after conversations have ever loaded shows
  // a toast instead and keeps the existing list (Step 36).
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const hasEverLoadedRef = useRef(false);
  // Unsent text left in each conversation (chatDrafts.ts), shown in the row.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // "Say hi" strip: classmates you don't have a chat with yet.
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const suggestionsLoadedRef = useRef(false);
  const [query, setQuery] = useState('');

  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchConversations(user.id);
      setConversations(data);
      if (!suggestionsLoadedRef.current) {
        suggestionsLoadedRef.current = true;
        const partnerIds = new Set(data.map((c) => c.otherUser?.id).filter((id): id is string => !!id));
        fetchChatSuggestions(user.id, partnerIds)
          .then(setSuggestions)
          .catch(() => {
            // Optional strip — just doesn't show.
          });
      }
      setLoadFailed(false);
      hasEverLoadedRef.current = true;
    } catch {
      if (hasEverLoadedRef.current) {
        showToast("Couldn't refresh your chats");
      } else {
        setLoadFailed(true);
      }
    }
  }, [user, showToast]);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await loadConversations();
    setRetrying(false);
  };

  // Refetch every time this tab gains focus, so unread badges/previews update
  // after returning from a conversation (not just on first mount).
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (user) getChatDrafts(user.id).then(setDrafts);
        await loadConversations();
        setLoading(false);
      })();
    }, [loadConversations, user])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    suggestionsLoadedRef.current = false;
    await loadConversations();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, styles.list]}>
        <View style={styles.titleIconRow}>
            <View style={styles.titleIcon}><NSIcon name="chat" size={34} /></View>
            <Text style={[styles.title, styles.titleNoMargin]}>Messages</Text>
          </View>
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
        <ConversationRowSkeleton />
      </View>
    );
  }

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const trimmedQuery = query.trim().toLowerCase();
  // Plain filter, not useMemo: this runs after the loading early-return, so
  // a hook here would change the hook order between renders.
  const visibleConversations = trimmedQuery
    ? conversations.filter((c) => (c.otherUser?.full_name ?? 'Deleted User').toLowerCase().includes(trimmedQuery))
    : conversations;

  return (
    <FlatList
      style={styles.screen}
      data={visibleConversations}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.titleIconRow}>
            <View style={styles.titleIcon}><NSIcon name="chat" size={34} /></View>
            <View style={styles.titleText}>
              <Text style={[styles.title, styles.titleNoMargin]}>Messages</Text>
              {conversations.length > 0 ? (
                <Text style={[styles.summary, unreadTotal > 0 && styles.summaryUnread]}>
                  {unreadTotal > 0
                    ? `${unreadTotal} unread ${unreadTotal === 1 ? 'message' : 'messages'}`
                    : "You're all caught up ✨"}
                </Text>
              ) : null}
            </View>
          </View>

          {conversations.length >= 4 ? (
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your chats"
                placeholderTextColor={colors.textLight}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.textLight} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {suggestions.length > 0 && !trimmedQuery ? (
            <View style={styles.sayHi}>
              <View style={styles.sectionRow}>
                <NSIcon name="wave" size={18} />
                <Text style={styles.sectionLabel}>Say hi to a classmate</Text>
              </View>
              <FlatList
                horizontal
                data={suggestions}
                keyExtractor={(s) => s.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sayHiRail}
                renderItem={({ item: s }) => (
                  <TouchableOpacity
                    style={styles.sayHiItem}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('UserProfile', { userId: s.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.full_name ?? 'Student'}${s.reason ? `, ${s.reason}` : ''}. Open profile`}
                  >
                    <View>
                      <Avatar uri={s.avatar_url} size={54} />
                      <View style={styles.sayHiWave}>
                        <NSIcon name="wave" size={16} />
                      </View>
                    </View>
                    <Text style={styles.sayHiName} numberOfLines={1}>
                      {s.full_name?.trim().split(/\s+/)[0] ?? 'Student'}
                    </Text>
                    {s.reason ? (
                      <View style={styles.sayHiReason}>
                        {s.reason !== s.grade ? <InterestIcon interest={s.reason} size={12} /> : null}
                        <Text style={styles.sayHiReasonText} numberOfLines={1}>
                          {s.reason}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null}

          {conversations.length > 0 && (suggestions.length > 0 || trimmedQuery) ? (
            <View style={styles.sectionRow}>
              <NSIcon name="chat" size={18} />
              <Text style={styles.sectionLabel}>{trimmedQuery ? 'Matching chats' : 'Your chats'}</Text>
            </View>
          ) : null}
          {trimmedQuery && visibleConversations.length === 0 ? (
            <Text style={styles.noMatch}>No chats with "{query.trim()}" yet.</Text>
          ) : null}
        </View>
      }
      ListFooterComponent={
        // Once there's nobody new to suggest above, the end of the list
        // points onward instead of trailing off into empty space.
        conversations.length > 0 && suggestions.length === 0 && !trimmedQuery ? (
          <TouchableOpacity
            style={styles.meetCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}
            accessibilityRole="button"
            accessibilityLabel="Meet more classmates. Open Search"
          >
            <View style={styles.meetIcon}>
              <NSIcon name="sparkles" size={26} />
            </View>
            <View style={styles.meetText}>
              <Text style={styles.meetTitle}>Meet more classmates</Text>
              <Text style={styles.meetSub}>Find people who like the same things you do.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
          </TouchableOpacity>
        ) : null
      }
      ListEmptyComponent={
        trimmedQuery ? null : loadFailed ? (
          <ErrorState onRetry={handleRetry} retrying={retrying} />
        ) : (
          <EmptyState
            icon="chatbubbles-outline"
            nsIcon="wave"
            tint={colors.warningLight}
            title="No chats yet"
            subtitle="Say hi to someone from your school, or offer to help with a request — every friendship starts with a wave."
          />
        )
      }
      renderItem={({ item, index }) => {
        // Null when this conversation's other participant has since deleted
        // their account (Step 56) — the row/history is preserved, but there's
        // no profile left to open and no name/avatar left to show.
        const isDeletedOther = item.otherUser === null;
        const goToOtherProfile = (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          if (item.otherUser) navigation.navigate('UserProfile', { userId: item.otherUser.id });
        };
        return (
          <FadeInView delay={Math.min(index, 6) * 40}>
            <TouchableOpacity
              style={[styles.row, item.unreadCount > 0 && styles.rowUnread]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Conversation', { conversationId: item.id, otherUser: item.otherUser })}
            >
              <TouchableOpacity onPress={goToOtherProfile} disabled={isDeletedOther}>
                <Avatar uri={item.otherUser?.avatar_url ?? null} size={50} />
              </TouchableOpacity>
              <View style={styles.rowText}>
                <TouchableOpacity style={styles.nameTouchable} onPress={goToOtherProfile} disabled={isDeletedOther}>
                  <Text style={[styles.name, item.unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>{isDeletedOther ? 'Deleted User' : (item.otherUser!.full_name ?? 'Unknown')}</Text>
                </TouchableOpacity>
                {drafts[item.id]?.trim() && item.otherUser ? (
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    <Text style={styles.draftLabel}>Draft: </Text>
                    {drafts[item.id].trim()}
                  </Text>
                ) : (
                  <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
                    {item.last_message ?? 'Say hello!'}
                  </Text>
                )}
              </View>
              <View style={styles.rowRight}>
                {item.last_message_at ? (
                  <Text style={[styles.timestamp, item.unreadCount > 0 && styles.timestampUnread]}>
                    {formatRelativeTime(item.last_message_at)}
                  </Text>
                ) : null}
                {item.unreadCount > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          </FadeInView>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Without this the list shows the platform's default gray instead of the
  // app background used on every other tab.
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  titleIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  titleNoMargin: {
    marginBottom: 0,
  },
  titleIcon: {
    marginTop: 8,
  },
  titleText: {
    flex: 1,
  },
  meetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
  },
  meetIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  meetText: {
    flex: 1,
  },
  meetTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  meetSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: 2,
  },
  summary: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: -2,
  },
  summaryUnread: {
    color: colors.primaryDark,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textDark,
    paddingVertical: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMid,
  },
  sayHi: {
    marginBottom: spacing.lg,
  },
  sayHiRail: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  // A small "trading card" per classmate.
  sayHiItem: {
    width: 92,
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    gap: 6,
  },
  sayHiWave: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warningLight,
    borderWidth: 2,
    borderColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sayHiName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
    maxWidth: '100%',
  },
  sayHiReason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: '100%',
  },
  sayHiReasonText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.primaryDark,
    flexShrink: 1,
  },
  noMatch: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    color: colors.textDark,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  // Unread chats stand out at a glance, not only by the small count badge.
  rowUnread: {
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
  },
  nameUnread: {
    fontFamily: fontFamily.bold,
  },
  timestampUnread: {
    fontFamily: fontFamily.semibold,
    color: colors.primary,
  },
  rowText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameTouchable: {
    alignSelf: 'flex-start',
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  lastMessage: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 2,
  },
  draftLabel: {
    fontFamily: fontFamily.semibold,
    color: colors.secondaryDark,
  },
  lastMessageUnread: {
    fontFamily: fontFamily.semibold,
    color: colors.textDark,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  timestamp: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  unreadBadgeText: {
    fontFamily: fontFamily.bold,
    color: '#fff',
    fontSize: fontSize.xs,
  },
});
