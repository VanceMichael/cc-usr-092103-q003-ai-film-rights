// 素材与许可目录：加载校验，并按内容指纹检测重复上传。
export const PURPOSES = ['classroom', 'festival', 'job_matching', 'commercial'];
export const ASSET_KINDS = ['ai_actor', 'music', 'training_data', 'live_footage'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function loadLicenses(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== 'licenses' || !Array.isArray(data.licenses) || data.licenses.length === 0) {
    throw new Error('许可资料缺少 licenses');
  }
  const licenses = new Map();
  for (const lic of data.licenses) {
    if (!lic.id) throw new Error('许可缺少 id');
    if (!lic.licensor || !lic.licensor.id || !lic.licensor.name) {
      throw new Error(`许可 ${lic.id} 缺少许可主体`);
    }
    if (!Array.isArray(lic.purposes) || lic.purposes.length === 0
        || lic.purposes.some((p) => !PURPOSES.includes(p))) {
      throw new Error(`许可 ${lic.id} 的用途非法`);
    }
    if (!Array.isArray(lic.territories) || lic.territories.length === 0) {
      throw new Error(`许可 ${lic.id} 缺少地域`);
    }
    if (!lic.term || !DATE_RE.test(lic.term.start ?? '') || !DATE_RE.test(lic.term.end ?? '')) {
      throw new Error(`许可 ${lic.id} 的期限非法`);
    }
    if (lic.term.start > lic.term.end) {
      throw new Error(`许可 ${lic.id} 的期限起止颠倒`);
    }
    const rev = lic.revocation;
    if (!rev || typeof rev.revocable !== 'boolean' || !['active', 'revoked'].includes(rev.status)) {
      throw new Error(`许可 ${lic.id} 的撤回条件非法`);
    }
    if (rev.status === 'revoked' && (!rev.revoked_at || !rev.reason)) {
      throw new Error(`许可 ${lic.id} 已撤回但缺少撤回日期或原因`);
    }
    if (licenses.has(lic.id)) throw new Error(`许可编号重复: ${lic.id}`);
    licenses.set(lic.id, lic);
  }
  return licenses;
}

export function loadAssets(raw, licenses) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== 'assets' || !Array.isArray(data.assets) || data.assets.length === 0) {
    throw new Error('素材资料缺少 assets');
  }
  const assets = new Map();
  for (const a of data.assets) {
    if (!a.id) throw new Error('素材缺少 id');
    if (!ASSET_KINDS.includes(a.kind)) throw new Error(`素材 ${a.id} 类型非法: ${a.kind}`);
    if (!a.title || !a.hash) throw new Error(`素材 ${a.id} 缺少标题或内容指纹`);
    if (licenses && !licenses.has(a.license_id)) {
      throw new Error(`素材 ${a.id} 引用了不存在的许可 ${a.license_id}`);
    }
    if (!a.uploaded_by || !DATE_RE.test(a.uploaded_at ?? '')) {
      throw new Error(`素材 ${a.id} 缺少上传人或上传日期`);
    }
    if (a.restricted && !a.restriction_note) {
      throw new Error(`受限素材 ${a.id} 必须说明限制原因`);
    }
    if (assets.has(a.id)) throw new Error(`素材编号重复: ${a.id}`);
    assets.set(a.id, a);
  }
  return { assets, duplicates: findDuplicates(assets) };
}

// 同一内容指纹被登记为多个素材编号，即重复上传。
export function findDuplicates(assets) {
  const byHash = new Map();
  for (const a of assets.values()) {
    if (!byHash.has(a.hash)) byHash.set(a.hash, []);
    byHash.get(a.hash).push(a.id);
  }
  return [...byHash.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort());
}
