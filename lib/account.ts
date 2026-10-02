import { supabase } from './supabase';

export async function deleteMyAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  await supabase.auth.signOut();
}
