import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import {
  countIncomingPending,
  getIncomingRequests,
  getMyRequestStatuses,
  getOutgoingRequests,
  requestKey,
  requestPhoto,
  respondToRequest,
} from '../photoRequests';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('requestPhoto', () => {
  it('inserts a request for the signed-in user', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await requestPhoto({ highlightId: 'h1', ownerId: 'owner', photoIndex: 2 });

    expect(mockFrom).toHaveBeenCalledWith('photo_requests');
    expect(builder.insert).toHaveBeenCalledWith({
      highlight_id: 'h1',
      photo_index: 2,
      owner_id: 'owner',
      requester_id: 'me',
    });
  });

  it('reports a duplicate request in plain language', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({ data: null, error: { code: '23505', message: 'duplicate key value' } })
    );

    await expect(requestPhoto({ highlightId: 'h1', ownerId: 'owner', photoIndex: 0 })).rejects.toThrow(
      'すでにリクエスト済みです'
    );
  });

  it('passes through other errors, such as the server-side validation messages', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({ data: null, error: { code: 'P0001', message: 'リクエストが多すぎます' } })
    );

    await expect(requestPhoto({ highlightId: 'h1', ownerId: 'owner', photoIndex: 0 })).rejects.toMatchObject({
      message: 'リクエストが多すぎます',
    });
  });

  it('throws when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(requestPhoto({ highlightId: 'h1', ownerId: 'owner', photoIndex: 0 })).rejects.toThrow(
      'ログインしていません'
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('getIncomingRequests', () => {
  it('returns only my pending requests with the requester name', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const requests = makeQueryBuilder({
      data: [
        {
          id: 'r1',
          highlight_id: 'h1',
          photo_index: 1,
          owner_id: 'me',
          requester_id: 'u2',
          status: 'pending',
          created_at: '2026-10-19T10:00:00Z',
        },
      ],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(requests)
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: 'u2', display_name: 'さゆり' }], error: null }));

    const result = await getIncomingRequests();

    expect(requests.eq).toHaveBeenCalledWith('owner_id', 'me');
    expect(requests.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual([
      {
        id: 'r1',
        highlightId: 'h1',
        photoIndex: 1,
        ownerId: 'me',
        requesterId: 'u2',
        status: 'pending',
        createdAt: '2026-10-19T10:00:00Z',
        otherName: 'さゆり',
      },
    ]);
  });

  it('skips the profile lookup when there are no requests', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    expect(await getIncomingRequests()).toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('falls back to a placeholder name when the profile is not readable', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom
      .mockReturnValueOnce(
        makeQueryBuilder({
          data: [
            {
              id: 'r1',
              highlight_id: 'h1',
              photo_index: 0,
              owner_id: 'me',
              requester_id: 'ghost',
              status: 'pending',
              created_at: '2026-10-19T10:00:00Z',
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    expect((await getIncomingRequests())[0].otherName).toBe('不明なユーザー');
  });
});

describe('getOutgoingRequests', () => {
  it('returns my recent requests with the owner name', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const requests = makeQueryBuilder({
      data: [
        {
          id: 'r1',
          highlight_id: 'h1',
          photo_index: 0,
          owner_id: 'u3',
          requester_id: 'me',
          status: 'accepted',
          created_at: '2026-10-19T10:00:00Z',
        },
      ],
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(requests)
      .mockReturnValueOnce(makeQueryBuilder({ data: [{ id: 'u3', display_name: 'おばあちゃん' }], error: null }));

    const result = await getOutgoingRequests();

    expect(requests.eq).toHaveBeenCalledWith('requester_id', 'me');
    expect(requests.gte).toHaveBeenCalledWith('created_at', expect.any(String));
    expect(result[0]).toMatchObject({ status: 'accepted', otherName: 'おばあちゃん', ownerId: 'u3' });
  });
});

describe('getMyRequestStatuses', () => {
  it('maps requests by highlight and photo index', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(
      makeQueryBuilder({
        data: [
          { highlight_id: 'h1', photo_index: 0, status: 'pending' },
          { highlight_id: 'h1', photo_index: 2, status: 'declined' },
        ],
        error: null,
      })
    );

    expect(await getMyRequestStatuses()).toEqual({
      [requestKey('h1', 0)]: 'pending',
      [requestKey('h1', 2)]: 'declined',
    });
  });
});

describe('respondToRequest', () => {
  it('updates only a still-pending request', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'r1' }], error: null });
    mockFrom.mockReturnValueOnce(builder);

    await respondToRequest('r1', 'accepted');

    expect(builder.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'r1');
    expect(builder.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('tells the user when the request was already handled', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: [], error: null }));

    await expect(respondToRequest('r1', 'declined')).rejects.toThrow('すでに対応済みです');
  });

  it('throws on a query error', async () => {
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('update failed') }));

    await expect(respondToRequest('r1', 'accepted')).rejects.toThrow('update failed');
  });
});

describe('countIncomingPending', () => {
  it('returns the count of my pending requests', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, count: 3, error: null }));

    expect(await countIncomingPending()).toBe(3);
  });

  it('treats a missing count as zero', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, count: null, error: null }));

    expect(await countIncomingPending()).toBe(0);
  });
});
