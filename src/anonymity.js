// 盲评匿名核查：盲评阶段与要求匿名的渠道，不得出现院校、作者身份信息。

// 检查某作品盲评提交版本记录的身份泄露项；只保留泄露素材仍在待发布版本链上的项。
export function checkBlindSubmission(idx, workId, releaseAssetIds = null) {
  const sub = idx.blindByWork.get(workId);
  if (!sub) return { submission: null, leaks: [] };
  let leaks = sub.identity_leaks;
  if (releaseAssetIds) leaks = leaks.filter((l) => releaseAssetIds.has(l.asset_id));
  return { submission: sub, leaks };
}

// 盲评阶段送评前的独立检查：提交版本必须存在泄露登记的"零记录"。
export function blindReviewGate(idx, workId) {
  const { submission, leaks } = checkBlindSubmission(idx, workId);
  if (!submission) return { decision: '无法核查', blocks: [{ right: '盲评登记', detail: `作品 ${workId} 缺少盲评提交记录` }] };
  const blocks = leaks.map((l) => ({
    right: '盲评匿名',
    asset_id: l.asset_id,
    leak_kind: l.leak_kind,
    detail: `盲评提交 ${submission.id}（版本 ${submission.version_id}）存在${l.leak_kind}：${l.detail}`,
    version_id: submission.version_id
  }));
  return { decision: blocks.length ? '阻断' : '放行', blocks };
}
