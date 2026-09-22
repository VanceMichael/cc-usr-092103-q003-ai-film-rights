// 资料装载与参照完整性校验：业务代码只通过本模块读取 program / registry。

function fail(msg, errors) {
  errors.push(msg);
}

// 轻量结构校验（与 contracts/*.schema.json 的必填/枚举约定保持一致，不引入外部依赖）。
export function parseProgram(rawText) {
  const value = JSON.parse(rawText);
  if (value.domain !== 'ai-film-rights') throw new Error('领域标识不正确');
  if (!value.version || !Array.isArray(value.students) || !Array.isArray(value.teams)) {
    throw new Error('培养项目资料缺少必要字段');
  }
  return value;
}

export function parseRegistry(rawText) {
  const value = JSON.parse(rawText);
  if (value.domain !== 'ai-film-rights') throw new Error('领域标识不正确');
  for (const key of ['works', 'versions', 'assets', 'models', 'claims', 'uploads', 'blind_submissions']) {
    if (!Array.isArray(value[key])) throw new Error(`素材登记缺少必要字段：${key}`);
  }
  return value;
}

export function validateProgram(program) {
  const errors = [];
  const ids = (xs) => new Set(xs.map((x) => x.id));
  const teamIds = ids(program.teams);
  const stageIds = ids(program.stages);

  if (program.students.length !== program.cohort.student_quota) {
    fail(`学生数 ${program.students.length} 与名额 ${program.cohort.student_quota} 不一致`, errors);
  }
  if (program.teams.length !== program.cohort.team_quota) {
    fail(`团队数 ${program.teams.length} 与名额 ${program.cohort.team_quota} 不一致`, errors);
  }
  const studentIds = new Set();
  for (const s of program.students) {
    if (studentIds.has(s.id)) fail(`学生标识重复：${s.id}`, errors);
    studentIds.add(s.id);
    if (s.team_id && !teamIds.has(s.team_id)) fail(`学生 ${s.id} 指向不存在的团队 ${s.team_id}`, errors);
    if (s.status === '已退出' && !s.exited_on) fail(`退出学生 ${s.id} 缺少退出日期`, errors);
  }
  for (const t of program.teams) {
    const majors = new Set();
    for (const m of t.members) {
      if (!studentIds.has(m.student_id)) fail(`团队 ${t.id} 成员 ${m.student_id} 不在学生名册`, errors);
      const stu = program.students.find((s) => s.id === m.student_id);
      if (stu && majors.has(stu.major)) fail(`团队 ${t.id} 内出现同专业成员：${stu.major}（要求跨专业）`, errors);
      if (stu) majors.add(stu.major);
    }
  }
  const order = program.stages.map((s) => s.order);
  if (order.join() !== [...order].sort((a, b) => a - b).join()) fail('阶段顺序未按 order 递增', errors);
  for (const a of program.awards ?? []) {
    if (!stageIds.has(a.stage_id)) fail(`奖项 ${a.id} 指向不存在的阶段 ${a.stage_id}`, errors);
  }
  if (errors.length) throw new Error(errors.join('；'));
  return program;
}

