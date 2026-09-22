import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRoster } from '../src/roster.js';
import { loadWorks, chainTo, findForks, addContribution, attributionFor } from '../src/works.js';

const read = (f) => readFile(new URL(`../fixtures/${f}`, import.meta.url), 'utf8');
const roster = loadRoster(await read('roster.json'));
const works = loadWorks(await read('works.json'));

test('派生链从根版本回溯到候选版本', () => {
  const chain = chainTo(works.versions, 'ver-l3');
  assert.deepEqual(chain.map((v) => v.id), ['ver-l1', 'ver-l2', 'ver-l3']);
  assert.deepEqual(chainTo(works.versions, 'ver-l1').map((v) => v.id), ['ver-l1']);
  assert.throws(() => chainTo(works.versions, 'ver-none'), /不存在/);
});

test('派生链循环被拒绝', () => {
  const cyclic = new Map([
    ['v1', { id: 'v1', parent_id: 'v2' }],
    ['v2', { id: 'v2', parent_id: 'v1' }]
  ]);
  assert.throws(() => chainTo(cyclic, 'v1'), /循环/);
});

test('并行修订在 ver-m2 处检出两个分支', () => {
  const forks = findForks(works.versions);
  assert.deepEqual(forks, [{ parent_id: 'ver-m2', children: ['ver-m3', 'ver-m3b'] }]);
});

test('已退出学生不能登记新贡献，但历史贡献保留', () => {
  assert.throws(
    () => addContribution(works, roster, {
      student_id: 'stu-003', version_id: 'ver-l3', role: '摄影', hours: 5, recorded_at: '2026-09-22'
    }),
    /已退出/
  );
  const added = addContribution(works, roster, {
    student_id: 'stu-002', version_id: 'ver-l3', role: '调色', hours: 3, recorded_at: '2026-09-22'
  });
  assert.equal(added.role, '调色');
});

test('署名视图包含已退出成员', () => {
  const credits = attributionFor(works, roster, 'ver-l1');
  const withdrawn = credits.find((c) => c.student_id === 'stu-003');
  assert.ok(withdrawn, '已退出成员的贡献必须保留在署名中');
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.role, '摄影');
});

test('跨作品派生被拒绝', () => {
  assert.throws(
    () => loadWorks({
      kind: 'works',
      works: [
        { id: 'work-a', team_id: 'team-01', title: '甲', stage: 'screening', award: null },
        { id: 'work-b', team_id: 'team-02', title: '乙', stage: 'screening', award: null }
      ],
      versions: [
        { id: 'ver-a1', work_id: 'work-a', parent_id: null, seq: 1, created_by: 'stu-001', created_at: '2026-01-01', visibility: 'internal', asset_uses: [] },
        { id: 'ver-b1', work_id: 'work-b', parent_id: 'ver-a1', seq: 1, created_by: 'stu-004', created_at: '2026-01-02', visibility: 'internal', asset_uses: [] }
      ],
      declarations: [],
      contributions: []
    }),
    /父版本属于其他作品/
  );
});
