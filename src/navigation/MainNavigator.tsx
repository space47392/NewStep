import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainStackParamList } from '../types';
import TabNavigator from './TabNavigator';
import { useScreenContentStyle, NO_TOP_INSET, MODAL_TOP_INSET } from './screenInsets';
import { colors } from '../constants/theme';
import CreatePostScreen from '../screens/main/CreatePostScreen';
import PostDetailScreen from '../screens/main/PostDetailScreen';
import ConversationScreen from '../screens/main/ConversationScreen';
import UserProfileScreen from '../screens/main/UserProfileScreen';
import SchoolScreen from '../screens/main/SchoolScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import SchoolSkyScreen from '../screens/main/SchoolSkyScreen';
import SkyDiaryScreen from '../screens/main/SkyDiaryScreen';
import LanternsScreen from '../screens/main/LanternsScreen';
import LanternDetailScreen from '../screens/main/LanternDetailScreen';
import FollowListScreen from '../screens/main/FollowListScreen';
import SavedPostsScreen from '../screens/main/SavedPostsScreen';
import ChooseSchoolScreen from '../screens/main/ChooseSchoolScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import BuddyScreen from '../screens/main/BuddyScreen';
import ChangePasswordScreen from '../screens/main/ChangePasswordScreen';
import BlockedAccountsScreen from '../screens/main/BlockedAccountsScreen';
import LegalScreen from '../screens/main/LegalScreen';
import StoryViewerScreen from '../screens/main/StoryViewerScreen';
import PhotoViewerScreen from '../screens/main/PhotoViewerScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  const contentStyle = useScreenContentStyle();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle,
        // Pages slide in from the side; sheets rise from the bottom; full-
        // screen viewers fade. Same motion on every screen.
        animation: 'slide_from_right',
        animationDuration: 200,
      }}
    >
      {/* Each tab scene adds its own top inset (TabNavigator), so Home can
          paint behind the status bar. */}
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ contentStyle: { ...NO_TOP_INSET, backgroundColor: colors.background } }} />
      <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: MODAL_TOP_INSET ?? contentStyle }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="School" component={SchoolScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="SchoolSky" component={SchoolSkyScreen} options={{ contentStyle: NO_TOP_INSET, animation: 'fade' }} />
      <Stack.Screen name="SkyDiary" component={SkyDiaryScreen} options={{ contentStyle: NO_TOP_INSET }} />
      <Stack.Screen name="Lanterns" component={LanternsScreen} options={{ contentStyle: NO_TOP_INSET }} />
      <Stack.Screen name="LanternDetail" component={LanternDetailScreen} options={{ contentStyle: NO_TOP_INSET }} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
      <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
      <Stack.Screen
        name="ChooseSchool"
        component={ChooseSchoolScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: MODAL_TOP_INSET ?? contentStyle }}
      />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Buddy" component={BuddyScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="BlockedAccounts" component={BlockedAccountsScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: NO_TOP_INSET }} />
      <Stack.Screen
        name="PhotoViewer"
        component={PhotoViewerScreen}
        options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: NO_TOP_INSET }}
      />
    </Stack.Navigator>
  );
}
