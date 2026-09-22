// 派生链追溯：把"发布版本 → 全部祖先版本 → 版本内素材 → 素材级派生来源"线性化，
// 每一个素材都能定位它是经由哪段版本链进入作品的。

// 返回从初始版本到目标版本的全部祖先版本（含目标），多父合并时按拓扑顺序展开。
export function versionLineage(idx, versionId) {
  const out = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const v = idx.versions.get(id);
    if (!v) return;
    for (const p of [...v.parents].sort()) walk(p);
    out.push(v);
  };
  walk(versionId);
  return out;
}

// 返回某素材在素材级派生图上的全部上游（含自身），从最底层来源到该素材。
export function assetAncestry(idx, assetId) {
  const out = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const a = idx.assets.get(id);
    if (!a) return;
    for (const d of a.derived_from_asset_ids ?? []) walk(d);
    out.push(a);
  };
  walk(assetId);
  return out;
}

// 描述从根版本到目标版本的链段，例如 v-02-01 → v-02-02 → v-02-03 → v-02-04。
export function chainPath(idx, versionId) {
  return versionLineage(idx, versionId).map((v) => v.id);
}

// 追溯发布版本中的全部素材：
// 每项给出素材、它最早进入作品的版本、引入点到发布版的版本链段、素材级上游来源。
export function traceRelease(idx, workId, releaseId = null) {
  const work = idx.works.get(workId);
  const targetId = releaseId ?? work.current_release_id;
  const lineage = versionLineage(idx, targetId);
  const lineageIds = lineage.map((v) => v.id);

  // 计算每个版本到发布版的后缀链段
  const suffixFrom = (vid) => lineageIds.slice(lineageIds.indexOf(vid));

  const findings = new Map();
  for (const v of lineage) {
    for (const aid of v.asset_ids) {
      if (!findings.has(aid)) {
        findings.set(aid, {
          asset: idx.assets.get(aid),
          introduced_in: v,
          version_chain_segment: suffixFrom(v.id),
          asset_ancestry: assetAncestry(idx, aid).map((a) => a.id)
        });
      }
    }
    // 素材级派生来源也要登记（即使上游素材没被任何版本直接引用）
    for (const aid of v.asset_ids) {
      for (const up of assetAncestry(idx, aid)) {
        if (!findings.has(up.id)) {
          findings.set(up.id, {
            asset: up,
            introduced_in: v,
            version_chain_segment: suffixFrom(v.id),
            asset_ancestry: assetAncestry(idx, up.id).map((a) => a.id),
            reached_via_asset: aid
          });
        }
      }
    }
  }
  return { work, release: idx.versions.get(targetId), lineage, items: [...findings.values()] };
}

// 贡献追溯：成员（含退出者）在派生链上的全部痕迹（创作版本、上传、实拍/配音、许可声明）。
export function traceContributor(idx, studentId) {
  const versions = [...idx.versions.values()].filter((v) => v.created_by === studentId);
  const uploads = idx.uploads.filter((u) => u.uploaded_by === studentId);
  const performedAssets = [...idx.assets.values()].filter(
    (a) => a.source.shot_by === studentId || a.source.performed_by === studentId
  );
  const claims = [...idx.claims.values()].filter((c) => c.licensor.student_id === studentId);
  return { student_id: studentId, versions, uploads, performed_assets: performedAssets, claims };
}
