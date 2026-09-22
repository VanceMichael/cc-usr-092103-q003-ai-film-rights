// 权利评估：对素材逐项核对许可声明五要素——主体、用途、地域、期限、撤回条件，
// 并沿素材派生链向上传导（上游素材授权失效，下游生成内容同样不可用）。

// 截至评估基准日仍然有效、且未被撤回/取代的声明。
export function effectiveClaims(idx, assetId, asOf = idx.asOf) {
  const list = idx.claimsByAsset.get(assetId) ?? [];
  return list.filter((c) => {
    if (c.status !== '有效') return false;
    const rv = [...idx.revocations.values()].find((x) => x.claim_id === c.id);
    if (rv && rv.effective_on <= asOf) return false;
    return true;
  });
}

function claimCovers(claim, channel, asOf) {
  const gaps = [];
  const purposeOk = channel.purposes.every((p) => claim.purposes.includes(p));
  if (!purposeOk) gaps.push('用途');
  const regionOk = channel.regions.every((r) => claim.regions.includes(r) || claim.regions.includes('WORLD'));
  if (!regionOk) gaps.push('地域');
  if (asOf < claim.term_start || asOf > claim.term_end) gaps.push('期限');
  return gaps;
}

// 评估单个素材在指定渠道的权利状态。返回 blocks（必须阻断）与 notes。
export function evaluateAsset(idx, asset, channel, asOf = idx.asOf) {
  const blocks = [];
  const push = (right, detail, extra = {}) =>
    blocks.push({ right, asset_id: asset.id, asset_title: asset.title, detail, ...extra });

  // 1. 受限素材：仅课堂教学渠道可用，禁止混入任何公开发布版本。
  //    受限本身即充分阻断，不再叠加用途等次要缺口，避免同一素材重复报警。
  if (asset.restricted && !channel.purposes.every((p) => p === '课堂教学')) {
    push('受限', asset.restriction_note ?? '素材标注为受限，不得公开');
    return blocks;
  }

  // 2. 主体可确认性：来源提供者不明、无任何权利依据时，许可主体无法确认。
  if (asset.source.kind === 'dataset' && (asset.source.provider === '未提供' || !asset.source.provider)) {
    push('主体', '训练素材来源提供者缺失，无法确认许可主体与授权链条', { basis_proof: 'missing' });
  }

  const all = idx.claimsByAsset.get(asset.id) ?? [];
  const live = effectiveClaims(idx, asset.id, asOf);

  if (all.length === 0) {
    push('缺失', '素材没有任何许可声明');
    return blocks;
  }

  // 3. 撤回 / 取代状态明示。
  const withdrawn = all.filter((c) => {
    const rv = [...idx.revocations.values()].find((x) => x.claim_id === c.id);
    return rv && rv.effective_on <= asOf;
  });
  for (const c of withdrawn) {
    const rv = [...idx.revocations.values()].find((x) => x.claim_id === c.id);
    push('撤回', `许可声明 ${c.id} 已按撤回条件于 ${rv.effective_on} 生效：${rv.reason}`, { claim_id: c.id });
  }
  // 4. 五要素核对：任一有效声明完整覆盖渠道即视为授权充分。
  const coverReports = live.map((c) => ({ claim: c, gaps: claimCovers(c, channel, asOf) }));
  const covered = coverReports.some((r) => r.gaps.length === 0);
  if (!covered && live.length === 0 && withdrawn.length === 0 && !all.some((c) => c.status === '已被取代')) {
    push('缺失', '不存在有效许可声明');
  }
  // 旧声明被取代：仅当新声明无法覆盖本渠道时才作为阻断（避免沿用过期范围）。
  if (!covered) {
    for (const c of all.filter((c) => c.status === '已被取代')) {
      push('取代', `旧声明 ${c.id} 已被 ${c.superseded_by} 取代，旧授权范围不再适用；需按新声明范围使用`, { claim_id: c.id });
    }
    for (const r of coverReports) {
      if (r.gaps.length === 0) continue;
      const why = r.gaps.join('、');
      const detail =
        r.gaps.includes('期限')
          ? `声明 ${r.claim.id} 授权期限 ${r.claim.term_start} 至 ${r.claim.term_end}，基准日 ${asOf} 已到期或未生效`
          : `声明 ${r.claim.id}（主体：${r.claim.licensor.kind}/${r.claim.licensor.name}）不覆盖本渠道所需的${why}`;
      push(why, detail, { claim_id: r.claim.id, missing_elements: r.gaps });
    }
  }
  return blocks;
}
