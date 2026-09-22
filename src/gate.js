// 发布闸门：作品送入某渠道前的唯一入口。
// 逐层追溯发布版本的派生链，对每项素材核对五要素，再叠加受限、撤回、
// 重复上传、并行修订、盲评匿名、获奖范围规则。任何阻断都标注：
//   right  —— 卡在哪一项权利（主体/用途/地域/期限/撤回/受限/缺失/盲评匿名/…）
//   chain  —— 卡在哪一段派生链（版本链段 + 素材级来源链）

import { traceRelease } from './provenance.js';
import { evaluateAsset } from './rights.js';
import { ingestIssuesForRelease } from './ingest.js';
import { checkBlindSubmission } from './anonymity.js';

export function evaluateWork(idx, workId, channelId, options = {}) {
  const channel = idx.channels.get(channelId);
  if (!channel) throw new Error(`未知渠道：${channelId}`);
  const asOf = options.as_of ?? idx.asOf;
  const trace = traceRelease(idx, workId, options.release_id ?? null);
  const releaseAssetIds = new Set(trace.items.map((i) => i.asset.id));

  const blocks = [];

  // —— 逐素材：五要素 + 受限 + 撤回（先各自评估，再沿素材级派生链向上传导）——
  const ownBlocksByAsset = new Map();
  for (const item of trace.items) {
    ownBlocksByAsset.set(item.asset.id, evaluateAsset(idx, item.asset, channel, asOf));
  }
  const itemByAsset = new Map(trace.items.map((i) => [i.asset.id, i]));

  for (const item of trace.items) {
    for (const b of ownBlocksByAsset.get(item.asset.id) ?? []) {
      blocks.push({
        scope: '素材权利',
        right: b.right,
        asset_id: item.asset.id,
        asset_title: item.asset.title,
        claim_id: b.claim_id ?? null,
        detail: b.detail,
        chain: {
          introduced_in: item.introduced_in.id,
          version_segment: item.version_chain_segment,
          asset_lineage: item.asset_ancestry,
          reached_via_asset: item.reached_via_asset ?? null
        }
      });
    }
    // 派生传导：上游来源失效（撤回/受限/期限/主体…）时，下游素材同步不可用。
    for (const upId of item.asset_ancestry.filter((x) => x !== item.asset.id)) {
      const upBlocks = ownBlocksByAsset.get(upId) ?? [];
      if (upBlocks.length === 0) continue;
      const upItem = itemByAsset.get(upId);
      blocks.push({
        scope: '素材权利',
        right: '派生传导',
        asset_id: item.asset.id,
        asset_title: item.asset.title,
        upstream_asset_id: upId,
        detail: `上游素材 ${upId} 存在${[...new Set(upBlocks.map((x) => x.right))].join('、')}阻断，其派生内容 ${item.asset.id} 在本渠道同步不可用`,
        chain: {
          introduced_in: item.introduced_in.id,
          version_segment: item.version_chain_segment,
          asset_lineage: item.asset_ancestry,
          upstream_introduced_in: upItem?.introduced_in.id ?? null,
          upstream_version_segment: upItem?.version_chain_segment ?? null
        }
      });
    }
  }

  // —— 入库环节：重复上传、未授权副本、并行修订分支 ——
  for (const issue of ingestIssuesForRelease(idx, trace)) {
    if (issue.kind === '重复上传') {
      const orphan = issue.assets_without_claim;
      if (orphan.length > 0) {
        blocks.push({
          scope: '入库核查',
          right: issue.right,
          asset_id: orphan[0],
          detail: `${issue.detail}；副本 ${orphan.join('、')} 未挂接任何许可声明，原素材的授权不会自动覆盖重传副本`,
          chain: { version_segment: [trace.release.id], asset_lineage: issue.asset_ids }
        });
      }
    } else if (issue.kind === '并行修订') {
      const unlicensed = issue.assets_without_claim;
      if (unlicensed.length > 0) {
        blocks.push({
          scope: '入库核查',
          right: issue.right,
          asset_id: unlicensed[0],
          detail: `${issue.detail}；分支素材 ${unlicensed.join('、')} 缺少许可声明`,
          chain: { branch_version: issue.branch_version, merged_into: issue.merged_into, asset_lineage: issue.asset_ids }
        });
      }
    }
  }

  // —— 渠道要求匿名（影展评选期等）：盲评泄露延伸到发布链 ——
  if (channel.requires_anonymity) {
    const { leaks } = checkBlindSubmission(idx, workId, releaseAssetIds);
    for (const l of leaks) {
      blocks.push({
        scope: '渠道规则',
        right: '盲评匿名',
        asset_id: l.asset_id,
        leak_kind: l.leak_kind,
        detail: `渠道「${channel.name}」要求匿名，发布链仍含${l.leak_kind}：${l.detail}`,
        chain: { version_segment: trace.lineage.map((v) => v.id) }
      });
    }
  }

  // —— 获奖不扩权：商业渠道必须靠声明本身覆盖，荣誉记录不构成授权 ——
  const award = idx.awardsByWork.get(workId);
  if (award && channel.commercial) {
    const commercialGaps = blocks.some((b) => b.scope === '素材权利' && (b.right === '用途' || b.right === '期限'));
    if (commercialGaps) {
      blocks.push({
        scope: '获奖范围',
        right: '用途',
        detail: `作品凭 ${award.name}（${award.won_on}）获得展映荣誉，但 ${award.license_scope_note}`,
        chain: { version_segment: [trace.release.id] }
      });
    }
  }

  return {
    work_id: workId,
    work_title: trace.work.title,
    channel_id: channelId,
    channel_name: channel.name,
    as_of: asOf,
    release_id: trace.release.id,
    decision: blocks.length === 0 ? '放行' : '阻断',
    block_count: blocks.length,
    blocks,
    traced_asset_count: trace.items.length,
    lineage: trace.lineage.map((v) => ({ id: v.id, label: v.label, branch: v.branch }))
  };
}

// 批量闸门：嘉年华/就业对接前对全部作品或一个作品集合执行。
export function evaluateBatch(idx, workIds, channelId, options = {}) {
  const results = workIds.map((id) => evaluateWork(idx, id, channelId, options));
  return {
    channel_id: channelId,
    as_of: options.as_of ?? idx.asOf,
    total: results.length,
    approved: results.filter((r) => r.decision === '放行').length,
    blocked: results.filter((r) => r.decision === '阻断').length,
    results
  };
}
