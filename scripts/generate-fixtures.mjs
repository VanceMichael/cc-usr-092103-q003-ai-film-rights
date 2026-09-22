// 确定性生成培养项目资料（program.json）与素材权利登记（registry.json）。
// 所有人物、名称均为虚构；运行：node scripts/generate-fixtures.mjs
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const fp = (s) => createHash('md5').update(s).digest('hex');

// ---------- 培养项目：84 名学生 / 33 支团队 ----------
const MAJORS = ['导演', '编剧', '摄影', '美术', '表演', '动画', '声音设计', '音乐', '数字媒体', '人工智能', '法学', '市场营销'];
const ROLE_BY_MAJOR = {
  导演: '导演', 编剧: '编剧', 摄影: '摄影', 美术: '美术', 表演: '表演', 动画: '动画',
  声音设计: '声音', 音乐: '作曲', 数字媒体: '技术', 人工智能: '技术', 法学: '法务联络', 市场营销: '制片'
};
const CITIES = ['成都', '杭州', '西安', '重庆', '长沙', '厦门', '青岛', '苏州', '武汉', '南京', '广州', '天津'];
const BRIEFS = ['夜归人的十五分钟', '一条河的两岸', '看不见的邻居', '旧城新声', '信号中断之后', '雨天时刻表'];

// 18 支三人队 + 15 支两人队 = 84 人 / 33 队
const sizes = [...Array(18).fill(3), ...Array(15).fill(2)];

const students = [];
const teams = [];
let cursor = 0;
for (let t = 1; t <= 33; t += 1) {
  const size = sizes[t - 1];
  const members = [];
  for (let k = 0; k < size; k += 1) {
    const idx = cursor + k;
    const id = `st-${pad(idx + 1, 3)}`;
    const major = MAJORS[idx % MAJORS.length]; // 连续入队、专业循环 => 同队专业必不相同
    students.push({
      id, code: `学员编号${pad(idx + 1, 3)}`, major,
      team_id: `tm-${pad(t)}`, status: '在队', exited_on: null, exit_note: null
    });
    members.push({
      student_id: id, role: ROLE_BY_MAJOR[major], joined_on: '2026-03-02', left_on: null,
      contribution: `${major}方向创作分工（见版本署名与上传记录）`
    });
  }
  teams.push({
    id: `tm-${pad(t)}`,
    name: `第${pad(t)}组`,
    city_brief: `${CITIES[(t - 1) % CITIES.length]}：${BRIEFS[(t - 1) % BRIEFS.length]}`,
    members
  });
  cursor += size;
}

// 两名退出成员：贡献、署名与已授予许可保留，不做删除
function markExit(studentId, teamId, date, note, contribution) {
  const s = students.find((x) => x.id === studentId);
  s.status = '已退出';
  s.exited_on = date;
  s.exit_note = note;
  const m = teams.find((x) => x.id === teamId).members.find((x) => x.student_id === studentId);
  m.left_on = date;
  m.contribution = contribution;
}
markExit('st-020', 'tm-07', '2026-05-30', '个人原因退出，已签署贡献与配音许可保留确认',
  'AI演员中之人参考表演与旁白配音（as-07-vc），权属登记 cl-07-vc 继续有效');
markExit('st-057', 'tm-20', '2026-04-20', '转专业退出，课堂贡献保留', '命题阶段美术分镜（已并入 v-20-02）');

const stages = [
  { id: 'sg-training', key: 'training', name: 'AI创作培训', order: 1, window_start: '2026-03-02', window_end: '2026-03-31', anonymized: false },
  { id: 'sg-city', key: 'city_brief', name: '城市命题创作', order: 2, window_start: '2026-04-07', window_end: '2026-05-17', anonymized: false },
  { id: 'sg-blind', key: 'blind_review', name: '盲评', order: 3, window_start: '2026-05-25', window_end: '2026-06-14', anonymized: true },
  { id: 'sg-showcase', key: 'showcase', name: '城市嘉年华展映', order: 4, window_start: '2026-07-04', window_end: '2026-07-12', anonymized: false },
  { id: 'sg-incubation', key: 'incubation', name: '创业孵化', order: 5, window_start: '2026-08-01', window_end: '2027-01-31', anonymized: false }
];

