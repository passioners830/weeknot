import { supabase } from './supabase';

export async function getMyDisplayName(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  if (error) throw error;

  return data.display_name ?? '';
}

export async function updateDisplayName(name: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('表示名を入力してください');

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', user.id);
  if (error) throw error;
}
