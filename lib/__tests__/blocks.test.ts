import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { blockUser, getBlockedUserIds, getBlockedUsers, unblockUser } from '../blocks';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('getBlockedUserIds', () => {
  it('returns an empty array without querying when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect(await getBlockedUserIds()).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the ids blocked by the current user', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({
      data: [{ blocked_id: 'u1' }, { blocked_id: 'u2' }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);

    expect(await getBlockedUserIds()).toEqual(['u1', 'u2']);
    expect(builder.eq).toHaveBeenCalledWith('blocker_id', 'me');
  });
});

describe('getBlockedUsers', () => {
  it('returns an empty array without a profile lookup when nothing is blocked', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    expect(await getBlockedUsers()).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('resolves display names for each blocked user', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ blocked_id: 'u1' }], error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ id: 'u1', display_name: 'たろう' }], error: null })
      );

    expect(await getBlockedUsers()).toEqual([{ id: 'u1', displayName: 'たろう' }]);
  });

  it('falls back to 不明なユーザー when the profile has no display name', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ blocked_id: 'u1' }], error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: 'u1', display_name: null }], error: null }));

    expect(await getBlockedUsers()).toEqual([{ id: 'u1', displayName: '不明なユーザー' }]);
  });
});

describe('blockUser', () => {
  it('throws when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(blockUser('u1')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts a blocker/blocked pair', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await blockUser('u1');

    expect(builder.insert).toHaveBeenCalledWith({ blocker_id: 'me', blocked_id: 'u1' });
  });
});

describe('unblockUser', () => {
  it('throws when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(unblockUser('u1')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deletes only the current user block row for the given target', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await unblockUser('u1');

    expect(builder.eq).toHaveBeenNthCalledWith(1, 'blocker_id', 'me');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'blocked_id', 'u1');
  });
});