const channels = [
  { id: 'ch-class', name: '课堂展映', kind: '课堂展映', purposes: ['课堂教学'], regions: ['CN'], commercial: false, requires_anonymity: false },
  { id: 'ch-carnival', name: '城市嘉年华', kind: '城市嘉年华', purposes: ['非商业展映'], regions: ['CN'], commercial: false, requires_anonymity: false },
  { id: 'ch-job', name: '就业对接', kind: '就业对接', purposes: ['招聘评审'], regions: ['CN'], commercial: false, requires_anonymity: false },
  { id: 'ch-promo', name: '商业推广投放', kind: '商业推广', purposes: ['商业推广'], regions: ['CN'], commercial: true, requires_anonymity: false },
  { id: 'ch-road', name: '孵化路演', kind: '孵化路演', purposes: ['融资路演'], regions: ['CN'], commercial: false, requires_anonymity: false },
  { id: 'ch-festival', name: '国内影展投递', kind: '影展投递', purposes: ['影展参评'], regions: ['CN'], commercial: false, requires_anonymity: true },
  { id: 'ch-overseas', name: '海外影展投递', kind: '影展投递', purposes: ['影展参评'], regions: ['US'], commercial: false, requires_anonymity: true }
];

const program = {
  domain: 'ai-film-rights', version: 1,
  cohort: { id: 'co-2026s', name: '2026春季AI影视创作营', started_on: '2026-03-02', student_quota: 84, team_quota: 33 },
  students, teams, stages, channels,
  awards: []
};

// ---------- 素材权利登记 ----------
const works = [];
const versions = [];
const assets = [];
const models = [
  { id: 'md-filmlens', name: '幻镜Filmlens（虚构）', vendor: '幻镜科技（虚构）', terms_version: 'v3.2', terms_summary: '课堂教育版：生成内容可用于教学与非商业展映；商业推广需单独商用授权。条款快照随许可声明归档。' },
  { id: 'md-storyboard', name: '分镜师BoardAI（虚构）', vendor: '云图工坊（虚构）', terms_version: 'v2.1', terms_summary: '教育账号输出归创作者团队使用，禁止用于虚假代言。' }
];
const claims = [];
const revocations = [];
const uploads = [];
const blindSubmissions = [];

const NONCOM = ['课堂教学', '非商业展映', '招聘评审', '融资路演', '影展参评'];
const ALL = ['课堂教学', '非商业展映', '招聘评审', '融资路演', '影展参评', '商业展映', '商业推广'];
const CLASS_ONLY = ['课堂教学', '非商业展映'];
let claimSeq = 0;
let uploadSeq = 0;

function addClaim({ no, code, assetId, licensor, purposes, regions = ['CN'], start = '2026-03-02', end = '2027-12-31',
  revocable = false, basis, status = '有效', supersededBy = null, conditions = '按培养项目统一协议，退出不撤回已授予的非商业用途。' }) {
  claimSeq += 1;
  const id = `cl-${pad(no)}-${code}`;
  claims.push({
    id, asset_id: assetId,
    licensor, purposes, regions,
    term_start: start, term_end: end,
    revocable, revocation_conditions: conditions,
    basis, declared_on: start, status, superseded_by: supersededBy
  });
  return id;
}

function addUpload(no, assetId, versionId, by, on, note = null) {
  uploadSeq += 1;
  const a = assets.find((x) => x.id === assetId);
  uploads.push({
    id: `up-${pad(uploadSeq, 4)}`, asset_id: assetId, fingerprint: a.fingerprint,
    version_id: versionId, uploaded_by: by, uploaded_on: on, note
  });
}

function addAsset(no, code, type, title, source, extra = {}) {
  const id = `as-${pad(no)}-${code}`;
  const row = {
    id, type, title,
    fingerprint: fp(`${no}:${code}:${title}`),
    restricted: false, restriction_note: null, source,
    derived_from_asset_ids: extra.derives ?? []
  };
  Object.assign(row, extra);
  assets.push(row);
  return row;
}

function memberId(no, k) {
  // 与生成器相同的排布：前18队3人，其后2人
  const start = no <= 18 ? (no - 1) * 3 : 54 + (no - 19) * 2;
  return `st-${pad(start + k + 1, 3)}`;
}

