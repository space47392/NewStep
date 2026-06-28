import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainStackParamList } from '../types';
import TabNavigator from './TabNavigator';
import CreatePostScreen from '../screens/main/CreatePostScreen';
import PostDetailScreen from '../screens/main/PostDetailScreen';
import ConversationScreen from '../screens/main/ConversationScreen';
import UserProfileScreen from '../screens/main/UserProfileScreen';
import StoryViewerScreen from '../screens/main/StoryViewerScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="StoryViewer" component={StoryViewerScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}
