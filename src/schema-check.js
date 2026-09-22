// 最小 JSON Schema（draft 2020-12 子集）校验器，覆盖本仓库契约用到的关键字：
// type / const / enum / required / properties / patternProperties 不使用、
// additionalProperties / items / minItems / minLength / pattern / format(date,date-time) /
// $defs + $ref / 联合类型 ["string","null"]。
function resolveRef(root, ref) {
  const path = ref.replace(/^#\//, '').split('/');
  let node = root;
  for (const seg of path) node = node[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
  return node;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function validate(schema, data, root = schema, path = '$', errors = []) {
  if (schema.$ref) schema = resolveRef(root, schema.$ref);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const typeOk = types.some((t) => matchesType(t, data));
    if (!typeOk) {
      errors.push(`${path}：类型应为 ${types.join('|')}，实际 ${data === null ? 'null' : typeof data}`);
      return errors;
    }
  }
  if ('const' in schema && JSON.stringify(data) !== JSON.stringify(schema.const)) {
    errors.push(`${path}：值应为 ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${path}：不在允许枚举内：${schema.enum.join('、')}`);
  }

  if (typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) errors.push(`${path}：短于最小长度 ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push(`${path}：不匹配模式 ${schema.pattern}`);
    if (schema.format === 'date' && !DATE_RE.test(data)) errors.push(`${path}：不是日期格式`);
    if (schema.format === 'date-time' && !DATETIME_RE.test(data)) errors.push(`${path}：不是UTC日期时间格式`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) errors.push(`${path}：少于最少 ${schema.minItems} 项`);
    if (schema.items) data.forEach((item, i) => validate(schema.items, item, root, `${path}[${i}]`, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const key of schema.required ?? []) {
      if (!(key in data)) errors.push(`${path}：缺少必填字段 ${key}`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in data) validate(sub, data[key], root, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) errors.push(`${path}：出现未声明字段 ${key}`);
      }
    }
  }
  return errors;
}

function matchesType(type, value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'object') return value && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

export function assertValid(schema, data) {
  const errors = validate(schema, data);
  if (errors.length) throw new Error(`资料契约校验失败：\n- ${errors.join('\n- ')}`);
}
