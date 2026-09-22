import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture } from './helpers.js';
import { traceRelease, traceContributor, versionLineage } from '../src/provenance.js';
import { findDuplicateUploads, findParallelRevisions } from '../src/ingest.js';
import { blindReviewGate } from '../src/anonymity.js';
import { evaluateWork, evaluateBatch } from '../src/gate.js';

const idx = await loadFixture();
const allWorkIds = [...idx.works.keys()];

test('培养项目覆盖 84 名学生、33 支跨专业团队', () => {
  assert.equal(idx.students.size, 84);
  assert.equal(idx.teams.size, 33);
  assert.equal([...idx.students.values()].filter((s) => s.status === '已退出').length, 2);
  // 每支团队至少 2 人且专业互不相同
  for (const t of idx.teams.values()) {
    assert.ok(t.members.length >= 2, `${t.id} 人数不足`);
    const majors = t.members.map((m) => idx.students.get(m.student_id).major);
    assert.equal(new Set(majors).size, majors.length, `${t.id} 不是跨专业团队`);
  }
});

test('五阶段齐全且盲评阶段标记为匿名', () => {
  const keys = [...idx.stages.values()].map((s) => s.key);
  assert.deepEqual(keys, ['training', 'city_brief', 'blind_review', 'showcase', 'incubation']);
  assert.equal(idx.stages.get('sg-blind').anonymized, true);
});

test('派生链逐层追溯到培训期训练素材与 AI 演员上游', () => {
  const trace = traceRelease(idx, 'wk-02');
  const ids = new Set(trace.items.map((i) => i.asset.id));
  assert.ok(ids.has('as-02-td'), '培训训练素材应沿链可追溯');
  assert.ok(ids.has('as-02-aip'), 'AI演员应可追溯');
  const gs = trace.items.find((i) => i.asset.id === 'as-02-gs');
  assert.deepEqual(new Set(gs.asset_ancestry), new Set(['as-02-td', 'as-02-aip', 'as-02-sb', 'as-02-gs']));
  assert.ok(gs.asset_ancestry.indexOf('as-02-gs') === gs.asset_ancestry.length - 1, '派生链末端为该生成镜头');
  assert.ok(gs.asset_ancestry.indexOf('as-02-aip') < gs.asset_ancestry.indexOf('as-02-gs'), 'AI演员位于生成镜头上游');
  // 训练素材在培训练习版引入，链段一路延伸到发布版
  const td = trace.items.find((i) => i.asset.id === 'as-02-td');
  assert.deepEqual(td.version_chain_segment, ['v-02-01', 'v-02-02', 'v-02-03', 'v-02-04']);
});

test('场景1：权利链完整的作品可进嘉年华，海外渠道因地域阻断', () => {
  assert.equal(evaluateWork(idx, 'wk-01', 'ch-carnival').decision, '放行');
  assert.equal(evaluateWork(idx, 'wk-01', 'ch-promo').decision, '放行'); // 该队声明覆盖商用
  const overseas = evaluateWork(idx, 'wk-01', 'ch-overseas');
  assert.equal(overseas.decision, '阻断');
  assert.ok(overseas.blocks.some((b) => b.right === '地域'));
});

test('场景2：许可到期按基准日阻断，并指出权利项与派生链段', () => {
  const before = evaluateWork(idx, 'wk-02', 'ch-carnival', { as_of: '2026-06-01' });
  assert.equal(before.decision, '放行', '到期前应放行');
  const now = evaluateWork(idx, 'wk-02', 'ch-carnival');
  assert.equal(now.decision, '阻断');
  const b = now.blocks.find((x) => x.claim_id === 'cl-02-mu' && x.right === '期限');
  assert.ok(b, '必须点名到期的配乐声明');
  assert.match(b.detail, /2026-08-31/);
  assert.deepEqual(b.chain.version_segment, ['v-02-02', 'v-02-03', 'v-02-04']);
});

test('场景3：AI演员授权撤回，下游生成镜头沿派生链同步阻断', () => {
  const r = evaluateWork(idx, 'wk-03', 'ch-carnival');
  assert.equal(r.decision, '阻断');
  assert.ok(r.blocks.some((b) => b.right === '撤回' && b.asset_id === 'as-03-aip'));
  const propagated = r.blocks.find((b) => b.right === '派生传导' && b.asset_id === 'as-03-gs');
  assert.ok(propagated, '撤回必须传导到使用该AI演员的生成镜头');
  assert.equal(propagated.upstream_asset_id, 'as-03-aip');
  // 撤回生效前仍可展映
  assert.equal(evaluateWork(idx, 'wk-03', 'ch-carnival', { as_of: '2026-06-15' }).decision, '放行');
});

test('场景4：受限档案素材混入公开发布版时阻断在「受限」权利项', () => {
  const r = evaluateWork(idx, 'wk-04', 'ch-carnival');
  const b = r.blocks.find((x) => x.asset_id === 'as-04-lf2');
  assert.ok(b);
  assert.equal(b.right, '受限');
  assert.deepEqual(b.chain.version_segment, ['v-04-04']);
  // 课堂渠道内使用受限档案不阻断
  assert.equal(evaluateWork(idx, 'wk-04', 'ch-class').decision, '放行');
});

