const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const {
  extractCollectionItems,
  listBoondCollectionIds,
} = require('../lib/boondApi');

test('listBoondCollectionIds pagine la collection et ne retourne que les IDs existants', async () => {
  const originalGet = axios.get;
  const calls = [];
  axios.get = async (url, config) => {
    calls.push({ url, params: config.params });
    if (config.params.page === 1) {
      return {
        status: 200,
        data: {
          data: [
            { id: '19', type: 'project' },
            { id: '38', type: 'project' },
          ],
          meta: { totals: { rows: 3 } },
        },
      };
    }
    return {
      status: 200,
      data: {
        data: [{ id: '150', type: 'project' }],
        meta: { totals: { rows: 3 } },
      },
    };
  };

  try {
    const ids = await listBoondCollectionIds(
      { params: { period: 'created' } },
      'https://example.test/api',
      '/projects',
      { startDate: '2026-01-01' },
      { pageSize: 2 }
    );

    assert.deepEqual(ids, [19, 38, 150]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      url: 'https://example.test/api/projects',
      params: {
        period: 'created',
        startDate: '2026-01-01',
        page: 1,
        maxResults: 2,
      },
    });
    assert.equal(calls[1].params.page, 2);
  } finally {
    axios.get = originalGet;
  }
});

test('extractCollectionItems accepte les réponses HAL Boond', () => {
  assert.deepEqual(
    extractCollectionItems({
      _embedded: {
        deliveries: [
          { id: '314', type: 'delivery' },
          { id: '315', type: 'delivery' },
        ],
      },
    }).map((item) => item.id),
    ['314', '315']
  );
});

test('listBoondCollectionIds propage une erreur de liste au lieu de sonder des IDs', async () => {
  const originalGet = axios.get;
  axios.get = async () => ({ status: 403, data: {} });

  try {
    await assert.rejects(
      () =>
        listBoondCollectionIds(
          {},
          'https://example.test/api',
          '/deliveries-groupments'
        ),
      /Boond 403/
    );
  } finally {
    axios.get = originalGet;
  }
});
