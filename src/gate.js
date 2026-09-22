// 发布闸门：把作品某个派生版本送入渠道前，沿派生链逐层核验全部素材权利。
// 每一项阻断都明确指出：哪一项权利（right）、哪份素材/许可、
// 以及它从哪一段派生链进入（entered_at + chain_path），
// 让运营人员在公开展示之前就能定位授权缺口。
import { chainTo } from './works.js';

export const RIGHT_LABELS = {
  stage: '课程阶段',
  missing_declaration: '缺少声明',
  undeclared_asset: '未声明素材',
  unknown_asset: '未知素材',
  missing_license: '缺少许可',
  revocation: '撤回条件',
  term: '许可期限',
  purpose: '许可用途',
  territory: '许可地域',
  restriction: '受限素材',
  duplicate_upload: '重复上传',
  parallel_revision: '并行修订'
};

export const PURPOSE_LABELS = {
  classroom: '课堂',
  festival: '展映',
  job_matching: '就业对接',
  commercial: '商业推广'
};

export const STAGE_LABELS = {
  training: '培训',
  city_brief: '城市命题',
  blind_review: '盲评',
  screening: '展映',
  incubation: '孵化'
};

// 地域包含关系：campus ⊂ CN ⊂ global
const TERRITORY_IMPLIES = {
  campus: ['CN', 'global'],
  CN: ['global']
};

function territoryCovered(licenseTerritories, channelTerritory) {
  if (licenseTerritories.includes(channelTerritory)) return true;
  return (TERRITORY_IMPLIES[channelTerritory] ?? []).some((t) => licenseTerritories.includes(t));
}

function pathTo(chain, versionId) {
  const ids = [];
  for (const v of chain) {
    ids.push(v.id);
    if (v.id === versionId) break;
  }
  return ids;
}

function withLocation(chain, versionId, extra) {
  return { entered_at: versionId, chain_path: pathTo(chain, versionId), ...extra };
}

/**
 * 核验 release：evaluateRelease(ctx, workId, versionId, channelId, date)
 * ctx = { roster, licenses, assets, works, channels }（见 backend.js）
 * 返回 { allowed, chain, blocks, warnings, notes, clearances, summary }
 */
