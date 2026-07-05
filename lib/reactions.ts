import { supabase } from './supabase';

export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export async function getReactionsForHighlights(
  highlightIds: string[]
): Promise<Record<string, ReactionSummary[]>> {
  if (highlightIds.length === 0) return {};

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('reactions')
    .select('highlight_id, emoji, user_id')
    .in('highlight_id', highlightIds);
  if (error) throw error;

  const grouped: Record<string, Record<string, ReactionSummary>> = {};
  for (const row of data ?? []) {
    grouped[row.highlight_id] ??= {};
    grouped[row.highlight_id][row.emoji] ??= { emoji: row.emoji, count: 0, reactedByMe: false };
    grouped[row.highlight_id][row.emoji].count += 1;
    if (row.user_id === user?.id) {
      grouped[row.highlight_id][row.emoji].reactedByMe = true;
    }
  }

  const result: Record<string, ReactionSummary[]> = {};
  for (const [highlightId, emojiMap] of Object.entries(grouped)) {
    result[highlightId] = Object.values(emojiMap);
  }
  return result;
}

export async function toggleReaction(
  highlightId: string,
  emoji: string,
  currentlyReacted: boolean
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  if (currentlyReacted) {
    const { error } = await supabase
      .from('reactions')
      .delete()
      .match({ highlight_id: highlightId, user_id: user.id, emoji });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('reactions')
      .insert({ highlight_id: highlightId, user_id: user.id, emoji });
    if (error) throw error;
  }
}