test('场景5：换名重复上传被识别，未挂声明的副本阻断发布', () => {
  const dupes = findDuplicateUploads(idx);
  const d = dupes.find((x) => x.asset_ids.includes('as-05-dup'));
  assert.ok(d, '相同内容指纹应聚合为重复上传');
  assert.ok(d.assets_without_claim.includes('as-05-dup'));
  const r = evaluateWork(idx, 'wk-05', 'ch-carnival');
  assert.equal(r.decision, '阻断');
  assert.ok(r.blocks.some((b) => b.right === '许可挂接完整性' && b.asset_id === 'as-05-dup'));
});

test('场景6：并行修订分支合并后，分支配乐许可不足阻断在合并点', () => {
  const p = findParallelRevisions(idx).find((x) => x.work_id === 'wk-06');
  assert.equal(p.branch_version, 'v-06-03b');
  assert.equal(p.merged_into, 'v-06-04');
  const lineage = versionLineage(idx, 'v-06-04').map((v) => v.id);
  assert.ok(lineage.includes('v-06-03b'), '发布版必须能追溯到并行分支');
  const r = evaluateWork(idx, 'wk-06', 'ch-carnival');
  const b = r.blocks.find((x) => x.asset_id === 'as-06-mu2' && x.right === '用途');
  assert.ok(b, '分支配乐只有课堂用途，必须在非商业展映渠道按「用途」阻断');
  assert.ok(b.chain.version_segment.includes('v-06-03b'), '链段须指出素材来自并行分支');
  assert.ok(b.chain.version_segment.includes('v-06-04'), '链段须指出阻断发生在合并发布版');
});

test('场景7：成员退出不抹掉贡献，本人授权的配音在就业对接仍可用', () => {
  const st = idx.students.get('st-020');
  assert.equal(st.status, '已退出');
  const team = idx.teams.get('tm-07');
  const member = team.members.find((m) => m.student_id === 'st-020');
  assert.ok(member.left_on);
  assert.match(member.contribution, /as-07-vc/);
  const trace = traceContributor(idx, 'st-020');
  assert.ok(trace.claims.some((c) => c.asset_id === 'as-07-vc' && c.status === '有效'));
  assert.ok(trace.performed_assets.some((a) => a.id === 'as-07-vc'));
  assert.equal(evaluateWork(idx, 'wk-07', 'ch-job').decision, '放行');
  // 商业推广超出本人非商业授权，仍需再确认
  const promo = evaluateWork(idx, 'wk-07', 'ch-promo');
  assert.equal(promo.decision, '阻断');
  assert.ok(promo.blocks.some((b) => b.claim_id === 'cl-07-vc'));
});

test('场景8：获奖不把课堂许可自动扩展为商业推广', () => {
  assert.ok(idx.awardsByWork.has('wk-08'));
  assert.equal(evaluateWork(idx, 'wk-08', 'ch-carnival').decision, '放行', '非商业展映本来就在课堂许可内');
  const promo = evaluateWork(idx, 'wk-08', 'ch-promo');
  assert.equal(promo.decision, '阻断');
  assert.ok(promo.blocks.some((b) => b.scope === '获奖范围' && /不自动/.test(b.detail)));
  assert.ok(promo.blocks.some((b) => b.right === '用途'));
});

test('场景9：盲评期间泄露院校/作者身份必须在送评前阻断', () => {
  const gate = blindReviewGate(idx, 'wk-09');
  assert.equal(gate.decision, '阻断');
  assert.deepEqual(new Set(gate.blocks.map((b) => b.leak_kind)), new Set(['院校标识', '元数据残留']));
  // 普通作品盲评零泄露
  assert.equal(blindReviewGate(idx, 'wk-01').decision, '放行');
  // 要求匿名的影展渠道同样拦截；普通嘉年华不做匿名要求
  assert.equal(evaluateWork(idx, 'wk-09', 'ch-festival').decision, '阻断');
  assert.equal(evaluateWork(idx, 'wk-09', 'ch-carnival').decision, '放行');
});

test('场景10：许可被收窄续约取代、主体存疑素材均阻断', () => {
  const r = evaluateWork(idx, 'wk-10', 'ch-carnival');
  assert.equal(r.decision, '阻断');
  assert.ok(r.blocks.some((b) => b.asset_id === 'as-10-mu' && (b.right === '取代' || b.right === '用途')));
  const td2 = r.blocks.find((b) => b.asset_id === 'as-10-td2');
  assert.ok(td2);
  assert.equal(td2.right, '主体');
});

test('嘉年华批量闸门：33 部作品逐部下结论，阻断项均可定位', () => {
  const batch = evaluateBatch(idx, allWorkIds, 'ch-carnival');
  assert.equal(batch.total, 33);
  assert.equal(batch.blocked, 6);
  assert.equal(batch.approved, 27);
  for (const r of batch.results.filter((x) => x.decision === '阻断')) {
    for (const b of r.blocks) {
      assert.ok(b.right, '阻断必须指明权利项');
      assert.ok(b.chain && (b.chain.version_segment || b.chain.asset_lineage), '阻断必须指明派生链段');
    }
  }
});

test('就业对接批量闸门：退出成员作品与常规作品均可通过', () => {
  const batch = evaluateBatch(idx, allWorkIds, 'ch-job');
  const wk07 = batch.results.find((r) => r.work_id === 'wk-07');
  assert.equal(wk07.decision, '放行');
  assert.ok(['wk-02', 'wk-03', 'wk-04', 'wk-05', 'wk-06', 'wk-10'].every(
    (id) => batch.results.find((r) => r.work_id === id).decision === '阻断'));
});
