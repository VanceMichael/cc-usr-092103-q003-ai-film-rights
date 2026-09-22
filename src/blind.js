// 盲评资料包：评选期间对外只暴露匿名化信息，
// 院校、作者、团队身份一律不得出现在资料包中。
const FORBIDDEN_KEYS = new Set([
  'created_by', 'uploaded_by', 'declared_by', 'recorded_by',
  'student_id', 'team_id', 'member_ids', 'institution', 'name'
]);

// 生成某作品的盲评资料包：只含盲审编号、标题、阶段与各版本的素材类型构成。
export function buildBlindPackage(ctx, workId) {
  const work = ctx.works.works.get(workId);
  if (!work) throw new Error(`作品不存在: ${workId}`);
  const versions = [...ctx.works.versions.values()]
    .filter((v) => v.work_id === workId)
    .sort((a, b) => (a.seq - b.seq) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  const pkg = {
    blind_id: `blind-${workId}`,
    title: work.title,
    stage: work.stage,
    versions: versions.map((v) => ({
      blind_version_id: `bver-${v.seq}-${v.id.replace(/^ver-/, '')}`,
      seq: v.seq,
      created_at: v.created_at,
      visibility: v.visibility,
      asset_kinds: v.asset_uses.map((u) => ctx.assets.get(u.asset_id)?.kind ?? 'unknown')
    }))
  };
  assertBlindSafe(pkg, ctx.roster);
  return pkg;
}

// 校验资料包不泄露院校与作者身份：既查身份字段，也全文比对名册中的姓名、团队名、院校名。
export function assertBlindSafe(pkg, roster) {
  const leaks = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (FORBIDDEN_KEYS.has(key)) leaks.push(`身份字段 ${key}`);
        walk(value);
      }
    }
  };
  walk(pkg);

  const text = JSON.stringify(pkg);
  for (const s of roster.students.values()) {
    if (s.name && text.includes(s.name)) leaks.push(`学生姓名 ${s.name}`);
  }
  for (const t of roster.teams.values()) {
    if (t.name && text.includes(t.name)) leaks.push(`团队名称 ${t.name}`);
  }
  const institutions = new Set([...roster.students.values()].map((s) => s.institution));
  for (const inst of institutions) {
    if (inst && text.includes(inst)) leaks.push(`院校名称 ${inst}`);
  }
  if (leaks.length > 0) {
    throw new Error(`盲评资料泄露身份信息: ${leaks.join('、')}`);
  }
  return true;
}
