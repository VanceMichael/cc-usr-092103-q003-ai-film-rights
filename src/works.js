// 作品、派生版本、声明与贡献：加载校验与派生链遍历。
export const STAGES = ['training', 'city_brief', 'blind_review', 'screening', 'incubation'];
const VISIBILITIES = new Set(['internal', 'public']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function loadWorks(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== 'works') throw new Error('作品资料缺少 kind: works');

  const works = new Map();
  for (const w of data.works ?? []) {
    if (!w.id || !w.team_id || !w.title) throw new Error('作品资料不完整');
    if (!STAGES.includes(w.stage)) throw new Error(`作品 ${w.id} 阶段非法: ${w.stage}`);
    if (w.award && (!w.award.name || !DATE_RE.test(w.award.granted_at ?? ''))) {
      throw new Error(`作品 ${w.id} 的获奖记录不完整`);
    }
    if (works.has(w.id)) throw new Error(`作品编号重复: ${w.id}`);
    works.set(w.id, w);
  }
  if (works.size === 0) throw new Error('作品资料为空');

  const versions = new Map();
  for (const v of data.versions ?? []) {
    if (!v.id || !v.work_id) throw new Error('版本资料不完整');
    if (!works.has(v.work_id)) throw new Error(`版本 ${v.id} 引用了不存在的作品 ${v.work_id}`);
    if (!Number.isInteger(v.seq) || v.seq < 1) throw new Error(`版本 ${v.id} 序号非法`);
    if (!v.created_by || !DATE_RE.test(v.created_at ?? '')) {
      throw new Error(`版本 ${v.id} 缺少创建者或创建日期`);
    }
    if (!VISIBILITIES.has(v.visibility)) throw new Error(`版本 ${v.id} 可见性非法`);
    if (!Array.isArray(v.asset_uses)) throw new Error(`版本 ${v.id} 缺少素材使用清单`);
    for (const u of v.asset_uses) {
      if (!u.asset_id || !u.role) throw new Error(`版本 ${v.id} 的素材使用记录不完整`);
    }
    if (versions.has(v.id)) throw new Error(`版本编号重复: ${v.id}`);
    versions.set(v.id, v);
  }
  for (const v of versions.values()) {
    if (v.parent_id === null || v.parent_id === undefined) continue;
    const parent = versions.get(v.parent_id);
    if (!parent) throw new Error(`版本 ${v.id} 的父版本 ${v.parent_id} 不存在`);
    if (parent.work_id !== v.work_id) throw new Error(`版本 ${v.id} 的父版本属于其他作品`);
  }

  const declarations = new Map();
  for (const d of data.declarations ?? []) {
    if (!d.id || !versions.has(d.version_id)) throw new Error(`声明 ${d.id ?? '(无编号)'} 引用了不存在的版本`);
    if (!d.declared_by || !DATE_RE.test(d.declared_at ?? '')) throw new Error(`声明 ${d.id} 缺少声明人或日期`);
    if (!Array.isArray(d.asset_ids)) throw new Error(`声明 ${d.id} 缺少素材清单`);
    if (declarations.has(d.version_id)) throw new Error(`版本 ${d.version_id} 存在多份声明`);
    declarations.set(d.version_id, d);
  }

  const contributions = [];
  for (const c of data.contributions ?? []) {
    if (!c.student_id || !versions.has(c.version_id)) {
      throw new Error(`贡献记录引用了不存在的学生或版本: ${c.student_id} -> ${c.version_id}`);
    }
    if (!c.role || !(c.hours > 0)) throw new Error('贡献记录缺少角色或工时');
    contributions.push(c);
  }

  return { works, versions, declarations, contributions };
}

// 从候选版本沿 parent_id 回溯到根版本，返回 根→候选 的完整派生链。
export function chainTo(versions, targetId) {
  const chain = [];
  const seen = new Set();
  let cur = versions.get(targetId);
  if (!cur) throw new Error(`版本不存在: ${targetId}`);
  while (cur) {
    if (seen.has(cur.id)) throw new Error(`派生链存在循环: ${cur.id}`);
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parent_id ? versions.get(cur.parent_id) : null;
  }
  return chain;
}

// 并行修订：同一父版本派生出多个子版本。
export function findForks(versions) {
  const children = new Map();
  for (const v of versions.values()) {
    if (!v.parent_id) continue;
    if (!children.has(v.parent_id)) children.set(v.parent_id, []);
    children.get(v.parent_id).push(v.id);
  }
  return [...children.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([parent_id, ids]) => ({ parent_id, children: ids.sort() }));
}

// 登记新贡献。已退出学生不能再产生新贡献，但其历史贡献永久保留。
export function addContribution(works, roster, contribution) {
  const stu = roster.students.get(contribution.student_id);
  if (!stu) throw new Error(`学生不存在: ${contribution.student_id}`);
  if (stu.status === 'withdrawn') {
    throw new Error(`学生 ${contribution.student_id} 已退出，不能登记新的贡献（历史贡献仍然保留）`);
  }
  if (!works.versions.has(contribution.version_id)) {
    throw new Error(`版本不存在: ${contribution.version_id}`);
  }
  works.contributions.push(contribution);
  return contribution;
}

// 版本的署名视图：包含已退出成员，状态原样呈现。
export function attributionFor(works, roster, versionId) {
  return works.contributions
    .filter((c) => c.version_id === versionId)
    .map((c) => {
      const stu = roster.students.get(c.student_id);
      return {
        student_id: c.student_id,
        name: stu?.name ?? c.student_id,
        major: stu?.major ?? null,
        status: stu?.status ?? 'unknown',
        role: c.role,
        hours: c.hours,
        recorded_at: c.recorded_at
      };
    });
}
