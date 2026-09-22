import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadLicenses, loadAssets } from '../src/catalog.js';

const read = (f) => readFile(new URL(`../fixtures/${f}`, import.meta.url), 'utf8');
const licenses = loadLicenses(await read('licenses.json'));
const { assets, duplicates } = loadAssets(await read('assets.json'), licenses);

test('许可与素材登记完整', () => {
  assert.equal(licenses.size, 10);
  assert.equal(assets.size, 13);
});

test('重复上传按内容指纹检出', () => {
  assert.deepEqual(duplicates, [['asset-music-dup-1', 'asset-music-dup-2']]);
});

test('引用不存在的许可被拒绝', () => {
  assert.throws(
    () => loadAssets({
      kind: 'assets',
      assets: [{
        id: 'asset-x', kind: 'music', title: 'x', hash: 'h',
        license_id: 'lic-none', uploaded_by: 'stu-001', uploaded_at: '2026-01-01', restricted: false
      }]
    }, licenses),
    /不存在的许可/
  );
});

test('许可期限颠倒或撤回信息不全被拒绝', () => {
  assert.throws(
    () => loadLicenses({
      kind: 'licenses',
      licenses: [{
        id: 'lic-bad', licensor: { id: 'o', name: '某机构', kind: 'vendor' },
        purposes: ['classroom'], territories: ['CN'],
        term: { start: '2027-01-01', end: '2026-01-01' },
        revocation: { revocable: true, notice_days: 30, status: 'active', revoked_at: null, reason: null }
      }]
    }),
    /起止颠倒/
  );
  assert.throws(
    () => loadLicenses({
      kind: 'licenses',
      licenses: [{
        id: 'lic-bad2', licensor: { id: 'o', name: '某机构', kind: 'vendor' },
        purposes: ['classroom'], territories: ['CN'],
        term: { start: '2026-01-01', end: '2027-01-01' },
        revocation: { revocable: true, notice_days: 30, status: 'revoked', revoked_at: null, reason: null }
      }]
    }),
    /撤回日期或原因/
  );
});

test('受限素材必须说明限制原因', () => {
  assert.throws(
    () => loadAssets({
      kind: 'assets',
      assets: [{
        id: 'asset-y', kind: 'live_footage', title: 'y', hash: 'h2',
        license_id: 'lic-footage-cn', uploaded_by: 'stu-001', uploaded_at: '2026-01-01', restricted: true
      }]
    }, licenses),
    /限制原因/
  );
});
