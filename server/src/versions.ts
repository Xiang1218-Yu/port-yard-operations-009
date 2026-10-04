// 乐观并发版本登记：编排计划提交时用它判断任务/箱/设备在排序生成后是否已被现场改动。
// 使用 WeakMap 不干扰实体序列化；删除的实体额外登记到墓碑表，用于识别「排序时存在、提交时已删除」。
const versionMap = new WeakMap<object, number>();
const tombstones = new Map<string, number>();

export function registerVersion(entity: object, version = 1) {
  if (versionMap.get(entity) === undefined) versionMap.set(entity, version);
}

export function bumpVersion(entity: object) {
  const next = (versionMap.get(entity) ?? 0) + 1;
  versionMap.set(entity, next);
  return next;
}

export function versionOf(entity: object) {
  return versionMap.get(entity) ?? 0;
}

export function markDeleted(id: string) {
  const next = (tombstones.get(id) ?? 0) + 1;
  tombstones.set(id, next);
}

export function clearTombstone(id: string) {
  tombstones.delete(id);
}

export function isDeletedAfter(id: string, baselineVersion: number) {
  return (tombstones.get(id) ?? 0) > baselineVersion;
}

export interface EntitySnapshot { version: number; status: string; updatedAt: string | null; }

// 单调递增的实体 ID 生成器：Date.now() 在同毫秒内连建两条记录会撞号。
let entitySequence = 0;
export function newEntityId(prefix: string) {
  entitySequence += 1;
  return `${prefix}-${Date.now()}${entitySequence.toString(36)}`;
}

// 状态指纹：提交时除了版本，还会比对状态本身，双保险防止过期排序覆盖现场。
export function snapshotFingerprint(version: number, status: string, updatedAt?: string | null): EntitySnapshot {
  return { version, status, updatedAt: updatedAt ?? null };
}