export function validateRegistry(registry, program) {
  const errors = [];
  const byId = (xs) => new Map(xs.map((x) => [x.id, x]));
  const works = byId(registry.works);
  const versions = byId(registry.versions);
  const assets = byId(registry.assets);
  const claims = byId(registry.claims);
  const models = byId(registry.models);
  const stageIds = new Set(program.stages.map((s) => s.id));
  const teamIds = new Set(program.teams.map((t) => t.id));

  for (const w of registry.works) {
    if (!teamIds.has(w.team_id)) fail(`作品 ${w.id} 指向不存在的团队`, errors);
    if (!versions.has(w.current_release_id)) fail(`作品 ${w.id} 的发布版本不存在`, errors);
    for (const e of w.stage_entries) {
      if (!stageIds.has(e.stage_id)) fail(`作品 ${w.id} 阶段记录指向未知阶段 ${e.stage_id}`, errors);
      if (!versions.has(e.version_id)) fail(`作品 ${w.id} 阶段版本不存在 ${e.version_id}`, errors);
    }
  }
  for (const v of registry.versions) {
    if (!works.has(v.work_id)) fail(`版本 ${v.id} 指向不存在的作品`, errors);
    for (const p of v.parents) {
      if (!versions.has(p)) fail(`版本 ${v.id} 的父版本 ${p} 不存在`, errors);
      if (versions.get(p).work_id !== v.work_id) fail(`版本 ${v.id} 跨作品引用父版本 ${p}`, errors);
    }
    for (const a of v.asset_ids) {
      if (!assets.has(a)) fail(`版本 ${v.id} 引用不存在的素材 ${a}`, errors);
    }
  }
  // 派生图不得成环
  const visiting = new Set();
  const done = new Set();
  const dfs = (id) => {
    if (done.has(id)) return;
    if (visiting.has(id)) { fail(`素材派生链成环：${id}`, errors); return; }
    visiting.add(id);
    for (const d of assets.get(id)?.derived_from_asset_ids ?? []) {
      if (!assets.has(d)) fail(`素材 ${id} 派生自不存在的素材 ${d}`, errors);
      else dfs(d);
    }
    visiting.delete(id);
    done.add(id);
  };
  for (const a of registry.assets) {
    if (a.source.model_id && !models.has(a.source.model_id)) fail(`素材 ${a.id} 指向未知模型`, errors);
    dfs(a.id);
  }
  for (const c of registry.claims) {
    if (!assets.has(c.asset_id)) fail(`许可声明 ${c.id} 指向不存在的素材`, errors);
    if (c.superseded_by && !claims.has(c.superseded_by)) fail(`许可声明 ${c.id} 指向不存在的取代声明`, errors);
  }
  for (const rv of registry.revocations ?? []) {
    if (!claims.has(rv.claim_id)) fail(`撤回记录 ${rv.id} 指向不存在的许可声明`, errors);
  }
  for (const u of registry.uploads) {
    if (!assets.has(u.asset_id) || !versions.has(u.version_id)) fail(`上传记录 ${u.id} 参照不完整`, errors);
  }
  for (const b of registry.blind_submissions) {
    if (!works.has(b.work_id) || !versions.has(b.version_id) || !stageIds.has(b.stage_id)) {
      fail(`盲评提交 ${b.id} 参照不完整`, errors);
    }
  }
  if (errors.length) throw new Error(errors.join('；'));
  return registry;
}

// 建立查询索引。
export function buildIndexes(program, registry) {
  const byId = (xs) => new Map(xs.map((x) => [x.id, x]));
  const versions = byId(registry.versions);
  const assets = byId(registry.assets);
  const childrenOf = new Map();
  for (const v of registry.versions) {
    for (const p of v.parents) {
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p).push(v.id);
    }
  }
  const versionsByWork = new Map();
  for (const v of registry.versions) {
    if (!versionsByWork.has(v.work_id)) versionsByWork.set(v.work_id, []);
    versionsByWork.get(v.work_id).push(v);
  }
  const claimsByAsset = new Map();
  for (const c of registry.claims) {
    if (!claimsByAsset.has(c.asset_id)) claimsByAsset.set(c.asset_id, []);
    claimsByAsset.get(c.asset_id).push(c);
  }
  const uploadsByAsset = new Map();
  for (const u of registry.uploads) {
    if (!uploadsByAsset.has(u.asset_id)) uploadsByAsset.set(u.asset_id, []);
    uploadsByAsset.get(u.asset_id).push(u);
  }
  const derivedChildren = new Map();
  for (const a of registry.assets) {
    for (const d of a.derived_from_asset_ids ?? []) {
      if (!derivedChildren.has(d)) derivedChildren.set(d, []);
      derivedChildren.get(d).push(a.id);
    }
  }
  return {
    program,
    asOf: registry.as_of ?? new Date().toISOString().slice(0, 10),
    works: byId(registry.works),
    versions,
    assets,
    models: byId(registry.models),
    claims: byId(registry.claims),
    claimsByAsset,
    revocations: byId(registry.revocations ?? []),
    uploads: registry.uploads,
    uploadsByAsset,
    blindByWork: new Map(registry.blind_submissions.map((b) => [b.work_id, b])),
    childrenOf,
    versionsByWork,
    derivedChildren,
    students: byId(program.students),
    teams: byId(program.teams),
    stages: byId(program.stages),
    channels: byId(program.channels),
    awardsByWork: new Map((program.awards ?? []).map((a) => [a.work_id, a]))
  };
}
