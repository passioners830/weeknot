import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));
jest.mock('../photos', () => ({ deleteHighlightPhotos: jest.fn() }));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { deleteHighlightPhotos } from '../photos';
import {
  deleteHighlight,
  getFeed,
  getHighlights,
  getHighlightsInRange,
  publishHighlight,
  updateHighlightVisibility,
} from '../highlights';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockDeleteHighlightPhotos = deleteHighlightPhotos as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockDeleteHighlightPhotos.mockReset();
});

describe('getFeed', () => {
  it('resolves author names, marks own posts as isMine, and excludes blocked authors', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            { id: 'h1', created_at: '2026-01-05', photo_count: 3, visibility: 'public', user_id: 'me' },
            { id: 'h2', created_at: '2026-01-04', photo_count: 2, visibility: 'circle', user_id: 'other' },
            { id: 'h3', created_at: '2026-01-03', photo_count: 1, visibility: 'public', user_id: 'blocked' },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ blocked_id: 'blocked' }], error: null }))
      .mockReturnValueOnce(
        makeQueryBuilder({ data: [{ id: 'other', display_name: 'さゆり' }], error: null })
      );

    const feed = await getFeed();

    expect(feed.items).toEqual([
      {
        id: 'h1',
        createdAt: '2026-01-05',
        photoCount: 3,
        visibility: 'public',
        authorId: 'me',
        authorName: '不明なユーザー',
        isMine: true,
      },
      {
        id: 'h2',
        createdAt: '2026-01-04',
        photoCount: 2,
        visibility: 'circle',
        authorId: 'other',
        authorName: 'さゆり',
        isMine: false,
      },
    ]);
  });

  it('returns an empty page without a block/profile lookup when there are no highlights', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    const feed = await getFeed();

    expect(feed).toEqual({ items: [], nextCursor: null });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns a nextCursor when a full page comes back, and null otherwise', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [{ id: 'h1', created_at: '2026-01-05', photo_count: 3, visibility: 'public', user_id: 'me' }],
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    const feed = await getFeed({ limit: 1 });

    expect(feed.nextCursor).toBe('2026-01-05');
  });
});

describe('getHighlights', () => {
  it('flattens nested highlight_circles rows into circleIds', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          {
            id: 'h1',
            created_at: '2026-01-01',
            photo_count: 5,
            visibility: 'circle',
            highlight_circles: [{ circle_id: 'circ1' }, { circle_id: 'circ2' }],
          },
        ],
        error: null,
      })
    );

    const highlights = await getHighlights();

    expect(highlights.items).toEqual([
      {
        id: 'h1',
        createdAt: '2026-01-01',
        photoCount: 5,
        visibility: 'circle',
        circleIds: ['circ1', 'circ2'],
      },
    ]);
    expect(highlights.nextCursor).toBeNull();
  });

  it("only queries the signed-in user's own highlights", async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValueOnce(builder);

    await getHighlights();

    expect(builder.eq).toHaveBeenCalledWith('user_id', 'me');
  });

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(getHighlights()).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('getHighlightsInRange', () => {
  it("queries the user's own highlights within [start, end) and maps the rows", async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({
      data: [
        {
          id: 'h1',
          created_at: '2026-10-05T03:00:00Z',
          photo_count: 4,
          visibility: 'public',
          highlight_circles: [],
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);
    const start = new Date(2026, 9, 1);
    const end = new Date(2026, 10, 1);

    const highlights = await getHighlightsInRange(start, end);

    expect(builder.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(builder.gte).toHaveBeenCalledWith('created_at', start.toISOString());
    expect(builder.lt).toHaveBeenCalledWith('created_at', end.toISOString());
    expect(highlights).toEqual([
      {
        id: 'h1',
        createdAt: '2026-10-05T03:00:00Z',
        photoCount: 4,
        visibility: 'public',
        circleIds: [],
      },
    ]);
  });

  it('throws when the query fails', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('query failed') }));

    await expect(getHighlightsInRange(new Date(), new Date())).rejects.toThrow('query failed');
  });
});

describe('publishHighlight', () => {
  it('does not link circles when visibility is not circle', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: { id: 'h1', created_at: '2026-01-01', photo_count: 4, visibility: 'private' },
        error: null,
      })
    );

    const highlight = await publishHighlight({ photoCount: 4, visibility: 'private', circleIds: ['circ1'] });

    expect(highlight.circleIds).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('links the given circles when visibility is circle', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: { id: 'h1', created_at: '2026-01-01', photo_count: 4, visibility: 'circle' },
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    const highlight = await publishHighlight({ photoCount: 4, visibility: 'circle', circleIds: ['circ1', 'circ2'] });

    expect(highlight.circleIds).toEqual(['circ1', 'circ2']);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'highlight_circles');
  });
});

describe('updateHighlightVisibility', () => {
  it('replaces highlight_circles rows when switching to circle visibility', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update highlights
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // delete highlight_circles
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // insert highlight_circles

    await updateHighlightVisibility('h1', 'circle', ['circ1']);

    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it('skips the insert step when switching to a non-circle visibility', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })) // update highlights
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null })); // delete highlight_circles

    await updateHighlightVisibility('h1', 'private', []);

    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});

describe('deleteHighlight', () => {
  it('throws when not logged in and never touches storage or the row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(deleteHighlight('h1')).rejects.toThrow('ログインしていません');
    expect(mockDeleteHighlightPhotos).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deletes the stored photos before deleting the row', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteHighlight('h1');

    expect(mockDeleteHighlightPhotos).toHaveBeenCalledWith('me', 'h1');
    expect(mockFrom).toHaveBeenCalledWith('highlights');
  });
});
