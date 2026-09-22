// 展示与对接渠道：嘉年华展映、就业对接、商业推广、课堂放映。
import { PURPOSES } from './catalog.js';
import { STAGES } from './works.js';

const AUDIENCES = ['public', 'restricted', 'internal'];

export function loadChannels(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.kind !== 'channels' || !Array.isArray(data.channels) || data.channels.length === 0) {
    throw new Error('渠道资料缺少 channels');
  }
  const channels = new Map();
  for (const c of data.channels) {
    if (!c.id || !c.name) throw new Error('渠道资料不完整');
    if (!PURPOSES.includes(c.purpose)) throw new Error(`渠道 ${c.id} 用途非法: ${c.purpose}`);
    if (!Array.isArray(c.territories) || c.territories.length === 0) {
      throw new Error(`渠道 ${c.id} 缺少地域`);
    }
    if (!AUDIENCES.includes(c.audience)) throw new Error(`渠道 ${c.id} 受众范围非法`);
    if (!Array.isArray(c.allowed_stages) || c.allowed_stages.length === 0
        || c.allowed_stages.some((s) => !STAGES.includes(s))) {
      throw new Error(`渠道 ${c.id} 的允许阶段非法`);
    }
    if (channels.has(c.id)) throw new Error(`渠道编号重复: ${c.id}`);
    channels.set(c.id, c);
  }
  return channels;
}
