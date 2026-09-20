import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { addComment, deleteComment, getCommentsForHighlights } from '../comments';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('getCommentsForHighlights', () => {
  it('returns an empty object without querying when given no ids', async () => {
    const result = await getCommentsForHighlights([]);
    expect(result).toEqual({});
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('groups comments by highlight and resolves author names', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            { id: 'c1', highlight_id: 'h1', user_id: 'me', body: '自分のコメント', created_at: '2026-01-01' },
            { id: 'c2', highlight_id: 'h1', user_id: 'other', body: '他人のコメント', created_at: '2026-01-02' },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [{ id: 'other', display_name: 'さゆり' }],
          error: null,
        })
      );

    const result = await getCommentsForHighlights(['h1']);

    expect(result.h1).toEqual([
      {
        id: 'c1',
        highlightId: 'h1',
        authorId: 'me',
        authorName: '自分',
        body: '自分のコメント',
        createdAt: '2026-01-01',
        isMine: true,
      },
      {
        id: 'c2',
        highlightId: 'h1',
        authorId: 'other',
        authorName: 'さゆり',
        body: '他人のコメント',
        createdAt: '2026-01-02',
        isMine: false,
      },
    ]);
  });

  it('falls back to 不明なユーザー when the author has no profile row', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [{ id: 'c1', highlight_id: 'h1', user_id: 'ghost', body: '本文', created_at: '2026-01-01' }],
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    const result = await getCommentsForHighlights(['h1']);

    expect(result.h1[0].authorName).toBe('不明なユーザー');
  });

  it('throws when the comments query errors', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('db down') }));

    await expect(getCommentsForHighlights(['h1'])).rejects.toThrow('db down');
  });
});

describe('addComment', () => {
  it('throws when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(addComment('h1', '本文')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts the comment and returns it tagged as isMine', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: { id: 'c1', highlight_id: 'h1', user_id: 'me', body: '本文', created_at: '2026-01-01' },
        error: null,
      })
    );

    const comment = await addComment('h1', '本文');

    expect(comment).toEqual({
      id: 'c1',
      highlightId: 'h1',
      authorId: 'me',
      authorName: '自分',
      body: '本文',
      createdAt: '2026-01-01',
      isMine: true,
    });
  });
});

describe('deleteComment', () => {
  it('throws when the delete errors', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('not found') }));

    await expect(deleteComment('c1')).rejects.toThrow('not found');
  });

  it('resolves when the delete succeeds', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await expect(deleteComment('c1')).resolves.toBeUndefined();
  });
});
