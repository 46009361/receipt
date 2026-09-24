import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepo } from '../api/_lib/gallery.js';

const SKETCH = 'export const receipt = { height: 600, seed: 1 };\nexport function drawReceipt(p) {}';

test('repo links parse, and anything off GitHub or oddly shaped is refused', () => {
  assert.deepEqual(parseRepo('https://github.com/a/b/tree/main'), { owner: 'a', name: 'b', ref: 'main' });
  assert.deepEqual(parseRepo('https://github.com/a/b.git/'), { owner: 'a', name: 'b', ref: 'HEAD' });
  assert.equal(parseRepo('https://evil.example/a/b'), null);
  assert.equal(parseRepo('http://github.com/a/b'), null);
  assert.equal(parseRepo('https://github.com/a/b%2F..%2Fx'), null);
  assert.equal(parseRepo('javascript:alert(1)'), null);
});

test('gallery asks Airtable for named fields only, sends only public ones, and survives Airtable failing', async (t) => {
  Object.assign(process.env, { AIRTABLE_TOKEN: 'patSECRET', AIRTABLE_BASE_ID: 'appTest', PUBLIC_ORIGIN: 'https://receipt.hackclub.com', NODE_ENV: 'production' });
  const airtableUrls = [];
  const tokenSentTo = [];
  let airtableDown = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    url = String(url);
    if (JSON.stringify(options.headers || {}).includes('patSECRET')) tokenSentTo.push(new URL(url).host);
    if (url.includes('api.airtable.com')) {
      airtableUrls.push(url);
      if (airtableDown) return { ok: false, status: 503, text: async () => '' };
      return { ok: true, json: async () => ({ records: [
        { id: 'rec1', createdTime: '2026-09-02', fields: { 'Code URL': 'https://github.com/a/b', 'Slack Username': 'U123', Screenshot: [{ url: 'https://dl.airtable.com/secret.png' }], Email: 'leak@example.com' } },
        { id: 'rec2', createdTime: '2026-09-01', fields: { 'Code URL': 'https://github.com/c/d', Screenshot: [{}], Rejected: true } },
      ] }) };
    }
    if (url.includes('raw.githubusercontent.com')) return { ok: true, status: 200, text: async () => SKETCH };
    if (url.includes('cachet')) return { ok: true, status: 200, json: async () => ({ displayName: 'ada' }) };
    throw new Error(`unexpected ${url}`);
  };
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => { globalThis.fetch = originalFetch; process.off('unhandledRejection', onUnhandled); t.mock.timers.reset(); });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24') });

  const { getGallery } = await import(`../api/_lib/gallery.js?${Math.random()}`);
  const items = await getGallery();

  const fields = new URL(airtableUrls[0]).searchParams.getAll('fields[]');
  assert.deepEqual(fields.sort(), ['Code URL', 'Rejected', 'Screenshot', 'Slack Username']);
  assert.deepEqual(tokenSentTo, ['api.airtable.com']);
  assert.equal(items.length, 1, 'rejected record is hidden');
  assert.deepEqual(Object.keys(items[0]).sort(), ['author', 'height', 'repoUrl', 'sketchUrl', 'slackId', 'slug', 'source']);
  const body = JSON.stringify(items);
  for (const secret of ['rec1', 'airtable', 'leak@example.com', 'patSECRET']) assert.ok(!body.includes(secret), secret);

  // Cache expires, Airtable is down: the stale wall is served and nothing crashes.
  airtableDown = true;
  t.mock.timers.setTime(Date.parse('2026-09-24') + 11 * 60 * 1000);
  assert.equal((await getGallery()).length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});
