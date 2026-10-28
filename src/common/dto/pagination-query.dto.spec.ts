import { paginate } from './pagination-query.dto';

describe('paginate', () => {
  it('computes total pages', () => {
    expect(paginate(['a', 'b'], 5, 1, 2).meta).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
  });

  it('returns zero pages for an empty result', () => {
    expect(paginate([], 0, 1, 20).meta.totalPages).toBe(0);
  });
});
