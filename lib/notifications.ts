import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const WEEKLY_REMINDER_ID = 'weekly-organize-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// 毎週日曜18時に「整理しよう」というローカル通知を予約する（サーバー不要）
export async function ensureWeeklyReminderScheduled(): Promise<void> {
  if (!(await ensurePermission())) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'デフォルト',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.some((n) => n.identifier === WEEKLY_REMINDER_ID)) return;

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REMINDER_ID,
    content: {
      title: '今週の写真を整理しよう',
      body: 'たまった写真をスワイプして、今週のハイライトを選びましょう。',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // 1 = 日曜日
      hour: 18,
      minute: 0,
    },
  });
}

// 動作確認用: 毎週リマインダーと同じ内容をその場ですぐに発火させる
export async function sendTestReminderNow(): Promise<void> {
  if (!(await ensurePermission())) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'デフォルト',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '今週の写真を整理しよう',
      body: 'たまった写真をスワイプして、今週のハイライトを選びましょう。',
    },
    trigger: null,
  });
}

// リアクション・コメント通知を受け取るため、Expoプッシュトークンを取得してprofilesに保存する
export async function registerPushToken(): Promise<void> {
  if (!(await ensurePermission())) return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn(
      'EAS projectId が未設定のため、プッシュ通知トークンを取得できません（app.jsonのextra.eas.projectIdを確認してください）'
    );
    return;
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('プッシュ通知トークンの取得に失敗しました（FCM未設定の可能性があります）', e);
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('profiles').update({ push_token: token }).eq('id', user.id);
}
