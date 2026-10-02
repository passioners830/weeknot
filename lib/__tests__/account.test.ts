jest.mock('../supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}));

/* eslint-disable import/first -- jest.mock above must run before these imports resolve */
import { supabase } from '../supabase';
import { deleteMyAccount } from '../account';
/* eslint-enable import/first */

const mockInvoke = supabase.functions.invoke as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;

beforeEach(() => {
  mockInvoke.mockReset();
  mockSignOut.mockReset();
});

describe('deleteMyAccount', () => {
  it('invokes delete-account and signs out on success', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockSignOut.mockResolvedValue({ error: null });

    await deleteMyAccount();

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: {} });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('throws without signing out when the function call itself errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('network error') });

    await expect(deleteMyAccount()).rejects.toThrow('network error');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('throws without signing out when the function returns an application-level error', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Unauthorized' }, error: null });

    await expect(deleteMyAccount()).rejects.toThrow('Unauthorized');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