// 标准派生链：培训练习 -> 城市命题 -> 盲评剪定 -> 展映发布（可带并行分支合并）
function buildChain(no, title, o = {}) {
  const p = pad(no);
  const wid = `wk-${p}`;
  const v1 = `v-${p}-01`, v2 = `v-${p}-02`, v3 = `v-${p}-03`, v4 = `v-${p}-04`, v3b = `v-${p}-03b`;
  const m0 = memberId(no, 0), m1 = memberId(no, 1);

  const td = addAsset(no, 'td', 'training_data', '训练素材：OpenFrame公开影像集选段',
    { kind: 'dataset', provider: 'OpenFrame数据集（虚构，CC许可）' });
  const aip = addAsset(no, 'aip', 'ai_performer', 'AI演员形象「小城信使」',
    { kind: 'ai_platform', model_id: 'md-filmlens', provider: '幻镜Filmlens' }, { derives: undefined });
  aip.derived_from_asset_ids = [td.id];
  const sb = addAsset(no, 'sb', 'storyboard_output', '分镜工具输出：城市命题分镜',
    { kind: 'ai_platform', model_id: 'md-storyboard', provider: '分镜师BoardAI' });
  const gs = addAsset(no, 'gs', 'generated_shot', 'AI生成镜头合成段',
    { kind: 'ai_platform', model_id: 'md-filmlens' }, { derived_from_asset_ids: [sb.id, aip.id] });
  const lf = addAsset(no, 'lf', 'live_footage', '城市实拍片段',
    { kind: 'field_shoot', shot_by: m1, performed_by: m0 });
  const mu = addAsset(no, 'mu', 'music', '配乐《街角》（曲库授权）',
    { kind: 'music_library', provider: '青果音乐库（虚构）' });

  const vrows = [
    { id: v1, work_id: wid, seq: 1, label: '培训练习版', parents: [], asset_ids: [td.id, aip.id, sb.id], created_on: '2026-03-20', created_by: m0, branch: null },
    { id: v2, work_id: wid, seq: 2, label: '城市命题版', parents: [v1], asset_ids: [gs.id, lf.id, mu.id], created_on: '2026-05-10', created_by: m1, branch: null },
    { id: v3, work_id: wid, seq: 3, label: '盲评送选版', parents: [v2], asset_ids: [], created_on: '2026-05-24', created_by: m0, branch: null }
  ];

  const releaseAssets = [];
  if (o.extraRelease) releaseAssets.push(...o.extraRelease(no, v4, m0, m1));

  if (o.branch) {
    const mu2 = addAsset(no, 'mu2', 'music', '并行分支替换配乐《夜班车》',
      { kind: 'music_library', provider: '青果音乐库（虚构）' });
    vrows.push({ id: v3b, work_id: wid, seq: 3, label: '并行修订：B线配乐替换', parents: [v2], asset_ids: [mu2.id], created_on: '2026-05-26', created_by: m1, branch: 'B-配乐替换' });
    vrows.push({ id: v4, work_id: wid, seq: 4, label: '展映发布版（合并双线）', parents: [v3, v3b], asset_ids: releaseAssets, created_on: '2026-06-30', created_by: m0, branch: null });
    addClaim({
      no, code: 'mu2', assetId: mu2.id,
      licensor: { kind: '音乐版权方', name: '青果音乐库（虚构）', student_id: null },
      purposes: o.branchMusicPurposes ?? CLASS_ONLY,
      basis: '曲库教育档授权书（仅限课堂与非商业展映）',
      revocable: false
    });
    addUpload(no, mu2.id, v3b, m1, '2026-05-26T20:14:00Z');
  } else {
    vrows.push({ id: v4, work_id: wid, seq: 4, label: '展映发布版', parents: [v3], asset_ids: releaseAssets, created_on: '2026-06-30', created_by: m0, branch: null });
  }

  // 标准许可声明
  const purposes = o.classroomOnly ? CLASS_ONLY : (o.allPurposes ? ALL : NONCOM);
  addClaim({ no, code: 'td', assetId: td.id, licensor: { kind: '数据集提供方', name: 'OpenFrame数据集（虚构）', student_id: null },
    purposes, basis: 'CC BY-NC 4.0 数据集许可快照' });
  addClaim({ no, code: 'aip', assetId: aip.id, licensor: { kind: '平台方', name: '幻镜科技（虚构）', student_id: null },
    purposes, basis: '幻镜Filmlens 教育版条款 v3.2 快照 + 团队肖像与中之人协议' });
  addClaim({ no, code: 'sb', assetId: sb.id, licensor: { kind: '平台方', name: '云图工坊（虚构）', student_id: null },
    purposes, basis: '分镜师BoardAI 教育账号条款 v2.1 快照' });
  addClaim({ no, code: 'gs', assetId: gs.id, licensor: { kind: '学生团队', name: `第${p}组`, student_id: null },
    purposes: o.allPurposes ? ALL : purposes, basis: '团队创作协议：输出著作权归团队，平台条款允许的派生使用' });
  addClaim({ no, code: 'lf', assetId: lf.id, licensor: { kind: '学生团队', name: `第${p}组`, student_id: null },
    purposes, basis: '实拍现场同意书 + 被拍摄学生肖像授权' });
  addClaim({ no, code: 'mu', assetId: mu.id, licensor: { kind: '音乐版权方', name: '青果音乐库（虚构）', student_id: null },
    purposes: o.musicPurposes ?? purposes,
    start: '2026-04-20', end: o.musicEnds ?? '2027-12-31',
    basis: '曲库教育档授权书', revocable: !!o.revokeAipOn ? false : false,
    conditions: '教育档不可转授权；毕业后续展需另行确认。' });

  if (o.revokeAipOn) {
    const cl = claims.find((c) => c.id === `cl-${p}-aip`);
    cl.revocable = true;
    cl.revocation_conditions = '中之一撤回肖像授权时，AI演员相关派生使用应停止。';
    revocations.push({ id: `rv-${p}-aip`, claim_id: cl.id, effective_on: o.revokeAipOn, reason: '中之一通知撤回肖像与表演授权，按协议生效' });
  }
  if (o.supersedeMusic) {
    const old = claims.find((c) => c.id === `cl-${p}-mu`);
    old.status = '已被取代';
    old.superseded_by = `cl-${p}-mu2new`;
    addClaim({ no, code: 'mu2new', assetId: mu.id, licensor: { kind: '音乐版权方', name: '青果音乐库（虚构）', student_id: null },
      purposes: ['课堂教学'], regions: ['CN'], start: '2026-06-01', end: '2027-12-31',
      basis: '曲库2026年6月续约：教育档收窄为课堂用途，授权地域不含境外展映。' });
    const tdx = addAsset(no, 'td2', 'training_data', '训练素材：来路标注不全的网络图片包',
      { kind: 'dataset', provider: '未提供' });
    vrows.find((v) => v.id === v4).asset_ids.push(tdx.id);
    addClaim({ no, code: 'td2', assetId: tdx.id, licensor: { kind: '学生团队', name: `第${p}组`, student_id: null },
      purposes: NONCOM, basis: '团队自述「网上找的图」，无数据集许可或采购凭证' });
  }

  // 退出成员的配音（tm-07）：许可由学生本人授予，退出后仍有效
  if (o.voiceByExited) {
    const vc = addAsset(no, 'vc', 'voice_clip', '旁白配音（退出成员录制）',
      { kind: 'field_shoot', performed_by: o.voiceByExited });
    vrows.find((v) => v.id === v2).asset_ids.push(vc.id);
    addClaim({ no, code: 'vc', assetId: vc.id, licensor: { kind: '学生本人', name: '退出成员（化名）', student_id: o.voiceByExited },
      purposes: NONCOM, basis: '学生本人配音授权书（含退出后不撤回条款，商业用途需再次确认）',
      revocable: true, conditions: '非商业展映与招聘评审不可撤回；商业推广需本人书面再确认。' });
    addUpload(no, vc.id, v2, o.voiceByExited, '2026-05-08T15:20:00Z', '退出前完成录制与授权');
  }

  versions.push(...vrows);
  for (const v of vrows) for (const aid of v.asset_ids) addUpload(no, aid, v.id, v.created_by, `${v.created_on}T10:00:00Z`);
  if (o.duplicate) {
    const dup = addAsset(no, 'dup', 'generated_shot', '重复导入的AI生成镜头合成段（改名重传）',
      { kind: 'ai_platform', model_id: 'md-filmlens' }, { derived_from_asset_ids: [sb.id, aip.id] });
    dup.fingerprint = gs.fingerprint; // 内容指纹一致 => 重复上传
    vrows.find((v) => v.id === v4).asset_ids.push(dup.id);
    addUpload(no, dup.id, v4, m1, '2026-06-30T09:12:00Z', '换名重传，未补许可声明');
  }

  const leaks = o.leaks ?? [];
  blindSubmissions.push({
    id: `bs-${p}`, work_id: wid, version_id: v3, stage_id: 'sg-blind', submitted_on: '2026-05-24',
    identity_leaks: leaks
  });

  works.push({
    id: wid, team_id: `tm-${p}`, title,
    current_release_id: v4,
    stage_entries: [
      { stage_id: 'sg-training', version_id: v1, entered_on: '2026-03-20' },
      { stage_id: 'sg-city', version_id: v2, entered_on: '2026-05-10' },
      { stage_id: 'sg-blind', version_id: v3, entered_on: '2026-05-24' },
      { stage_id: 'sg-showcase', version_id: v4, entered_on: '2026-07-01' },
      ...(o.incubation ? [{ stage_id: 'sg-incubation', version_id: v4, entered_on: '2026-08-15' }] : [])
    ]
  });
}

