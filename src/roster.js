// 学生与团队名册：加载校验、成员退出。
// 核心规则：成员退出只改状态，不移出团队名册、不删除任何历史记录，
// 其在作品派生链上的贡献与署名必须完整保留。
const STATUSES = new Set(['active', 'withdrawn']);

export function loadRoster(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== 'roster') {
    throw new Error('名册资料缺少 kind: roster');
  }
  if (!Array.isArray(data.students) || data.students.length === 0) {
    throw new Error('名册缺少学生资料');
  }
  if (!Array.isArray(data.teams) || data.teams.length === 0) {
    throw new Error('名册缺少团队资料');
  }

  const students = new Map();
  for (const s of data.students) {
    for (const field of ['id', 'name', 'major', 'institution', 'team_id', 'status', 'enrolled_at']) {
      if (!s[field]) throw new Error(`学生资料缺少字段 ${field}`);
    }
    if (!STATUSES.has(s.status)) throw new Error(`学生 ${s.id} 状态非法: ${s.status}`);
    if (s.status === 'withdrawn' && !s.withdrawn_at) {
      throw new Error(`学生 ${s.id} 已退出但缺少退出日期`);
    }
    if (students.has(s.id)) throw new Error(`学生编号重复: ${s.id}`);
    students.set(s.id, s);
  }

  const teams = new Map();
  for (const t of data.teams) {
    if (!t.id || !t.name || !Array.isArray(t.member_ids) || t.member_ids.length === 0) {
      throw new Error('团队资料不完整');
    }
    if (teams.has(t.id)) throw new Error(`团队编号重复: ${t.id}`);
    const majors = new Set();
    for (const id of t.member_ids) {
      const stu = students.get(id);
      if (!stu) throw new Error(`团队 ${t.id} 引用了不存在的学生 ${id}`);
      if (stu.team_id !== t.id) throw new Error(`学生 ${id} 与团队 ${t.id} 的归属不一致`);
      majors.add(stu.major);
    }
    if (majors.size < 2) throw new Error(`团队 ${t.id} 不是跨专业团队`);
    if (Array.isArray(t.majors) && new Set(t.majors).size !== majors.size) {
      throw new Error(`团队 ${t.id} 申报的专业覆盖与成员不符`);
    }
    teams.set(t.id, { ...t, majors: [...majors] });
  }

  return { students, teams, stages: data.stages ?? [] };
}

// 成员退出：仅置状态与退出日期。团队 member_ids 保持不变，
// 历史贡献、版本创建者、声明人署名全部继续指向该学生。
export function withdrawStudent(roster, studentId, date) {
  const stu = roster.students.get(studentId);
  if (!stu) throw new Error(`学生不存在: ${studentId}`);
  if (stu.status === 'withdrawn') throw new Error(`学生 ${studentId} 已退出，不能重复退出`);
  stu.status = 'withdrawn';
  stu.withdrawn_at = date;
  return stu;
}
