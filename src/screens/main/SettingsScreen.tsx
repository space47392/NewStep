import { ReactNode, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { deleteMyAccount } from '../../lib/account';
import FadeInView from '../../components/FadeInView';
import { warmAlert } from '../../components/WarmAlert';
import { CONTACT_EMAIL } from '../../constants/legal';
import { colors, spacing, radius, fontSize, fontFamily, typography } from '../../constants/theme';
import { MainStackParamList } from '../../types';
import { errorMessage } from '../../lib/errors';

type Nav = NativeStackNavigationProp<MainStackParamList>;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  busy,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  busy?: boolean;
  last?: boolean;
}) {
  const content = (
    <>
      <Ionicons name={icon} size={18} color={onPress ? colors.textDark : colors.textMid} />
      <Text style={styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {busy ? <ActivityIndicator size="small" color={colors.textMid} /> : onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textLight} /> : null}
    </>
  );
  return (
    <>
      {onPress ? (
        <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy} activeOpacity={0.7} accessibilityRole="button">
          {content}
        </TouchableOpacity>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
      {last ? null : <View style={styles.divider} />}
    </>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const handleLogout = () => {
    warmAlert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await signOut();
          } catch {
            showToast("Couldn't log out — check your connection and try again");
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  // scope: 'global' revokes every refresh token for this account, not just
  // this device's.
  const handleLogoutAllDevices = () => {
    warmAlert('Log out of all devices?', "This will sign you out everywhere, including this device. You'll need to sign in again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out everywhere',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await signOut({ scope: 'global' });
          } catch {
            showToast("Couldn't log out — check your connection and try again");
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  // Two-step confirmation on purpose — the one irreversible action here.
  const handleDeleteAccount = () => {
    warmAlert('Delete your account?', 'This permanently deletes your profile, posts, comments, stories, and messages. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          warmAlert('Are you absolutely sure?', 'Your account and all of its data will be permanently deleted right now. There is no way to undo this.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete my account',
              style: 'destructive',
              onPress: async () => {
                if (!user) return;
                setDeletingAccount(true);
                try {
                  await deleteMyAccount(user.id);
                  // The account is already gone server-side; this just clears
                  // the local session so the app returns to sign-in.
                  await supabase.auth.signOut().catch(() => {});
                } catch (err) {
                  const message = errorMessage(err, 'Could not delete your account.');
                  warmAlert('Error', message);
                  setDeletingAccount(false);
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const contact = () => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('NewStep')}`).catch(() =>
      warmAlert('Contact us', `Write to ${CONTACT_EMAIL}`)
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingBottom: spacing.xxl + insets.bottom }]}>
      <FadeInView>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={20} color={colors.textDark} accessibilityLabel="Back" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </FadeInView>

      <FadeInView delay={40}>
        {/* user.email comes from the auth session — the profiles table has
            no email column, so it can never show on anyone else's screen. */}
        <Group label="Account">
          <Row icon="mail-outline" label={user?.email ?? ''} />
          <Row icon="create-outline" label="Edit profile" onPress={() => navigation.navigate('EditProfile')} />
          <Row icon="key-outline" label="Change password" onPress={() => navigation.navigate('ChangePassword')} />
          {/* Push permission lives with the phone, so this opens NewStep's
              page in the phone's own settings. */}
          <Row icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('NotificationSettings')} />
          <Row icon="bookmark-outline" label="Saved posts" onPress={() => navigation.navigate('SavedPosts')} last />
        </Group>

        <Group label="Privacy & safety">
          <Row icon="hand-left-outline" label="Blocked accounts" onPress={() => navigation.navigate('BlockedAccounts')} />
          <Row icon="heart-outline" label="Community Guidelines" onPress={() => navigation.navigate('Legal', { doc: 'guidelines' })} last />
        </Group>

        <Group label="About">
          <Row icon="document-text-outline" label="Terms of Service" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />
          <Row icon="lock-closed-outline" label="Privacy Policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} />
          {CONTACT_EMAIL ? <Row icon="chatbubble-ellipses-outline" label="Contact us" onPress={contact} /> : null}
          <Row icon="information-circle-outline" label="Version" value={version} last />
        </Group>

        <Group label="Sign out">
          <Row icon="log-out-outline" label="Log out" onPress={handleLogout} busy={loggingOut} />
          <Row icon="phone-portrait-outline" label="Log out of all devices" onPress={handleLogoutAllDevices} last />
        </Group>

        <TouchableOpacity onPress={handleDeleteAccount} style={styles.deleteButton} disabled={deletingAccount} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {deletingAccount ? <ActivityIndicator size="small" color={colors.error} /> : <Text style={styles.deleteText}>Delete account</Text>}
        </TouchableOpacity>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.largeTitle,
    color: colors.textDark,
    marginBottom: spacing.md,
  },
  group: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
  },
  rowText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  rowValue: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginLeft: spacing.md + 28,
  },
  deleteButton: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  deleteText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.error,
  },
});
