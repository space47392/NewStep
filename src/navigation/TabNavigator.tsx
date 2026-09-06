import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from '../types';
import { colors, fontFamily, shadow } from '../constants/theme';

import FeedScreen from '../screens/main/FeedScreen';
import SearchScreen from '../screens/main/SearchScreen';
import HelpScreen from '../screens/main/HelpScreen';
import ChatScreen from '../screens/main/ChatScreen';
import VolunteerScreen from '../screens/main/VolunteerScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Feed:      { focused: 'home',           unfocused: 'home-outline' },
  Search:    { focused: 'search',         unfocused: 'search-outline' },
  Help:      { focused: 'help-circle',    unfocused: 'help-circle-outline' },
  Chat:      { focused: 'chatbubbles',    unfocused: 'chatbubbles-outline' },
  Volunteer: { focused: 'people',         unfocused: 'people-outline' },
  Profile:   { focused: 'person',         unfocused: 'person-outline' },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          height: 64,
          paddingTop: 8,
          paddingBottom: 10,
          ...shadow.floating,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamily.semibold,
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.focused : icons.unfocused;
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed"      component={FeedScreen}      options={{ title: 'Home' }} />
      <Tab.Screen name="Search"    component={SearchScreen}    options={{ title: 'Search' }} />
      <Tab.Screen name="Help"      component={HelpScreen}      options={{ title: 'Help' }} />
      <Tab.Screen name="Chat"      component={ChatScreen}      options={{ title: 'Chat' }} />
      <Tab.Screen name="Volunteer" component={VolunteerScreen} options={{ title: 'Community' }} />
      <Tab.Screen name="Profile"   component={ProfileScreen}   options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
