// 生成 84 名学生、33 支跨专业团队的名册样例。
// 全部为虚构数据：姓名、团队名、院校名均由固定词表按序号确定组合，
// 不引用任何真实个人信息。重复运行输出完全一致。
import { writeFile } from 'node:fs/promises';

const SURNAMES = [
  '林', '陈', '苏', '叶', '沈', '顾', '江', '周', '吴', '郑',
  '王', '李', '张', '刘', '杨', '黄', '赵', '许', '邓', '韩',
  '曹', '曾', '彭', '萧', '蔡', '潘', '袁', '董', '余', '杜',
  '程', '陆', '侯', '孟', '龙', '段', '钱', '汤', '尹', '黎',
  '易', '常', '武', '乔', '贺', '赖', '龚', '文', '庞', '樊',
  '兰', '殷', '施', '陶', '洪', '翟', '安', '颜', '倪', '严'
];

const GIVEN = [
  '望舒', '既白', '听澜', '照眠', '叙白', '栖迟', '清晏', '星垂', '野阔', '云舟',
  '雨眠', '知夏', '立冬', '惊蛰', '谷雨', '白露', '霜降', '小雪', '冬至', '夏至',
  '春分', '秋分', '清明', '芒种', '小满', '大暑', '处暑', '寒露', '立秋', '立春',
  '雨水', '小寒', '小暑', '沐阳', '疏影', '横舟', '远山', '近水', '朝歌', '拾遗'
];

const MAJORS = ['导演', '编剧', '摄影', '录音', '动画', '表演', '美术', '计算机', '音乐', '制片'];
const INSTITUTIONS = ['临港艺术学院', '北屿理工大学', '汀洲传媒职业学院'];
const STAGES = ['training', 'city_brief', 'blind_review', 'screening', 'incubation'];

const TEAM_PREFIX = [
  '青', '白', '赤', '玄', '汀', '屿', '潮', '岸', '雾', '曙',
  '星', '溪', '岚', '苇', '漾', '砾', '翎', '珀', '樵', '汐',
  '檬', '梧', '霓', '舷', '笛', '砚', '棱', '藻', '鹭', '栩',
  '燃', '霁', '攸'
];
const TEAM_SUFFIX = ['屿', '堤', '澜', '壤', '穹', '汀', '渚', '浦', '矶', '潭'];

const TEAM_COUNT = 33;
const FULL_TEAMS = 18; // 前 18 支团队各 3 人，其余 15 支各 2 人，合计 84 人

// 预先退出课程的成员：其历史贡献必须保留在作品派生链上
const PRE_WITHDRAWN = { id: 'stu-003', withdrawn_at: '2026-08-01' };

function studentId(n) {
  return `stu-${String(n).padStart(3, '0')}`;
}

function teamId(t) {
  return `team-${String(t + 1).padStart(2, '0')}`;
}

function buildRoster() {
  const students = [];
  const teams = [];
  let index = 0;
  for (let t = 0; t < TEAM_COUNT; t += 1) {
    const size = t < FULL_TEAMS ? 3 : 2;
    const memberIds = [];
    const majors = new Set();
    for (let k = 0; k < size; k += 1) {
      const id = studentId(index + 1);
      const major = MAJORS[(t + k) % MAJORS.length];
      majors.add(major);
      const student = {
        id,
        // 姓与名按下标错位组合，lcm(60, 40) = 120 内不会重名
        name: SURNAMES[index % SURNAMES.length] + GIVEN[index % GIVEN.length],
        major,
        institution: INSTITUTIONS[index % INSTITUTIONS.length],
        team_id: teamId(t),
        status: 'active',
        enrolled_at: '2026-02-20'
      };
      if (id === PRE_WITHDRAWN.id) {
        student.status = 'withdrawn';
        student.withdrawn_at = PRE_WITHDRAWN.withdrawn_at;
      }
      students.push(student);
      memberIds.push(id);
      index += 1;
    }
    teams.push({
      id: teamId(t),
      name: `${TEAM_PREFIX[t]}${TEAM_SUFFIX[(t * 3) % TEAM_SUFFIX.length]}组`,
      member_ids: memberIds,
      majors: [...majors]
    });
  }
  return {
    domain: 'ai-film-rights',
    kind: 'roster',
    version: 1,
    generated_at: '2026-09-22',
    stages: STAGES,
    students,
    teams
  };
}

const roster = buildRoster();
const target = new URL('../fixtures/roster.json', import.meta.url);
await writeFile(target, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');
console.log(`已生成名册：${roster.students.length} 名学生 / ${roster.teams.length} 支团队 -> ${target.pathname}`);
