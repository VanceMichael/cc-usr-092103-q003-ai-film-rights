# AI影视素材权利链

约定影视创作素材、作品版本与展示许可的关联方式，并提供素材权利后台：运营人员把学生作品送入嘉年华展映或就业对接前，可以逐层追溯 AI演员、音乐、训练素材、实拍片段及全部派生版本，确认许可主体、用途、地域、期限和撤回条件仍适用于当前渠道。

## 领域资料

`contracts/` 描述六份资料的格式，`fixtures/` 给出可公开使用的虚构样例：

| 资料 | 内容 |
| --- | --- |
| `fixtures/roster.json` | 84 名学生、33 支跨专业团队（由 `npm run generate:roster` 确定性生成） |
| `fixtures/licenses.json` | 10 份许可：主体、用途、地域、期限、撤回条件 |
| `fixtures/assets.json` | 13 份素材：AI演员 / 音乐 / 训练素材 / 实拍片段，含内容指纹 |
| `fixtures/works.json` | 8 部作品、19 个派生版本、19 份素材使用声明、贡献记录 |
| `fixtures/channels.json` | 嘉年华展映、就业对接（境内/海外）、商业推广、课堂放映 |
| `fixtures/context.json` | 基础领域上下文（原始样例） |

课程阶段覆盖 `training`（培训）→ `city_brief`（城市命题创作）→ `blind_review`（盲评）→ `screening`（展映）→ `incubation`（创业孵化）。

## 素材权利后台

`src/backend.js` 把五份资料装配成统一入口：

```js
import { loadBackend } from './src/backend.js';

const backend = await loadBackend('fixtures/');

// 发布闸门：沿派生链逐层核验，返回 allowed / blocks / warnings / clearances
const r = backend.evaluateRelease('work-lantern', 'ver-l3', 'ch-carnival', '2026-09-22');

backend.withdrawStudent('stu-004', '2026-09-22');  // 成员退出（保留贡献）
backend.attributionFor('ver-l1');                  // 署名视图（含已退出成员）
backend.blindPackage('work-lantern');              // 盲评资料包（自动脱敏校验）
backend.expiringLicenses('2026-09-22', 120);       // 许可到期预警
backend.duplicates;                                // 目录级重复上传清单
```

### 发布闸门的阻断定位

`evaluateRelease` 的每一项阻断都指出**哪一项权利**（`right`）与**哪段派生链**（`entered_at` + `chain_path`），在公开展示前暴露授权缺口：

| 阻断权利 | 含义 | 样例作品 |
| --- | --- | --- |
| `term` | 许可期限不覆盖发布日 | 《霓虹样本》配乐许可 2026-06-30 届满 |
| `revocation` | 许可主体已行使撤回权 | 《苔径》训练素材 2026-08-15 被撤回 |
| `purpose` | 许可用途不含渠道用途 | 《旧城河》教育版AI演员不得进入商业推广 |
| `territory` | 许可地域不覆盖渠道地域 | 《港声》实拍素材限境内，海外对接被阻断 |
| `restriction` | 受限素材混入公开版本/渠道 | 《回声巷》未清场路人片段进入公开版 |
| `duplicate_upload` | 同一内容指纹重复上传进入派生链 | 《镜像练习》配乐《镜面》两份登记 |
| `parallel_revision` | 派生链存在未合并的更新分支 | 《镜像练习》ver-m2 分出 ver-m3b |
| `undeclared_asset` / `missing_declaration` | 素材未在版本声明中列明 | 《余烬》客串AI演员漏报 |
| `stage` | 作品阶段不被渠道接受 | 盲评中的作品不得进展映渠道 |

### 三条铁律

- **成员退出不能抹掉贡献**：退出只改状态，团队名册、版本创建者、声明人、贡献记录全部保留；已退出成员不能再登记新贡献，但历史署名完整可查。
- **获奖不会自动扩展许可**：获奖只是事实记录。课堂/展映许可的作品获奖后进入商业推广渠道，仍会在 `purpose` 权利上被阻断，并附说明。
- **盲评不泄露身份**：盲评资料包只含盲审编号、标题、阶段与素材类型构成；构造时自动校验，夹带学生姓名、团队名、院校名或身份字段即抛错。

## 本地校验

```bash
npm test                # 39 项测试：资料校验 + 全部业务规则
npm run generate:roster # 重新生成名册（确定性输出，不会变化）
```

所有示例均为虚构数据，不含真实个人信息、账号或访问凭据。
