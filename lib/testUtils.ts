// Supabaseのクエリビルダー（.from().select().eq()...のようなメソッドチェーンで、
// 最後にawaitすると{data, error}に解決される）を模倣するテスト用モック
export function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = jest.fn(chain);
  builder.insert = jest.fn(chain);
  builder.update = jest.fn(chain);
  builder.delete = jest.fn(chain);
  builder.eq = jest.fn(chain);
  builder.in = jest.fn(chain);
  builder.order = jest.fn(chain);
  builder.gte = jest.fn(chain);
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (
    resolve: (value: typeof result) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

export function makeUser(id: string) {
  return { data: { user: { id } } };
}

// Supabase Storageバケットのモック（list/upload/createSignedUrls/removeはチェーンせず
// それぞれ直接{data, error}を返す）
export function makeStorageBucket(overrides: {
  list?: { data: unknown; error: unknown };
  upload?: { data: unknown; error: unknown };
  createSignedUrls?: { data: unknown; error: unknown };
  remove?: { data: unknown; error: unknown };
}) {
  return {
    list: jest.fn().mockResolvedValue(overrides.list ?? { data: [], error: null }),
    upload: jest.fn().mockResolvedValue(overrides.upload ?? { data: null, error: null }),
    createSignedUrls: jest
      .fn()
      .mockResolvedValue(overrides.createSignedUrls ?? { data: [], error: null }),
    remove: jest.fn().mockResolvedValue(overrides.remove ?? { data: null, error: null }),
  };
}
