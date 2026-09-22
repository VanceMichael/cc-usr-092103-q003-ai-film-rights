import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBackend } from '../src/backend.js';

const backend = await loadBackend(fileURLToPath(new URL('../fixtures/', import.meta.url)));
const DATE = '2026-09-22';

test('权利链完整的作品可通过嘉年华展映与就业对接', () => {
  for (const channel of ['ch-carnival', 'ch-job']) {
    const r = backend.evaluateRelease('work-lantern', 'ver-l3', channel, DATE);
    assert.equal(r.allowed, true, r.summary);
    assert.deepEqual(r.chain, ['ver-l1', 'ver-l2', 'ver-l3']);
    // 训练素材、实拍、AI演员、音乐四层素材全部留下核验轨迹
    assert.equal(r.clearances.length, 4);
    assert.deepEqual(
      r.clearances.map((c) => c.asset_kind).sort(),
      ['ai_actor', 'live_footage', 'music', 'training_data']
    );
  }
});

test('许可到期：阻断指出期限权利与派生链位置', () => {
  const r = backend.evaluateRelease('work-neon', 'ver-n2', 'ch-carnival', DATE);
  assert.equal(r.allowed, false);
  const b = r.blocks.find((x) => x.right === 'term');
  assert.ok(b, `应阻断在期限权利: ${r.summary}`);
  assert.equal(b.asset_id, 'asset-music-neon');
  assert.equal(b.license_id, 'lic-music-expired');
  assert.equal(b.licensor, '旧码头乐队');
  assert.equal(b.entered_at, 'ver-n2');
  assert.deepEqual(b.chain_path, ['ver-n1', 'ver-n2']);
  assert.match(b.detail, /2026-06-30/);
});

test('获奖不会把课堂许可扩展为商业推广', () => {
  const r = backend.evaluateRelease('work-river', 'ver-r2', 'ch-commercial', DATE);
  assert.equal(r.allowed, false);
  const purpose = r.blocks.filter((b) => b.right === 'purpose');
  assert.ok(purpose.some((b) => b.asset_id === 'asset-ai-actor-edu'), '教育版AI演员不得商用');
  assert.ok(r.notes.some((n) => n.includes('获奖') && n.includes('不会')));
  // 同一作品走展映渠道则放行：阻断只针对商业用途
  assert.equal(backend.evaluateRelease('work-river', 'ver-r2', 'ch-carnival', DATE).allowed, true);
  // 课堂许可在课堂渠道内依然有效
  assert.equal(backend.evaluateRelease('work-river', 'ver-r2', 'ch-classroom', DATE).allowed, true);
});

test('许可被撤回：训练素材阻断展映并定位到引入版本', () => {
  const r = backend.evaluateRelease('work-forest', 'ver-f2', 'ch-carnival', DATE);
  assert.equal(r.allowed, false);
  const b = r.blocks.find((x) => x.right === 'revocation');
  assert.ok(b, `应阻断在撤回条件: ${r.summary}`);
  assert.equal(b.asset_id, 'asset-train-forest');
  assert.equal(b.entered_at, 'ver-f1');
  assert.deepEqual(b.chain_path, ['ver-f1']);
  assert.match(b.detail, /2026-08-15/);
  assert.match(b.detail, /未授权肖像/);
});

test('地域限制：境内就业对接放行，海外渠道阻断', () => {
  assert.equal(backend.evaluateRelease('work-harbor', 'ver-h2', 'ch-job', DATE).allowed, true);
  const r = backend.evaluateRelease('work-harbor', 'ver-h2', 'ch-job-global', DATE);
  assert.equal(r.allowed, false);
  const b = r.blocks.find((x) => x.right === 'territory');
  assert.ok(b, `应阻断在地域权利: ${r.summary}`);
  assert.equal(b.asset_id, 'asset-footage-harbor');
  assert.equal(b.entered_at, 'ver-h1');
  assert.match(b.detail, /global/);
});

test('受限素材混入公开版本被阻断', () => {
  const r = backend.evaluateRelease('work-echo', 'ver-e2', 'ch-carnival', DATE);
  assert.equal(r.allowed, false);
  const b = r.blocks.find((x) => x.right === 'restriction');
  assert.ok(b, `应阻断在受限素材: ${r.summary}`);
  assert.equal(b.asset_id, 'asset-footage-alley');
  assert.equal(b.entered_at, 'ver-e1');
  assert.deepEqual(b.chain_path, ['ver-e1']);
  assert.match(b.detail, /未清场路人肖像/);
});

test('重复上传与并行修订都在发布前被指出', () => {
  const r = backend.evaluateRelease('work-mirror', 'ver-m3', 'ch-carnival', DATE);
  assert.equal(r.allowed, false);
  const dup = r.blocks.find((x) => x.right === 'duplicate_upload');
  assert.ok(dup, `应阻断在重复上传: ${r.summary}`);
  assert.deepEqual(
    dup.assets.map((a) => a.asset_id).sort(),
    ['asset-music-dup-1', 'asset-music-dup-2']
  );
  assert.deepEqual(
    dup.assets.map((a) => a.entered_at).sort(),
    ['ver-m1', 'ver-m3']
  );
  const par = r.blocks.find((x) => x.right === 'parallel_revision');
  assert.ok(par, `应阻断在并行修订: ${r.summary}`);
  assert.equal(par.fork, 'ver-m2');
  assert.equal(par.branch, 'ver-m3b');
  assert.match(par.detail, /未合并/);
});

test('未声明素材被阻断并定位到版本', () => {
  const r = backend.evaluateRelease('work-ember', 'ver-b2', 'ch-carnival', DATE);
  assert.equal(r.allowed, false);
  const b = r.blocks.find((x) => x.right === 'undeclared_asset');
  assert.ok(b, `应阻断在未声明素材: ${r.summary}`);
  assert.equal(b.asset_id, 'asset-ai-extra');
  assert.equal(b.entered_at, 'ver-b2');
  assert.match(b.detail, /decl-b2/);
});

test('盲评阶段的作品不能进入展映渠道', () => {
  const work = backend.works.works.get('work-lantern');
  const original = work.stage;
  work.stage = 'blind_review';
  try {
    const r = backend.evaluateRelease('work-lantern', 'ver-l3', 'ch-carnival', DATE);
    assert.equal(r.allowed, false);
    assert.ok(r.blocks.some((b) => b.right === 'stage'));
  } finally {
    work.stage = original;
  }
});

test('缺少声明的版本无法通过发布核验', () => {
  const decl = backend.works.declarations.get('ver-l2');
  backend.works.declarations.delete('ver-l2');
  try {
    const r = backend.evaluateRelease('work-lantern', 'ver-l3', 'ch-carnival', DATE);
    assert.equal(r.allowed, false);
    const b = r.blocks.find((x) => x.right === 'missing_declaration');
    assert.ok(b);
    assert.equal(b.entered_at, 'ver-l2');
  } finally {
    backend.works.declarations.set('ver-l2', decl);
  }
});

test('未知的作品、版本、渠道直接报错', () => {
  assert.throws(() => backend.evaluateRelease('work-none', 'ver-l3', 'ch-carnival', DATE), /作品不存在/);
  assert.throws(() => backend.evaluateRelease('work-lantern', 'ver-none', 'ch-carnival', DATE), /版本不存在/);
  assert.throws(() => backend.evaluateRelease('work-lantern', 'ver-l3', 'ch-none', DATE), /渠道不存在/);
  assert.throws(() => backend.evaluateRelease('work-neon', 'ver-l3', 'ch-carnival', DATE), /不属于作品/);
});
