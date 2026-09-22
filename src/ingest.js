// 上传核查：识别重复上传与并行修订，避免同一内容多份入库后只有一份挂了许可。

// 按内容指纹聚合上传记录。fingerprint 相同、asset_id 不同 => 换名重复上传。
export function findDuplicateUploads(idx) {
  const byFp = new Map();
  for (const u of idx.uploads) {
    if (!byFp.has(u.fingerprint)) byFp.set(u.fingerprint, []);
    byFp.get(u.fingerprint).push(u);
  }
  const dupes = [];
  for (const [fingerprint, rows] of byFp) {
    const assetIds = new Set(rows.map((u) => u.asset_id));
    if (assetIds.size > 1) {
      dupes.push({
        fingerprint,
        uploads: rows,
        asset_ids: [...assetIds],
        assets_without_claim: [...assetIds].filter((aid) => (idx.claimsByAsset.get(aid) ?? []).length === 0)
      });
    }
  }
  return dupes;
}

// 并行修订：同一作品内出现 seq 相同的非主干分支版本，最终被某个多父版本合并。
export function findParallelRevisions(idx) {
  const out = [];
  for (const [workId, vs] of idx.versionsByWork) {
    const branched = vs.filter((v) => v.branch);
    if (branched.length === 0) continue;
    const merges = vs.filter((v) => v.parents.length > 1);
    for (const b of branched) {
      const merge = merges.find((m) => {
        const walk = new Set();
        const stack = [...m.parents];
        while (stack.length) {
          const id = stack.pop();
          if (walk.has(id)) continue;
          walk.add(id);
          const v = idx.versions.get(id);
          stack.push(...v.parents);
        }
        return walk.has(b.id);
      });
      out.push({
        work_id: workId,
        branch_version: b.id,
        branch: b.branch,
        merged_into: merge?.id ?? null,
        branch_assets: b.asset_ids,
        assets_without_claim: b.asset_ids.filter((aid) => (idx.claimsByAsset.get(aid) ?? []).length === 0)
      });
    }
  }
  return out;
}

// 针对单个发布版本：它的素材集合里是否存在重复内容或未授权的并行分支素材。
export function ingestIssuesForRelease(idx, trace) {
  const issues = [];
  const dupes = findDuplicateUploads(idx);
  const releaseAssetIds = new Set(trace.items.map((i) => i.asset.id));
  for (const d of dupes) {
    if (d.asset_ids.some((aid) => releaseAssetIds.has(aid))) {
      issues.push({
        kind: '重复上传',
        right: '许可挂接完整性',
        detail: `内容指纹 ${d.fingerprint.slice(0, 12)}… 对应 ${d.asset_ids.length} 个素材条目（${d.asset_ids.join('、')}），存在换名重传`,
        asset_ids: d.asset_ids,
        assets_without_claim: d.assets_without_claim
      });
    }
  }
  const parallels = findParallelRevisions(idx).filter((p) => p.work_id === trace.work.id);
  for (const p of parallels) {
    if (p.merged_into && trace.lineage.some((v) => v.id === p.merged_into)) {
      issues.push({
        kind: '并行修订',
        right: '分支许可',
        detail: `分支版本 ${p.branch_version}（${p.branch}）已并入 ${p.merged_into}，分支素材 ${p.branch_assets.join('、')} 的许可须随合并点一并核对`,
        asset_ids: p.branch_assets,
        assets_without_claim: p.assets_without_claim,
        branch_version: p.branch_version,
        merged_into: p.merged_into
      });
    }
  }
  return issues;
}
