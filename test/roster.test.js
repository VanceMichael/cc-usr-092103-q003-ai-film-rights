import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRoster, withdrawStudent } from '../src/roster.js';

const roster = loadRoster(await readFile(new URL('../fixtures/roster.json', import.meta.url), 'utf8'));

test('名册覆盖84名学生与33支跨专业团队', () => {
  assert.equal(roster.students.size, 84);
  assert.equal(roster.teams.size, 33);
  for (const team of roster.teams.values()) {
    const majors = new Set(team.member_ids.map((id) => roster.students.get(id).major));
    assert.ok(majors.size >= 2, `团队 ${team.id} 应跨专业`);
  }
});

test('团队归属与学生记录一致', () => {
  for (const stu of roster.students.values()) {
    assert.ok(roster.teams.get(stu.team_id).member_ids.includes(stu.id));
  }
});

test('成员退出不抹掉归属与历史记录', () => {
  const before = roster.teams.get('team-02').member_ids.length;
  withdrawStudent(roster, 'stu-004', '2026-09-22');
  const stu = roster.students.get('stu-004');
  assert.equal(stu.status, 'withdrawn');
  assert.equal(stu.withdrawn_at, '2026-09-22');
  // 仍在团队名册中，退出不等于除名
  assert.equal(roster.teams.get('team-02').member_ids.length, before);
  assert.ok(roster.teams.get('team-02').member_ids.includes('stu-004'));
});

test('重复退出被拒绝', () => {
  assert.throws(() => withdrawStudent(roster, 'stu-004', '2026-09-23'), /已退出/);
  assert.throws(() => withdrawStudent(roster, 'stu-999', '2026-09-23'), /不存在/);
});

test('预置退出学生 stu-003 保留退出日期与团队归属', () => {
  const stu = roster.students.get('stu-003');
  assert.equal(stu.status, 'withdrawn');
  assert.equal(stu.withdrawn_at, '2026-08-01');
  assert.ok(roster.teams.get('team-01').member_ids.includes('stu-003'));
});

test('非法名册被拒绝', () => {
  assert.throws(() => loadRoster({ kind: 'roster', students: [], teams: [] }), /缺少学生/);
  assert.throws(
    () => loadRoster({
      kind: 'roster',
      students: [
        { id: 'stu-1', name: '甲', major: '导演', institution: '某校', team_id: 'team-1', status: 'active', enrolled_at: '2026-02-20' },
        { id: 'stu-2', name: '乙', major: '导演', institution: '某校', team_id: 'team-1', status: 'active', enrolled_at: '2026-02-20' }
      ],
      teams: [{ id: 'team-1', name: '同专业组', member_ids: ['stu-1', 'stu-2'], majors: ['导演'] }]
    }),
    /跨专业/
  );
});
