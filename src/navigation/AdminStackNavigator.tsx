import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ManageSynagogueScreen from '../screens/admin/ManageSynagogueScreen';
import ManageRestaurantScreen from '../screens/admin/ManageRestaurantScreen';
import ManageKosherScreen from '../screens/admin/ManageKosherScreen';
import ManageEventsScreen from '../screens/admin/ManageEventsScreen';
import ManageMikvehScreen from '../screens/admin/ManageMikvehScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import ManageEruvScreen from '../screens/admin/ManageEruvScreen';
import ManageGemachScreen from '../screens/admin/ManageGemachScreen';
import { Colors } from '../utils/theme';

export type AdminStackParamList = {
  ManageSynagogue: undefined;
  ManageRestaurant: undefined;
  ManageKosher: undefined;
  ManageEvents: undefined;
  ManageMikveh: undefined;
  ManageEruv: undefined;
  ManageGemach: undefined;
  UserManagement: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export default function AdminStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: 'חזור',
      }}
    >
      <Stack.Screen name="ManageSynagogue"  component={ManageSynagogueScreen}  options={{ title: 'ניהול בית כנסת' }} />
      <Stack.Screen name="ManageRestaurant" component={ManageRestaurantScreen} options={{ title: 'ניהול מסעדה' }} />
      <Stack.Screen name="ManageKosher"     component={ManageKosherScreen}     options={{ title: 'ניהול כשרות' }} />
      <Stack.Screen name="ManageEvents"     component={ManageEventsScreen}     options={{ title: 'ניהול אירועים' }} />
      <Stack.Screen name="ManageMikveh"     component={ManageMikvehScreen}     options={{ title: 'ניהול מקוואות' }} />
      <Stack.Screen name="ManageEruv"        component={ManageEruvScreen}        options={{ title: 'ניהול עירוב' }} />
      <Stack.Screen name="ManageGemach"      component={ManageGemachScreen}      options={{ title: 'ניהול גמ"חים' }} />
      <Stack.Screen name="UserManagement"   component={UserManagementScreen}   options={{ title: 'ניהול משתמשים' }} />
    </Stack.Navigator>
  );
}
