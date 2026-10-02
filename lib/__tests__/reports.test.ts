import { makeQueryBuilder, makeUser } from '../testUtils';

jest.mock('../supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { reportHighlight } from '../reports';
/* eslint-enable import/first */

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('reportHighlight', () => {
  it('throws when not logged in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(reportHighlight('h1', 'スパムです')).rejects.toThrow('ログインしていません');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts a report row with the reporter, highlight and reason', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValueOnce(builder);

    await reportHighlight('h1', 'スパムです');

    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect(builder.insert).toHaveBeenCalledWith({
      reporter_id: 'me',
      highlight_id: 'h1',
      reason: 'スパムです',
    });
  });

  it('throws when the insert errors', async () => {
    mockGetUser.mockResolvedValue(makeUser('me'));
    mockFrom.mockReturnValueOnce(makeQueryBuilder({ data: null, error: new Error('insert failed') }));

    await expect(reportHighlight('h1', 'スパムです')).rejects.toThrow('insert failed');
  });
});
