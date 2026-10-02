import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// パスワードリセット用のメールを送信する。
// メールにはSupabaseダッシュボードのテンプレートに{{ .Token }}を追加しておくことで
// 6桁のコードが記載され、アプリ内でconfirmPasswordResetに渡してリセットできる
// （ディープリンク無しでアプリ内完結させるため、リンクではなくコード方式を使う）
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function confirmPasswordReset(email: string, token: string, newPassword: string) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  });
  if (verifyError) throw verifyError;

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
