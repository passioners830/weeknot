import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import {
  addCircle,
  deleteCircle,
  getCircleMembers,
  getCircles,
  joinCircleByCode,
  leaveCircle,
  regenerateInviteCode,
  removeMember,
} from '../circles';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('getCircles', () => {
  it('maps invite_code/owner_id to inviteCode/ownerId', async () => {
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: [{ id: 'c1', name: '家族', invite_code: 'ABC123', owner_id: 'me' }],
        error: null,
      })
    );

    const circles = await getCircles();

    expect(circles).toEqual([{ id: 'c1', name: '家族', inviteCode: 'ABC123', ownerId: 'me' }]);
  });

  it('returns an empty array when there is no data', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    expect(await getCircles()).toEqual([]);
  });
});

describe('addCircle', () => {
  it('throws when not logged in and never touches the database', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(addCircle('家族')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('creates the circle and adds the owner as a member', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: 'c1', name: '家族', invite_code: 'ABC123', owner_id: 'me' },
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    const circle = await addCircle('家族');

    expect(circle).toEqual({ id: 'c1', name: '家族', inviteCode: 'ABC123', ownerId: 'me' });
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'circle_members');
  });

  it('throws when adding the owner as a member fails', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: 'c1', name: '家族', invite_code: 'ABC123', owner_id: 'me' },
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('member insert failed') }));

    await expect(addCircle('家族')).rejects.toThrow('member insert failed');
  });
});

describe('joinCircleByCode', () => {
  it('trims the code before calling the join_circle RPC', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'c1' }], error: null });
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: { id: 'c1', name: '家族', invite_code: 'ABC123', owner_id: 'other' },
        error: null,
      })
    );

    const circle = await joinCircleByCode('  ABC123  ');

    expect(mockRpc).toHaveBeenCalledWith('join_circle', { code: 'ABC123' });
    expect(circle).toEqual({ id: 'c1', name: '家族', inviteCode: 'ABC123', ownerId: 'other' });
  });

  it('throws when the invite code does not match any circle', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await expect(joinCircleByCode('NOPE')).rejects.toThrow('招待コードが見つかりませんでした');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when the RPC itself errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

    await expect(joinCircleByCode('ABC123')).rejects.toThrow('rpc failed');
  });
});

describe('getCircleMembers', () => {
  it('resolves display names for each member', async () => {
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null })
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            { id: 'u1', display_name: 'けんすけ' },
            { id: 'u2', display_name: null },
          ],
          error: null,
        })
      );

    const members = await getCircleMembers('c1');

    expect(members).toEqual([
      { id: 'u1', displayName: 'けんすけ' },
      { id: 'u2', displayName: '不明なユーザー' },
    ]);
  });

  it('returns an empty array without a profile lookup when the circle has no members', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    expect(await getCircleMembers('c1')).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

describe('leaveCircle', () => {
  it('throws when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(leaveCircle('c1')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deletes only the current user membership row', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await leaveCircle('c1');

    expect(builder.eq).toHaveBeenNthCalledWith(1, 'circle_id', 'c1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'user_id', 'me');
  });
});

describe('removeMember', () => {
  it('deletes the given member row from the given circle', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await removeMember('c1', 'u2');

    expect(mockFrom).toHaveBeenCalledWith('circle_members');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'circle_id', 'c1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'user_id', 'u2');
  });

  it('throws when the delete errors (e.g. not the owner)', async () => {
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({ data: null, error: new Error('permission denied') })
    );

    await expect(removeMember('c1', 'u2')).rejects.toThrow('permission denied');
  });
});

describe('regenerateInviteCode', () => {
  it('updates the circle with a freshly generated 8-character hex code', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    const code = await regenerateInviteCode('c1');

    expect(code).toMatch(/^[0-9a-f]{8}$/);
    expect(builder.update).toHaveBeenCalledWith({ invite_code: code });
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws when the update errors (e.g. not the owner)', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('not the owner') }));

    await expect(regenerateInviteCode('c1')).rejects.toThrow('not the owner');
  });
});

describe('deleteCircle', () => {
  it('deletes the circle row', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await deleteCircle('c1');

    expect(mockFrom).toHaveBeenCalledWith('circles');
    expect(builder.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws when the delete errors (e.g. not the owner)', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('not the owner') }));

    await expect(deleteCircle('c1')).rejects.toThrow('not the owner');
  });
});
