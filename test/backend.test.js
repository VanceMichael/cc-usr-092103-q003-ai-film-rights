import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBackend } from '../src/backend.js';

const backend = await loadBackend(fileURLToPath(new URL('../fixtures/', import.meta.url)));
const DATE = '2026-09-22';

test('后台装配五份领域资料', () => {
  assert.equal(backend.roster.students.size, 84);
  assert.equal(backend.roster.teams.size, 33);
  assert.equal(backend.licenses.size, 10);
  assert.equal(backend.assets.size, 13);
  assert.equal(backend.works.works.size, 8);
  assert.equal(backend.channels.size, 5);
});

test('成员退出后署名仍然完整，且不影响发布核验', () => {
  const credits = backend.attributionFor('ver-l1');
  assert.ok(credits.some((c) => c.student_id === 'stu-003' && c.status === 'withdrawn'));
  // 已退出成员参与的作品依然可以通过权利核验
  const r = backend.evaluateRelease('work-lantern', 'ver-l3', 'ch-carnival', DATE);
  assert.equal(r.allowed, true, r.summary);
});

test('许可到期预警覆盖已届满与临近届满', () => {
  const report = backend.expiringLicenses(DATE, 120);
  const expired = report.find((x) => x.license_id === 'lic-music-expired');
  assert.equal(expired.status, 'expired');
  assert.ok(expired.days < 0);
  const expiring = report.find((x) => x.license_id === 'lic-ai-actor-classroom');
  assert.equal(expiring.status, 'expiring');
  assert.equal(expiring.days, 100);
  // 已撤回的许可由撤回阻断负责，不出现在到期预警中
  assert.ok(!report.some((x) => x.license_id === 'lic-training-revoked'));
});

test('重复上传在目录层面即可检出', () => {
  assert.deepEqual(backend.duplicates, [['asset-music-dup-1', 'asset-music-dup-2']]);
});

test('跨文件不一致的资料无法装配', async () => {
  const { createBackend } = await import('../src/backend.js');
  const { loadRoster } = await import('../src/roster.js');
  const { loadLicenses, loadAssets } = await import('../src/catalog.js');
  const { loadWorks } = await import('../src/works.js');
  const { loadChannels } = await import('../src/channels.js');
  const { readFile } = await import('node:fs/promises');
  const read = async (f) => JSON.parse(await readFile(new URL(`../fixtures/${f}`, import.meta.url), 'utf8'));
  const roster = loadRoster(await read('roster.json'));
  const licenses = loadLicenses(await read('licenses.json'));
  const assets = loadAssets(await read('assets.json'), licenses);
  const worksRaw = await read('works.json');
  worksRaw.versions[0].asset_uses.push({ asset_id: 'asset-ghost', role: 'cast' });
  const works = loadWorks(worksRaw);
  const channels = loadChannels(await read('channels.json'));
  assert.throws(
    () => createBackend({ roster, licenses, assets, works, channels }),
    /未登记的素材 asset-ghost/
  );
});
