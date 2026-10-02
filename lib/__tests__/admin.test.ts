import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { amIAppAdmin, getReports, suspendUser, unsuspendUser } from '../admin';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockInvoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockInvoke.mockReset();
});

describe('amIAppAdmin', () => {
  it('returns false when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect(await amIAppAdmin()).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns the is_app_admin flag from the caller profile', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: { is_app_admin: true }, error: null }));

    expect(await amIAppAdmin()).toBe(true);
  });

  it('returns false when the profile lookup errors', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('nope') }));

    expect(await amIAppAdmin()).toBe(false);
  });
});

describe('getReports', () => {
  it('joins reporter and author names, and returns an empty array when there are no reports', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    expect(await getReports()).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('resolves reporter/author names and the author suspended flag', async () => {
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            {
              id: 'r1',
              reason: 'スパムです',
              created_at: '2026-01-01',
              reporter_id: 'reporter1',
              highlight_id: 'h1',
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: 'h1', user_id: 'author1' }], error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            { id: 'reporter1', display_name: 'つうほうしゃ', is_suspended: false },
            { id: 'author1', display_name: 'とうこうしゃ', is_suspended: true },
          ],
          error: null,
        })
      );

    const reports = await getReports();

    expect(reports).toEqual([
      {
        id: 'r1',
        reason: 'スパムです',
        createdAt: '2026-01-01',
        reporterId: 'reporter1',
        reporterName: 'つうほうしゃ',
        highlightId: 'h1',
        authorId: 'author1',
        authorName: 'とうこうしゃ',
        authorSuspended: true,
      },
    ]);
  });
});

describe('suspendUser', () => {
  it('invokes the suspend-user function with action=ban', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await suspendUser('u1');

    expect(mockInvoke).toHaveBeenCalledWith('suspend-user', {
      body: { targetUserId: 'u1', action: 'ban' },
    });
  });

  it('throws when the function call itself errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('network error') });

    await expect(suspendUser('u1')).rejects.toThrow('network error');
  });

  it('throws when the function returns an application-level error', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Forbidden: not an app admin' }, error: null });

    await expect(suspendUser('u1')).rejects.toThrow('Forbidden: not an app admin');
  });
});

describe('unsuspendUser', () => {
  it('invokes the suspend-user function with action=unban', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await unsuspendUser('u1');

    expect(mockInvoke).toHaveBeenCalledWith('suspend-user', {
      body: { targetUserId: 'u1', action: 'unban' },
    });
  });
});
