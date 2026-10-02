import { supabase } from './supabase';

export async function reportHighlight(highlightId: string, reason: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { error } = await supabase
    .from('reports')
    .insert({ reporter_id: user.id, highlight_id: highlightId, reason });
  if (error) throw error;
}
