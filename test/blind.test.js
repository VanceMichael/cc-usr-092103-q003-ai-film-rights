import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBackend } from '../src/backend.js';
import { assertBlindSafe } from '../src/blind.js';

const backend = await loadBackend(fileURLToPath(new URL('../fixtures/', import.meta.url)));

test('全部作品的盲评资料包都不含院校与作者身份', () => {
  for (const workId of backend.works.works.keys()) {
    const pkg = backend.blindPackage(workId);
    assert.ok(pkg.blind_id.startsWith('blind-'));
    assert.ok(pkg.versions.length > 0);
    // 构造时已内置校验；再显式复核一次
    assert.equal(assertBlindSafe(pkg, backend.roster), true);
  }
});

test('盲评资料包只暴露匿名结构', () => {
  const pkg = backend.blindPackage('work-mirror');
  assert.equal(pkg.title, '《镜像练习》');
  assert.deepEqual(Object.keys(pkg).sort(), ['blind_id', 'stage', 'title', 'versions']);
  for (const v of pkg.versions) {
    assert.deepEqual(Object.keys(v).sort(), ['asset_kinds', 'blind_version_id', 'created_at', 'seq', 'visibility']);
  }
});

test('夹带团队名称的盲评资料被拒绝', () => {
  const pkg = backend.blindPackage('work-lantern');
  const teamName = backend.roster.teams.get('team-01').name;
  assert.throws(
    () => assertBlindSafe({ ...pkg, note: `出品：${teamName}` }, backend.roster),
    /团队名称/
  );
});

test('夹带学生姓名或院校的盲评资料被拒绝', () => {
  const pkg = backend.blindPackage('work-lantern');
  const stu = backend.roster.students.get('stu-001');
  assert.throws(
    () => assertBlindSafe({ ...pkg, credit: stu.name }, backend.roster),
    /学生姓名/
  );
  assert.throws(
    () => assertBlindSafe({ ...pkg, school: stu.institution }, backend.roster),
    /院校名称/
  );
});

test('夹带身份字段的盲评资料被拒绝', () => {
  const pkg = backend.blindPackage('work-lantern');
  assert.throws(
    () => assertBlindSafe({ ...pkg, versions: [...pkg.versions, { created_by: 'stu-001' }] }, backend.roster),
    /身份字段/
  );
});