export function evaluateRelease(ctx, workId, versionId, channelId, date) {
  const releaseDate = date ?? new Date().toISOString().slice(0, 10);
  const work = ctx.works.works.get(workId);
  if (!work) throw new Error(`作品不存在: ${workId}`);
  const channel = ctx.channels.get(channelId);
  if (!channel) throw new Error(`渠道不存在: ${channelId}`);
  const chain = chainTo(ctx.works.versions, versionId);
  const candidate = chain[chain.length - 1];
  if (candidate.work_id !== workId) {
    throw new Error(`版本 ${versionId} 不属于作品 ${workId}`);
  }

  const blocks = [];
  const warnings = [];
  const notes = [];
  const clearances = [];
  const block = (right, detail, extra = {}) => {
    blocks.push({ right, right_label: RIGHT_LABELS[right], detail, ...extra });
  };

  // 1. 课程阶段：作品当前阶段必须被渠道接受（盲评中的作品不能进展映渠道等）
  if (!channel.allowed_stages.includes(work.stage)) {
    block('stage',
      `作品当前阶段「${STAGE_LABELS[work.stage]}」不在渠道「${channel.name}」允许的阶段内`,
      { entered_at: null, chain_path: null });
  }

  // 2. 逐层收集派生链上的素材使用，并核对每个版本的声明
  const uses = [];
  for (const v of chain) {
    const decl = ctx.works.declarations.get(v.id);
    if (!decl) {
      block('missing_declaration',
        `版本 ${v.id} 缺少素材使用声明，无法确认权利来源`,
        withLocation(chain, v.id));
    }
    for (const u of v.asset_uses) {
      uses.push({ use: u, version: v });
      if (decl && !decl.asset_ids.includes(u.asset_id)) {
        block('undeclared_asset',
          `素材 ${u.asset_id} 未出现在版本 ${v.id} 的声明 ${decl.id} 中`,
          withLocation(chain, v.id, { asset_id: u.asset_id }));
      }
    }
  }

  // 3. 逐项核验素材许可：主体、撤回、期限、用途、地域、受限标记
  for (const { use, version } of uses) {
    const asset = ctx.assets.get(use.asset_id);
    if (!asset) {
      block('unknown_asset',
        `版本 ${version.id} 使用了未登记的素材 ${use.asset_id}`,
        withLocation(chain, version.id, { asset_id: use.asset_id }));
      continue;
    }
    const lic = ctx.licenses.get(asset.license_id);
    const base = withLocation(chain, version.id, {
      asset_id: asset.id,
      asset_kind: asset.kind,
      license_id: asset.license_id
    });
    if (!lic) {
      block('missing_license', `素材 ${asset.id} 没有关联许可`, base);
      continue;
    }
    base.licensor = lic.licensor.name;
    if (lic.revocation.status === 'revoked') {
      block('revocation',
        `许可主体 ${lic.licensor.name} 已于 ${lic.revocation.revoked_at} 撤回许可：${lic.revocation.reason}`,
        base);
    }
    if (releaseDate < lic.term.start || releaseDate > lic.term.end) {
      block('term',
        `许可 ${lic.id}（${lic.licensor.name}）期限 ${lic.term.start}~${lic.term.end} 不覆盖发布日 ${releaseDate}`,
        base);
    }
    if (!lic.purposes.includes(channel.purpose)) {
      block('purpose',
        `许可 ${lic.id} 用途 [${lic.purposes.map((p) => PURPOSE_LABELS[p]).join('、')}] 不含渠道用途「${PURPOSE_LABELS[channel.purpose]}」`,
        base);
    }
    for (const t of channel.territories) {
      if (!territoryCovered(lic.territories, t)) {
        block('territory',
          `许可 ${lic.id} 地域 [${lic.territories.join('、')}] 不覆盖渠道地域「${t}」`,
          base);
      }
    }
    if (asset.restricted
        && (version.visibility === 'public' || candidate.visibility === 'public' || channel.audience === 'public')) {
      block('restriction',
        `受限素材 ${asset.id}（${asset.restriction_note}）混入公开版本或公开渠道`,
        base);
    }
    clearances.push(base);
  }

  // 4. 重复上传：同一内容指纹以多个素材编号进入同一条派生链
  const byHash = new Map();
  for (const { use, version } of uses) {
    const asset = ctx.assets.get(use.asset_id);
    if (!asset) continue;
    if (!byHash.has(asset.hash)) byHash.set(asset.hash, []);
    byHash.get(asset.hash).push({ asset, version });
  }
  for (const [hash, entries] of byHash) {
    const distinct = new Set(entries.map((e) => e.asset.id));
    if (distinct.size < 2) continue;
    const locations = entries.map((e) => withLocation(chain, e.version.id, { asset_id: e.asset.id }));
    block('duplicate_upload',
      `同一内容（${hash}）被重复上传为 ${entries.map((e) => `${e.asset.id}（进入于 ${e.version.id}）`).join(' 与 ')}`,
      { hash, assets: locations, entered_at: locations[0].entered_at, chain_path: locations[0].chain_path });
  }

  // 5. 并行修订：派生链上的版本存在链外分支；分支晚于候选版本则阻断
  const onChain = new Set(chain.map((v) => v.id));
  for (const v of chain) {
    for (const child of ctx.works.versions.values()) {
      if (child.parent_id !== v.id || onChain.has(child.id)) continue;
      const location = withLocation(chain, v.id, { fork: v.id, branch: child.id });
      if (child.created_at > candidate.created_at) {
        block('parallel_revision',
          `版本 ${v.id} 存在并行分支 ${child.id}（${child.created_at}，晚于候选版本 ${candidate.created_at}），派生链未合并`,
          location);
      } else {
        warnings.push({
          right: 'parallel_revision',
          right_label: RIGHT_LABELS.parallel_revision,
          detail: `版本 ${v.id} 存在较早的并行分支 ${child.id}，发布前请确认无需合并`,
          ...location
        });
      }
    }
  }

  // 6. 获奖只是事实记录，绝不扩展许可范围
  if (work.award && blocks.some((b) => b.right === 'purpose')) {
    notes.push(`作品曾获「${work.award.name}」（${work.award.granted_at}），但获奖不会把既有许可自动扩展为「${PURPOSE_LABELS[channel.purpose]}」用途`);
  }

  const summary = blocks.length === 0
    ? `作品 ${workId} 版本 ${versionId} 面向渠道「${channel.name}」的 ${clearances.length} 项素材权利核验全部通过`
    : `作品 ${workId} 版本 ${versionId} 面向渠道「${channel.name}」存在 ${blocks.length} 项阻断：`
      + blocks.map((b) => `${b.right_label}${b.asset_id ? `(${b.asset_id})` : ''}`).join('、');

  return {
    allowed: blocks.length === 0,
    work_id: workId,
    version_id: versionId,
    channel_id: channelId,
    date: releaseDate,
    chain: chain.map((v) => v.id),
    blocks,
    warnings,
    notes,
    clearances,
    summary
  };
}
