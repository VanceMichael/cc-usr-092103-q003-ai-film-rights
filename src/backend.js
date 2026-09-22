// 素材权利后台门面：把名册、许可、素材、作品、渠道装配成统一入口，
// 运营侧只面对这一个对象：发布核验、成员退出、贡献登记、盲评资料、到期预警。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRoster, withdrawStudent } from './roster.js';
import { loadLicenses, loadAssets } from './catalog.js';
import { loadWorks, addContribution, attributionFor } from './works.js';
import { loadChannels } from './channels.js';
import { evaluateRelease } from './gate.js';
import { buildBlindPackage } from './blind.js';

export function createBackend({ roster, licenses, assets, works, channels }) {
  // 跨文件一致性：作品→团队、版本→学生/素材、声明→学生/素材、贡献→学生/版本
  for (const w of works.works.values()) {
    if (!roster.teams.has(w.team_id)) throw new Error(`作品 ${w.id} 引用了不存在的团队 ${w.team_id}`);
  }
  for (const v of works.versions.values()) {
    if (!roster.students.has(v.created_by)) {
      throw new Error(`版本 ${v.id} 的创建者 ${v.created_by} 不在名册中`);
    }
    for (const u of v.asset_uses) {
      if (!assets.assets.has(u.asset_id)) {
        throw new Error(`版本 ${v.id} 使用了未登记的素材 ${u.asset_id}`);
      }
    }
  }
  for (const d of works.declarations.values()) {
    if (!roster.students.has(d.declared_by)) {
      throw new Error(`声明 ${d.id} 的声明人 ${d.declared_by} 不在名册中`);
    }
    for (const id of d.asset_ids) {
      if (!assets.assets.has(id)) throw new Error(`声明 ${d.id} 列出了未登记的素材 ${id}`);
    }
  }
  for (const c of works.contributions) {
    if (!roster.students.has(c.student_id)) {
      throw new Error(`贡献记录的学生 ${c.student_id} 不在名册中`);
    }
  }

  const ctx = { roster, licenses, assets: assets.assets, works, channels };

  return {
    ...ctx,
    duplicates: assets.duplicates,
    evaluateRelease: (workId, versionId, channelId, date) =>
      evaluateRelease(ctx, workId, versionId, channelId, date),
    withdrawStudent: (studentId, date) => withdrawStudent(roster, studentId, date),
    addContribution: (contribution) => addContribution(works, roster, contribution),
    attributionFor: (versionId) => attributionFor(works, roster, versionId),
    blindPackage: (workId) => buildBlindPackage(ctx, workId),
    expiringLicenses: (date, withinDays = 30) => expiringLicenses(licenses, date, withinDays)
  };
}

// 许可到期预警：已撤回的不重复报告（由撤回阻断负责），
// 已届满的标记 expired，临近届满的标记 expiring，按剩余天数升序。
function expiringLicenses(licenses, date, withinDays) {
  const base = Date.parse(date);
  const report = [];
  for (const lic of licenses.values()) {
    if (lic.revocation.status === 'revoked') continue;
    const days = Math.round((Date.parse(lic.term.end) - base) / 86400000);
    if (days < 0) {
      report.push({ license_id: lic.id, licensor: lic.licensor.name, end: lic.term.end, days, status: 'expired' });
    } else if (days <= withinDays) {
      report.push({ license_id: lic.id, licensor: lic.licensor.name, end: lic.term.end, days, status: 'expiring' });
    }
  }
  return report.sort((a, b) => a.days - b.days);
}

// 从资料目录装配后台。
export async function loadBackend(fixturesDir) {
  const read = async (file) => JSON.parse(await readFile(join(fixturesDir, file), 'utf8'));
  const [rosterRaw, licensesRaw, assetsRaw, worksRaw, channelsRaw] = await Promise.all([
    read('roster.json'),
    read('licenses.json'),
    read('assets.json'),
    read('works.json'),
    read('channels.json')
  ]);
  const roster = loadRoster(rosterRaw);
  const licenses = loadLicenses(licensesRaw);
  const assets = loadAssets(assetsRaw, licenses);
  const works = loadWorks(worksRaw);
  const channels = loadChannels(channelsRaw);
  return createBackend({ roster, licenses, assets, works, channels });
}