const TITLES = {
  1: '江城一日', 2: '末班灯火', 3: '风中的扮演者', 4: '档案里的街巷',
  5: '重传的镜头', 6: '两条配乐线', 7: '离开后的旁白', 8: '获奖之后',
  9: '没撕干净的标签', 10: '缩水的续约'
};

// 场景 1：完整干净链路（含孵化）
buildChain(1, TITLES[1], { allPurposes: true, incubation: true });
// 场景 2：配乐许可已于 2026-08-31 到期
buildChain(2, TITLES[2], { musicEnds: '2026-08-31' });
// 场景 3：AI演员肖像/表演授权被撤回（2026-07-01 生效）
buildChain(3, TITLES[3], { revokeAipOn: '2026-07-01' });
// 场景 4：受限档案素材混入发布版
buildChain(4, TITLES[4], {
  extraRelease: (no, v4) => {
    const x = addAsset(no, 'lf2', 'live_footage', '受限档案影像：仅供课堂拉片，禁止公开',
      { kind: 'external_archive', provider: '市档案馆教学专线（虚构）' },
      { restricted: true, restriction_note: '档案借阅协议标注「课堂教学内使用，不得公开传播」' });
    addClaim({ no, code: 'lf2', assetId: x.id,
      licensor: { kind: '素材档案方', name: '市档案馆（虚构）', student_id: null },
      purposes: ['课堂教学'], regions: ['CN'],
      basis: '档案教学借阅协议（限课堂拉片，禁止任何公开版本使用）', revocable: false });
    return [x.id];
  }
});
// 场景 5：同一内容换名重复上传，副本没有许可声明
buildChain(5, TITLES[5], { duplicate: true });
// 场景 6：并行修订分支合并；B线配乐只有课堂用途
buildChain(6, TITLES[6], { branch: true, branchMusicPurposes: ['课堂教学'] });
// 场景 7：成员退出，配音贡献与本人授权保留
buildChain(7, TITLES[7], { voiceByExited: 'st-020' });
// 场景 8：盲评获奖；课堂许可不自动扩展为商业推广
buildChain(8, TITLES[8], { classroomOnly: true });
program.awards.push({
  id: 'aw-01', name: '盲评优秀作品（虚构）', work_id: 'wk-08', stage_id: 'sg-blind', won_on: '2026-06-20',
  license_scope_note: '获奖只带来展映荣誉与嘉年华入围资格；不自动把课堂/非商业许可扩展为商业推广，商业投放须按新渠道逐项补授权。'
});
// 场景 9：盲评送选版泄露院校与作者身份
buildChain(9, TITLES[9], {
  leaks: [
    { asset_id: 'as-09-lf', leak_kind: '院校标识', detail: '实拍片段角落保留校旗与实训基地招牌' },
    { asset_id: 'as-09-lf', leak_kind: '元数据残留', detail: '成片容器元数据含作者学号与剪辑机用户名' }
  ]
});
// 场景 10：旧许可被收窄的新许可取代；另有主体存疑素材
buildChain(10, TITLES[10], { supersedeMusic: true });

// 其余 23 支团队：标准非商业链路（其中 tm-20 有一名退出成员）
for (let t = 11; t <= 33; t += 1) {
  buildChain(t, `第${pad(t)}组命题短片`, { incubation: t === 12 });
}

const registry = {
  domain: 'ai-film-rights', version: 1, as_of: '2026-09-22',
  works, versions, assets, models, claims, revocations, uploads, blind_submissions: blindSubmissions
};

await mkdir(join(root, 'fixtures'), { recursive: true });
await writeFile(join(root, 'fixtures/program.json'), JSON.stringify(program, null, 2) + '\n');
await writeFile(join(root, 'fixtures/registry.json'), JSON.stringify(registry, null, 2) + '\n');
console.log(`已生成：${students.length} 名学生 / ${teams.length} 支团队 / ${works.length} 部作品 / ${assets.length} 项素材 / ${claims.length} 份许可声明`);
