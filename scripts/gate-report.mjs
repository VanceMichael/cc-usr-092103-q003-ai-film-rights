#!/usr/bin/env node
// 发布前运营报告：逐渠道给出放行/阻断清单，每个阻断定位到权利项与派生链段。
// 用法：
//   node scripts/gate-report.mjs                 # 评估全部渠道
//   node scripts/gate-report.mjs ch-carnival     # 只评估嘉年华
//   node scripts/gate-report.mjs ch-job wk-07    # 评估单部作品
import { readFile } from 'node:fs/promises';
import { parseProgram, parseRegistry, validateProgram, validateRegistry, buildIndexes } from '../src/load.js';
import { evaluateWork, evaluateBatch } from '../src/gate.js';
import { blindReviewGate } from '../src/anonymity.js';

const root = new URL('..', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const program = validateProgram(parseProgram(await read('fixtures/program.json')));
const registry = validateRegistry(parseRegistry(await read('fixtures/registry.json')), program);
const idx = buildIndexes(program, registry);

const [channelArg, workArg] = process.argv.slice(2);
const channels = channelArg ? [idx.channels.get(channelArg)] : [...idx.channels.values()];
if (channels.some((c) => !c)) { console.error('未知渠道'); process.exit(2); }

for (const channel of channels) {
  if (workArg) {
    const r = evaluateWork(idx, workArg, channel.id);
    printOne(r);
  } else {
    const workIds = [...idx.works.keys()];
    const batch = evaluateBatch(idx, workIds, channel.id);
    console.log(`\n=== ${channel.name}（${channel.id}） 基准日 ${batch.as_of} ===`);
    console.log(`共 ${batch.total} 部：放行 ${batch.approved}，阻断 ${batch.blocked}`);
    for (const r of batch.results.filter((x) => x.decision === '阻断')) printOne(r, true);
  }
}

// 盲评阶段单独出一份匿名核查报告（与渠道无关，送评前执行）
if (!channelArg) {
  console.log('\n=== 盲评匿名核查（sg-blind）===');
  for (const workId of idx.works.keys()) {
    const g = blindReviewGate(idx, workId);
    if (g.decision === '阻断') {
      console.log(`阻断 ${workId}`);
      for (const b of g.blocks) console.log(`  · [${b.right}/${b.leak_kind}] ${b.detail}`);
    }
  }
}

function printOne(r, compact = false) {
  console.log(`\n${r.decision} ${r.work_id}《${r.work_title}》→ ${r.channel_name}（追溯素材 ${r.traced_asset_count} 项，阻断 ${r.block_count} 项）`);
  if (compact) console.log(`  发布版本 ${r.release_id}`);
  for (const b of r.blocks) {
    const seg = b.chain?.version_segment ? b.chain.version_segment.join(' → ') : (b.chain?.asset_lineage ?? []).join(' → ');
    const where = b.asset_id ? `素材 ${b.asset_id}` : '作品级';
    console.log(`  · [${b.scope}/${b.right}] ${where}`);
    console.log(`      ${b.detail}`);
    console.log(`      派生链段：${seg}`);
    if (b.claim_id) console.log(`      许可声明：${b.claim_id}`);
    if (b.upstream_asset_id) console.log(`      失效上游：${b.upstream_asset_id}`);
  }
}
