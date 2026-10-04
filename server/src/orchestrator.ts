import { auditEvents, blocks, containers, equipment, tasks, voyages, YardTask } from './domain.js';
import { bumpVersion, isDeletedAfter, markDeleted, versionOf } from './versions.js';

/* ------------------------------------------------------------------ */
/* 类型定义                                                             */
/* ------------------------------------------------------------------ */

export type EntryMode = 'auto' | 'locked' | 'inserted' | 'frozen' | 'blocked';

export interface ScoreFactor { key: string; label: string; points: number; }

export interface PlanEntry {
  taskId: string;
  kind: YardTask['kind'];
  containerId: string;
  voyageId?: string;
  rank: number | null;
  baselineRank: number | null;
  rankDelta: number | null;
  mode: EntryMode;
  score: number | null;
  scoreFactors: ScoreFactor[];
  scoreSummary: string;
  hardBlockers: string[];
  softWarnings: string[];
  predecessors: { taskId: string; implicit: boolean }[];
  sameContainerTasks: string[];
  equipmentId?: string;
  equipmentStatus?: string;
  proposedEquipmentId?: string;
  proposedEquipmentName?: string;
  startAt: string | null;
  finishAt: string | null;
  waitMinutes: number | null;
  estimatedMinutes: number;
  from: string;
  to: string;
}

export interface VoyageImpact {
  voyageId: string;
  vessel: string;
  etd: string;
  etdMinutes: number;
  remainingTasks: number;
  blockedTasks: number;
  baselineFinishAt: string | null;
  plannedFinishAt: string | null;
  deltaMinutes: number | null;
  slackMinutes: number | null;
  projectedMiss: boolean;
  movedEarlier: string[];
  movedLater: string[];
  blockedTaskIds: string[];
}

export interface DriftChange {
  entity: 'task' | 'container' | 'equipment';
  id: string;
  detail: string;
  baseVersion: number;
  currentVersion: number;
}

export interface OrchestratorPlan {
  generatedAt: string;
  nowMs: number;
  focusedEquipmentId?: string;
  sequence: PlanEntry[];
  blockedLane: PlanEntry[];
  voyageImpacts: VoyageImpact[];
  cycles: { members: string[]; detail: string }[];
  summary: {
    schedulable: number; blocked: number; frozen: number; locked: number; inserted: number;
    projectedMisses: number; totalWaitMinutes: number;
  };
  scoreLegend: { factor: string; meaning: string }[];
}

export interface EditRecord {
  id: string;
  at: string;
  type: 'lock' | 'insert' | 'unlock';
  taskId: string;
  beforeTaskId?: string;
  detail: string;
}

interface Fingerprint { version: number; status: string; }
interface Fingerprints {
  at: string;
  tasks: Record<string, Fingerprint>;
  containers: Record<string, Fingerprint>;
  equipment: Record<string, Fingerprint>;
}

export interface AppliedItem { taskId: string; rank: number; scheduledAt: string; equipmentId?: string; }
export interface RejectedItem { taskId: string; reason: string; currentStatus: string; baseVersion: number; currentVersion: number; }

export interface SubmitResult {
  planId: string;
  clientId?: string;
  status: 'applied' | 'partial' | 'rejected';
  at: string;
  applied: AppliedItem[];
  rejected: RejectedItem[];
}

export interface Draft {
  id: string;
  createdAt: string;
  createdBy: string;
  edits: EditRecord[];
  submitted: boolean;
  submitResult?: SubmitResult;
  base: Fingerprints;
}

export interface DraftView {
  draft: Draft;
  plan: OrchestratorPlan;
  drift: { hasDrift: boolean; changes: DriftChange[] };
  staleManipulations: { taskId: string; reason: string; type: 'lock' | 'insert' }[];
}

/* ------------------------------------------------------------------ */
/* 常量与工具                                                           */
/* ------------------------------------------------------------------ */

const KIND_WEIGHT: Record<YardTask['kind'], number> = { load: 25, discharge: 15, receive: 10, inspect: 12, deliver: 8, rehandle: 5 };
const KIND_LABEL: Record<YardTask['kind'], string> = { load: '装船', discharge: '卸船', receive: '收箱进场', deliver: '提箱离場', inspect: '海关查验', rehandle: '翻箱移箱' };
const CONTAINER_PRIORITY_BONUS: Record<string, number> = { hazmat: 18, reefer: 12, hot: 10, normal: 0 };
// 作业能力：在「取箱侧」区块设备清单的交集内才被认为有能力执行。
const REQUIRED_KINDS: Record<YardTask['kind'], string[]> = {
  load: ['quay-crane', 'yard-crane', 'reach-stacker', 'terminal-truck'],
  discharge: ['quay-crane', 'yard-crane', 'reach-stacker', 'terminal-truck'],
  receive: ['terminal-truck', 'reach-stacker', 'yard-crane'],
  deliver: ['terminal-truck', 'reach-stacker', 'yard-crane'],
  inspect: ['reach-stacker'],
  rehandle: ['yard-crane', 'reach-stacker'],
};
const KIND_NAME: Record<string, string> = { 'quay-crane': '岸桥', 'yard-crane': '场桥', 'terminal-truck': '集卡', 'reach-stacker': '正面吊' };
const HARD_REASON_KEYWORDS = ['维护', '不可用', '离线', '扣留', '海关查验窗口', '海关未放行', '能力不匹配'];

const BLOCK_XY: Record<string, [number, number]> = { A01: [0, 3], B07: [1, 1], C03: [2, 0], D05: [3, 3] };
const GATE_XY: Record<string, [number, number]> = { 南闸口: [2, -1], 北闸口: [0, -1], 闸口: [1, -1] };
const QUAY_XY: Record<string, [number, number]> = { B01: [0, -2], B04: [2, -2], B07: [1, -2], B10: [3, -2] };

function coordOf(loc: string): [number, number] | null {
  if (loc.includes('/')) return QUAY_XY[loc.split('/')[0].trim()] ?? [1, -2];
  if (GATE_XY[loc]) return GATE_XY[loc];
  const blockId = loc.match(/^([A-Z]\d{2})(-|$)/)?.[1];
  return blockId && BLOCK_XY[blockId] ? BLOCK_XY[blockId] : null;
}
function travelMinutes(from: string, to: string): number {
  const a = coordOf(from); const b = coordOf(to);
  if (!a || !b) return 0;
  const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  return dist === 0 ? 0 : 2 + dist * 2;
}
function blockOf(loc: string) { const id = loc.match(/^([A-Z]\d{2})(-|$)/)?.[1]; return id ? blocks.find(b => b.id === id) : undefined; }
const minutesUntil = (at: string, nowMs: number) => Math.round((new Date(at).getTime() - nowMs) / 60000);

function etdScore(minutes: number) {
  if (minutes <= 360) return 60;
  if (minutes <= 720) return 40;
  if (minutes <= 1440) return 20;
  return 5;
}
function etdBandLabel(minutes: number) {
  if (minutes <= 360) return `ETD 仅余 ${minutes} 分钟（6 小时内，保船期窗口）`;
  if (minutes <= 720) return `ETD 余 ${minutes} 分钟（12 小时内）`;
  if (minutes <= 1440) return `ETD 余 ${minutes} 分钟（24 小时内）`;
  return `ETD 余 ${minutes} 分钟（船期尚远）`;
}

/* ------------------------------------------------------------------ */
/* 图构建：显式前置 + 同箱互斥 + 环检测                                    */
/* ------------------------------------------------------------------ */

interface EvalGraph {
  edges: [string, string][];
  predecessors: Map<string, string[]>;
  successors: Map<string, string[]>;
  implicitEdges: Set<string>;
  cycles: string[][];
  cycleNodes: Set<string>;
  missingDeps: Map<string, string[]>;
  sameContainer: Map<string, string[]>;
}

const PHASE: Record<YardTask['kind'], number> = { discharge: 0, receive: 0, inspect: 1, rehandle: 2, load: 3, deliver: 3 };

function buildGraph(live: YardTask[]): EvalGraph {
  const ids = new Set(live.map(t => t.id));
  const byId = new Map(live.map(t => [t.id, t]));
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  const edgeSet = new Set<string>();
  const implicitEdges = new Set<string>();
  const missingDeps = new Map<string, string[]>();
  const edges: [string, string][] = [];

  const addEdge = (u: string, v: string, implicit = false) => {
    if (u === v || !ids.has(u) || !ids.has(v)) return;
    const key = `${u}->${v}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key); edges.push([u, v]);
    if (implicit) implicitEdges.add(key);
    predecessors.get(v)!.push(u); successors.get(u)!.push(v);
  };
  live.forEach(t => { predecessors.set(t.id, []); successors.set(t.id, []); });

  live.forEach(t => (t.dependsOn ?? []).forEach(dep => {
    if (!ids.has(dep)) missingDeps.set(t.id, [...(missingDeps.get(t.id) ?? []), dep]);
    else addEdge(dep, t.id);
  }));

  // 同箱互斥：同一箱子的任务按「卸船/收箱 → 查验 → 翻箱 → 装船/提离」阶段排序，
  // 同阶段按计划时间排序，自动形成串行链，避免同一箱子被两台设备同时争抢。
  const sameContainer = new Map<string, string[]>();
  const groups = new Map<string, YardTask[]>();
  live.forEach(t => { const list = groups.get(t.containerId) ?? []; list.push(t); groups.set(t.containerId, list); });
  groups.forEach(list => {
    const ordered = [...list].sort((a, b) => PHASE[a.kind] - PHASE[b.kind] || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() || a.id.localeCompare(b.id));
    ordered.forEach(t => sameContainer.set(t.id, ordered.map(o => o.id).filter(id => id !== t.id)));
    for (let i = 1; i < ordered.length; i++) addEdge(ordered[i - 1].id, ordered[i].id, true);
  });

  // DFS 着色检测环形前置依赖（环内成员全部撤出可执行序列）。
  const cycleNodes = new Set<string>();
  const cycles: string[][] = [];
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (node: string) => {
    color.set(node, 1); stack.push(node);
    for (const succ of successors.get(node) ?? []) {
      if (color.get(succ) === 1) {
        const cycle = [...stack.slice(stack.indexOf(succ)), succ];
        if (!cycles.some(c => c.length === cycle.length && c.every(id => cycle.includes(id)))) cycles.push(cycle);
        cycle.forEach(id => cycleNodes.add(id));
      } else if (!color.get(succ)) dfs(succ);
    }
    stack.pop(); color.set(node, 2);
  };
  live.forEach(t => { if (!color.get(t.id)) dfs(t.id); });
  // 环会沿前驱链传染：只要某条后继路径无法到达终点（通向环），该任务也撤出排序。
  if (cycleNodes.size) {
    let changed = true;
    while (changed) {
      changed = false;
      live.forEach(t => {
        if (cycleNodes.has(t.id)) return;
        const succs = successors.get(t.id) ?? [];
        if (succs.length > 0 && succs.some(s => cycleNodes.has(s))) { cycleNodes.add(t.id); changed = true; }
      });
    }
  }
  return { edges, predecessors, successors, implicitEdges, cycles, cycleNodes, missingDeps, sameContainer };
}
/* ------------------------------------------------------------------ */
/* 约束评估：硬阻塞 / 软预警 / 评分因子                                    */
/* ------------------------------------------------------------------ */

interface Evaluation {
  hardBlockers: Map<string, string[]>;
  softWarnings: Map<string, string[]>;
  factors: Map<string, ScoreFactor[]>;
  scores: Map<string, number>;
  eligibleMachines: Map<string, typeof equipment>;
}

function isHardReason(reason: string) { return HARD_REASON_KEYWORDS.some(keyword => reason.includes(keyword)); }

function evaluate(live: YardTask[], graph: EvalGraph, nowMs: number): Evaluation {
  const hardBlockers = new Map<string, string[]>();
  const softWarnings = new Map<string, string[]>();
  const factors = new Map<string, ScoreFactor[]>();
  const scores = new Map<string, number>();
  const eligibleMachines = new Map<string, typeof equipment>();
  const byId = new Map(live.map(t => [t.id, t]));
  const containerById = new Map(containers.map(c => [c.id, c]));
  const voyageById = new Map(voyages.map(v => [v.id, v]));

  const addHard = (id: string, reason: string) => { const list = hardBlockers.get(id) ?? []; if (!list.includes(reason)) list.push(reason); hardBlockers.set(id, list); };
  const addSoft = (id: string, reason: string) => { const list = softWarnings.get(id) ?? []; if (!list.includes(reason)) list.push(reason); softWarnings.set(id, list); };

  live.forEach(task => {
    const machineList: typeof equipment = [];
    const fromBlock = blockOf(task.from);
    const capableKinds = REQUIRED_KINDS[task.kind].filter(kind => !fromBlock || fromBlock.equipment.includes(kind as never));
    if (fromBlock && capableKinds.length === 0) {
      addHard(task.id, `取箱区块 ${fromBlock.id}（${fromBlock.zone}）只有 ${fromBlock.equipment.map(k => KIND_NAME[k]).join('、')}，无法执行${KIND_LABEL[task.kind]}作业`);
    }
    equipment.forEach(machine => {
      const capable = capableKinds.includes(machine.kind);
      const usable = machine.status === 'available' || machine.status === 'working';
      if (capable && usable) machineList.push(machine);
      if (capable && machine.id === task.equipmentId && !usable) addHard(task.id, `指派设备 ${machine.name} 当前${machine.status === 'maintenance' ? '维护中' : '离线'}，不可用`);
      if (!capable && machine.id === task.equipmentId) addHard(task.id, `指派设备 ${machine.name}（${KIND_NAME[machine.kind]}）能力不匹配，${KIND_LABEL[task.kind]}需要 ${capableKinds.map(k => KIND_NAME[k]).join('/')}`);
    });
    if (capableKinds.length > 0 && machineList.length === 0) addHard(task.id, `设备池内没有可用的 ${capableKinds.map(k => KIND_NAME[k]).join('/')}（均在维护或离线）`);
    eligibleMachines.set(task.id, machineList);

    (task.blockingReasons ?? []).forEach(reason => (isHardReason(reason) ? addHard : addSoft)(task.id, reason));
    (graph.missingDeps.get(task.id) ?? []).forEach(dep => addHard(task.id, `前置任务 ${dep} 已被删除或不存在，需重建前置链`));
    if (graph.cycleNodes.has(task.id)) {
      const cycle = graph.cycles.find(c => c.includes(task.id));
      addHard(task.id, cycle ? `与 ${cycle.filter(id => id !== task.id).join('、')} 构成环形前置依赖，调度器已撤出排序，请人工打破环` : '处于环形前置依赖链上');
    }
    const container = containerById.get(task.containerId);
    if (container && (task.kind === 'load' || task.kind === 'deliver') && container.customs !== 'released') {
      addHard(task.id, `箱 ${container.id} 海关状态为「${container.customs === 'hold' ? '扣留' : '查验中'}」，未放行不能${KIND_LABEL[task.kind]}`);
    }
  });

  // 硬阻塞沿显式 + 同箱边向后继传染：前置不解，后续不能开工。
  let changed = true;
  while (changed) {
    changed = false;
    live.forEach(task => {
      if (hardBlockers.has(task.id)) return;
      const blockedPred = (graph.predecessors.get(task.id) ?? []).find(pred => hardBlockers.has(pred));
      if (blockedPred) { addHard(task.id, `前置任务 ${blockedPred} 仍处阻塞，本任务无法开始`); changed = true; }
    });
  }

  // 下游紧迫度传递：后继越保船期，前驱越值得提前。
  const downstream = new Map<string, number>();
  const resolveDownstream = (id: string, visiting: Set<string>): number => {
    if (downstream.has(id)) return downstream.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let bonus = 0;
    (graph.successors.get(id) ?? []).forEach(succ => {
      const succTask = byId.get(succ)!;
      const c = containerById.get(succTask.containerId);
      const v = c ? voyageById.get(c.voyageId) : undefined;
      const succWeight = (v ? etdScore(minutesUntil(v.etd, nowMs)) : 0) + KIND_WEIGHT[succTask.kind];
      bonus += succWeight * 0.5 + resolveDownstream(succ, visiting) * 0.35;
    });
    visiting.delete(id);
    bonus = Math.min(30, Math.round(bonus));
    downstream.set(id, bonus);
    return bonus;
  };

  live.forEach(task => {
    if (task.status === 'executing' || hardBlockers.has(task.id)) { factors.set(task.id, []); return; }
    const container = containerById.get(task.containerId);
    const voyage = container ? voyageById.get(container.voyageId) : undefined;
    const etdMin = voyage ? minutesUntil(voyage.etd, nowMs) : null;
    const list: ScoreFactor[] = [
      { key: 'base', label: `箱务基础优先级 ${task.priority}`, points: task.priority },
      { key: 'kind', label: `作业类型权重：${KIND_LABEL[task.kind]}`, points: KIND_WEIGHT[task.kind] },
    ];
    if (voyage && etdMin !== null) list.push({ key: 'etd', label: etdBandLabel(etdMin), points: etdScore(etdMin) });
    if (container) {
      const bonus = CONTAINER_PRIORITY_BONUS[container.priority] ?? 0;
      if (bonus > 0) list.push({ key: 'container', label: `箱务等级「${container.priority === 'hot' ? '急箱' : container.priority === 'reefer' ? '冷藏' : '危险品'}」加权`, points: bonus });
    }
    const down = resolveDownstream(task.id, new Set());
    if (down > 0) list.push({ key: 'downstream', label: `下游 ${(graph.successors.get(task.id) ?? []).length} 个任务的船期紧迫度传递`, points: down });
    const assigned = equipment.find(m => m.id === task.equipmentId);
    if (assigned) {
      const sameBlock = blockOf(task.from)?.id && assigned.location.startsWith(blockOf(task.from)!.id);
      if (sameBlock) list.push({ key: 'locality', label: `区块就近：${assigned.name} 已在 ${blockOf(task.from)!.id} 区块，无空驶`, points: 6 });
      if (assigned.battery < 20) addSoft(task.id, `${assigned.name} 电量 ${assigned.battery}%，连续作业可能中断`);
    }
    const heatBlock = blockOf(task.from);
    if (heatBlock && heatBlock.heat > 85) list.push({ key: 'heat', label: `高热区块 ${heatBlock.id}（热度 ${heatBlock.heat}）优先疏运`, points: 6 });
    (softWarnings.get(task.id) ?? []).forEach((warning, index) => list.push({ key: `soft-${index}`, label: `软约束折减：${warning}`, points: -8 }));
    factors.set(task.id, list);
    scores.set(task.id, Math.max(0, list.reduce((sum, item) => sum + item.points, 0)));
  });

  return { hardBlockers, softWarnings, factors, scores, eligibleMachines };
}

/* ------------------------------------------------------------------ */
/* 自动排序（Kahn + 评分）与人工锁定/插队的位置合成                         */
/* ------------------------------------------------------------------ */

function topologicalAuto(live: YardTask[], graph: EvalGraph, evaluation: Evaluation, frozenFirst: string[]) {
  const schedulable = live.filter(t => t.status !== 'executing' && !evaluation.hardBlockers.has(t.id));
  const remaining = new Set(schedulable.map(t => t.id));
  const byId = new Map(live.map(t => [t.id, t]));
  const indegree = new Map<string, number>();
  schedulable.forEach(t => indegree.set(t.id, (graph.predecessors.get(t.id) ?? []).filter(p => remaining.has(p)).length));
  const ordered: string[] = [];
  const popBest = (ready: string[]) => {
    ready.sort((a, b) => (evaluation.scores.get(b) ?? 0) - (evaluation.scores.get(a) ?? 0) || (graph.successors.get(b)?.length ?? 0) - (graph.successors.get(a)?.length ?? 0) || a.localeCompare(b));
    return ready.shift()!;
  };
  let ready = schedulable.filter(t => indegree.get(t.id) === 0).map(t => t.id);
  while (ready.length) {
    const next = popBest(ready);
    ordered.push(next); remaining.delete(next);
    (graph.successors.get(next) ?? []).forEach(succ => {
      if (!remaining.has(succ)) return;
      indegree.set(succ, (indegree.get(succ) ?? 1) - 1);
      if (indegree.get(succ) === 0) ready.push(succ);
    });
  }
  return [...frozenFirst, ...ordered];
}

interface Pin { taskId: string; rank: number; }

function placePins(autoIds: string[], pins: Pin[]) {
  const slots: (string | undefined)[] = Array(autoIds.length);
  pins.filter(p => autoIds.includes(p.taskId)).sort((a, b) => a.rank - b.rank || a.taskId.localeCompare(b.taskId)).forEach(pin => {
    let idx = Math.min(Math.max(pin.rank - 1, 0), slots.length - 1);
    while (slots[idx] !== undefined) idx = Math.min(idx + 1, slots.length - 1);
    slots[idx] = pin.taskId;
  });
  let cursor = 0;
  const pinned = new Set(pins.map(p => p.taskId));
  autoIds.forEach(id => {
    if (pinned.has(id)) return;
    while (slots[cursor] !== undefined) cursor++;
    slots[cursor] = id;
  });
  return slots.filter((id): id is string => Boolean(id));
}

function composeOrder(autoIds: string[], graph: EvalGraph, hardPins: Pin[], softPins: Pin[]) {
  const stale: { taskId: string; reason: string; type: 'lock' | 'insert' }[] = [];
  let pins: Pin[] = [...hardPins, ...softPins].filter(p => autoIds.includes(p.taskId));
  let order = autoIds;
  for (let attempt = 0; attempt < 12; attempt++) {
    order = placePins(autoIds, pins);
    const pos = new Map(order.map((id, index) => [id, index]));
    const inversion = graph.edges.find(([u, v]) => (pos.get(u) ?? -1) > (pos.get(v) ?? -1));
    if (!inversion) break;
    const [u, v] = inversion;
    const hardV = hardPins.find(p => p.taskId === v && pins.some(pin => pin.taskId === v));
    const softV = pins.find(p => p.taskId === v);
    if (hardV) {
      pins = pins.filter(p => p.taskId !== v);
      stale.push({ taskId: v, reason: `现场数据变化后，锁定位置越过了前置任务 ${u}，已临时解除该锁定`, type: 'lock' });
      continue;
    }
    if (softV) {
      pins = pins.filter(p => p.taskId !== v);
      stale.push({ taskId: v, reason: `插队位置与前置任务 ${u} 冲突，已恢复自动排序`, type: 'insert' });
      continue;
    }
    // v 为自动排序项却越过了固定的 u：把 v 挪到 u 之后。
    order.splice(pos.get(v)!, 1);
    order.splice(Math.min((pos.get(u) ?? 0) + 1, order.length), 0, v);
    // 下一轮继续校验
    const nextPos = new Map(order.map((id, index) => [id, index]));
    if (!graph.edges.some(([a, b]) => (nextPos.get(a) ?? -1) > (nextPos.get(b) ?? -1))) break;
  }
  return { order, stale };
}

/* ------------------------------------------------------------------ */
/* 设备仿真：按序列分配设备，投影开始/结束时刻                              */
/* ------------------------------------------------------------------ */

interface MachineState { id: string; freeAt: number; }

function simulate(orderedIds: string[], live: YardTask[], graph: EvalGraph, evaluation: Evaluation, nowMs: number) {
  const byId = new Map(live.map(t => [t.id, t]));
  const states = new Map<string, MachineState>();
  equipment.forEach(m => {
    if (m.status === 'maintenance' || m.status === 'offline') states.set(m.id, { id: m.id, freeAt: Number.POSITIVE_INFINITY });
    else if (m.status === 'working') states.set(m.id, { id: m.id, freeAt: nowMs + (12 + m.queue * 4) * 60000 });
    else states.set(m.id, { id: m.id, freeAt: nowMs });
  });
  const finishAt = new Map<string, number>();
  const chosenMachine = new Map<string, string>();
  const startAt = new Map<string, number>();

  orderedIds.forEach(id => {
    const task = byId.get(id)!;
    const earliestPreds = (graph.predecessors.get(id) ?? []).map(pred => finishAt.get(pred) ?? nowMs);
    const earliest = Math.max(nowMs, new Date(task.scheduledAt).getTime(), ...(earliestPreds.length ? earliestPreds : [nowMs]));
    if (task.status === 'executing') {
      const start = Math.min(nowMs, new Date(task.scheduledAt).getTime());
      const finish = start + task.estimatedMinutes * 60000;
      startAt.set(id, start); finishAt.set(id, finish);
      if (task.equipmentId) states.set(task.equipmentId, { id: task.equipmentId, freeAt: Math.max(states.get(task.equipmentId)?.freeAt ?? nowMs, finish) });
      return;
    }
    const candidates = (evaluation.eligibleMachines.get(id) ?? []).map(machine => {
      const state = states.get(machine.id)!;
      const reach = travelMinutes(machine.location, task.from) * 60000;
      const start = Math.max(earliest, state.freeAt + reach);
      return { machine, start, finish: start + task.estimatedMinutes * 60000 };
    }).sort((a, b) => {
      // 现场已有预指派的设备优先沿用；预指派设备不可用/能力不符时才改用其他候选。
      const assignedDiff = (a.machine.id === task.equipmentId ? 0 : 1) - (b.machine.id === task.equipmentId ? 0 : 1);
      return assignedDiff || a.finish - b.finish || a.machine.queue - b.machine.queue || b.machine.movesPerHour - a.machine.movesPerHour || a.machine.id.localeCompare(b.machine.id);
    });
    const selected = candidates[0];
    if (!selected) return;
    startAt.set(id, selected.start); finishAt.set(id, selected.finish); chosenMachine.set(id, selected.machine.id);
    states.set(selected.machine.id, { id: selected.machine.id, freeAt: selected.finish });
  });
  return { startAt, finishAt, chosenMachine };
}

/* ------------------------------------------------------------------ */
/* 计划构建                                                             */
/* ------------------------------------------------------------------ */

export interface BuildOptions {
  focusedEquipmentId?: string;
  hardPins?: Pin[];
  softPins?: Pin[];
  insertedIds?: Set<string>;
}

export function buildPlan(options: BuildOptions = {}): { plan: OrchestratorPlan; hardPins: Pin[]; softPins: Pin[]; stale: { taskId: string; reason: string; type: 'lock' | 'insert' }[] } {
  const nowMs = Date.now();
  const live = tasks.filter(t => t.status !== 'done');
  const graph = buildGraph(live);
  const evaluation = evaluate(live, graph, nowMs);
  const byId = new Map(live.map(t => [t.id, t]));
  const containerById = new Map(containers.map(c => [c.id, c]));

  const frozenIds = live.filter(t => t.status === 'executing').map(t => t.id).sort((a, b) => new Date(byId.get(a)!.scheduledAt).getTime() - new Date(byId.get(b)!.scheduledAt).getTime());
  const schedulableIds = live.filter(t => t.status !== 'executing' && !evaluation.hardBlockers.has(t.id)).map(t => t.id);
  const autoIds = topologicalAuto(live, graph, evaluation, frozenIds.filter(id => !evaluation.hardBlockers.has(id)));
  const baselineOrdered = [
    ...frozenIds,
    ...schedulableIds.sort((a, b) => new Date(byId.get(a)!.scheduledAt).getTime() - new Date(byId.get(b)!.scheduledAt).getTime() || a.localeCompare(b)),
  ];

  const hardPins = (options.hardPins ?? []).filter(p => byId.has(p.taskId));
  const softPins = (options.softPins ?? []).filter(p => byId.has(p.taskId) && !hardPins.some(h => h.taskId === p.taskId));
  const { order: plannedOrdered, stale } = composeOrder(autoIds, graph, hardPins, softPins);
  const simPlanned = simulate(plannedOrdered, live, graph, evaluation, nowMs);
  const simBaseline = simulate(baselineOrdered, live, graph, evaluation, nowMs);

  const baselineRank = new Map(baselineOrdered.map((id, index) => [id, index]));
  const plannedPos = new Map(plannedOrdered.map((id, index) => [id, index]));
  const lockedIds = new Set(hardPins.map(p => p.taskId));
  const insertedIds = options.insertedIds ?? new Set(softPins.map(p => p.taskId));

  const toEntry = (id: string, rank: number | null): PlanEntry => {
    const task = byId.get(id)!;
    const container = containerById.get(task.containerId);
    const blockers = evaluation.hardBlockers.get(id) ?? [];
    const warnings = evaluation.softWarnings.get(id) ?? [];
    const factorList = evaluation.factors.get(id) ?? [];
    const score = evaluation.scores.get(id) ?? null;
    const proposedMachineId = simPlanned.chosenMachine.get(id);
    const proposedMachine = equipment.find(m => m.id === proposedMachineId);
    const currentMachine = equipment.find(m => m.id === task.equipmentId);
    const start = simPlanned.startAt.get(id) ?? null;
    const finish = simPlanned.finishAt.get(id) ?? null;
    const bRank = baselineRank.get(id) ?? null;
    const mode: EntryMode = task.status === 'executing' ? 'frozen' : blockers.length ? 'blocked' : lockedIds.has(id) ? 'locked' : insertedIds.has(id) ? 'inserted' : 'auto';
    const summaryParts = factorList.filter(f => f.key === 'etd' || f.key === 'base' || f.key === 'kind' || f.key === 'downstream').slice(0, 3).map(f => f.label);
    return {
      taskId: id, kind: task.kind, containerId: task.containerId, voyageId: container?.voyageId,
      rank, baselineRank: bRank, rankDelta: rank !== null && bRank !== null ? bRank - rank : null,
      mode, score, scoreFactors: factorList, scoreSummary: summaryParts.join('；') || (blockers.length ? blockers[0] : '现场执行中，不参与重排'),
      hardBlockers: blockers, softWarnings: warnings,
      predecessors: (graph.predecessors.get(id) ?? []).map(pred => ({ taskId: pred, implicit: graph.implicitEdges.has(`${pred}->${id}`) })),
      sameContainerTasks: graph.sameContainer.get(id) ?? [],
      equipmentId: task.equipmentId, equipmentStatus: currentMachine?.status,
      proposedEquipmentId: proposedMachineId, proposedEquipmentName: proposedMachine?.name,
      startAt: start ? new Date(start).toISOString() : null,
      finishAt: finish ? new Date(finish).toISOString() : null,
      waitMinutes: start !== null && start !== undefined ? Math.round((start - nowMs) / 60000) : null,
      estimatedMinutes: task.estimatedMinutes, from: task.from, to: task.to,
    };
  };

  const sequence = plannedOrdered.map((id, index) => toEntry(id, index));
  const blockedIds = live.filter(t => !plannedPos.has(t.id)).map(t => t.id);
  const blockedLane = blockedIds.map(id => toEntry(id, null));

  // 航次影响：比较基线排序 vs 计划排序的最后作业完成时刻、ETD 余量、排名变化。
  const voyageImpacts: VoyageImpact[] = voyages.filter(v => v.status !== 'departed').map(voyage => {
    const entries = sequence.filter(e => e.voyageId === voyage.id);
    const blocked = blockedLane.filter(e => e.voyageId === voyage.id);
    const plannedFinish = entries.reduce<number | null>((max, e) => e.finishAt ? Math.max(max ?? 0, new Date(e.finishAt).getTime()) : max, null);
    const voyageTaskIds = live.filter(t => containerById.get(t.containerId)?.voyageId === voyage.id).map(t => t.id);
    const baselineFinish = voyageTaskIds.reduce<number | null>((max, id) => {
      const finish = simBaseline.finishAt.get(id); return finish ? Math.max(max ?? 0, finish) : max;
    }, null);
    const etdMs = new Date(voyage.etd).getTime();
    return {
      voyageId: voyage.id, vessel: voyage.vessel, etd: voyage.etd, etdMinutes: minutesUntil(voyage.etd, nowMs),
      remainingTasks: entries.length + blocked.length, blockedTasks: blocked.length,
      baselineFinishAt: baselineFinish ? new Date(baselineFinish).toISOString() : null,
      plannedFinishAt: plannedFinish ? new Date(plannedFinish).toISOString() : null,
      deltaMinutes: plannedFinish !== null && baselineFinish !== null ? Math.round((plannedFinish - baselineFinish) / 60000) : null,
      slackMinutes: plannedFinish !== null ? Math.round((etdMs - plannedFinish) / 60000) : null,
      projectedMiss: blocked.length > 0 || (plannedFinish !== null && plannedFinish > etdMs),
      movedEarlier: entries.filter(e => (e.rankDelta ?? 0) > 0).map(e => e.taskId),
      movedLater: entries.filter(e => (e.rankDelta ?? 0) < 0).map(e => e.taskId),
      blockedTaskIds: blocked.map(e => e.taskId),
    };
  });

  const plan: OrchestratorPlan = {
    generatedAt: new Date(nowMs).toISOString(), nowMs,
    focusedEquipmentId: options.focusedEquipmentId,
    sequence, blockedLane, voyageImpacts,
    cycles: graph.cycles.map(members => ({ members, detail: `环形依赖：${members.join(' → ')}` })),
    summary: {
      schedulable: sequence.filter(e => e.mode !== 'frozen').length,
      blocked: blockedLane.length,
      frozen: sequence.filter(e => e.mode === 'frozen').length,
      locked: lockedIds.size, inserted: insertedIds.size,
      projectedMisses: voyageImpacts.filter(v => v.projectedMiss).length,
      totalWaitMinutes: sequence.reduce((sum, e) => sum + (e.waitMinutes ?? 0), 0),
    },
    scoreLegend: [
      { factor: '航次 ETD', meaning: '离港越近分值越高，装船保船期优先于普通翻箱' },
      { factor: '箱务优先级', meaning: '危险品 18 / 冷藏 12 / 急箱 10，安全与温控约束受保护' },
      { factor: '下游传递', meaning: '前置任务按后继装船/查验的紧迫度获得加分' },
      { factor: '区块与热区', meaning: '设备就近无空驶、高热区块优先疏运给予小幅加分' },
      { factor: '硬阻塞', meaning: '环形依赖、设备不可用/能力不匹配、海关未放行的任务撤出排序' },
    ],
  };
  return { plan, hardPins, softPins, stale };
}

/* ------------------------------------------------------------------ */
/* 草稿：锁定 / 插队 / 撤销 / 漂移检测                                     */
/* ------------------------------------------------------------------ */

const drafts = new Map<string, Draft>();
const submitIndex = new Map<string, SubmitResult>(); // clientId 幂等
let sequenceId = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequenceId++).toString(36)}`;

function captureFingerprints(): Fingerprints {
  return {
    at: new Date().toISOString(),
    tasks: Object.fromEntries(tasks.map(t => [t.id, { version: versionOf(t), status: t.status }])),
    containers: Object.fromEntries(containers.map(c => [c.id, { version: versionOf(c), status: c.status }])),
    equipment: Object.fromEntries(equipment.map(e => [e.id, { version: versionOf(e), status: e.status }])),
  };
}

export function createDraft(actor = '中控调度员'): DraftView {
  const draft: Draft = { id: nextId('PLAN'), createdAt: new Date().toISOString(), createdBy: actor, edits: [], submitted: false, base: captureFingerprints() };
  drafts.set(draft.id, draft);
  auditEvents.unshift({ id: nextId('AUD'), actor, action: 'ORCHESTRATE', entity: 'plan', entityId: draft.id, at: new Date().toISOString(), details: '生成跨任务编排计划草稿' });
  return viewDraft(draft)!;
}

export function listDrafts() { return [...drafts.values()].map(d => ({ id: d.id, createdAt: d.createdAt, submitted: d.submitted, edits: d.edits.length })); }
export function getDraft(id: string) { return drafts.get(id); }

function pinsOf(draft: Draft): { hard: Pin[]; soft: Pin[]; inserted: Set<string> } {
  // 从编辑历史重放：锁定=硬钉，插队=软钉；解锁移除同任务最近一次锁定（按当前任务集的相对名次保存）。
  const hard = new Map<string, Pin>();
  const soft = new Map<string, Pin>();
  // 每次编辑发生时的名次已记录在 detail 不够结构化，这里用编辑顺序 + 最新计划重算（viewDraft 时用实际名次回填）。
  draft.edits.forEach(edit => {
    if (edit.type === 'lock') hard.set(edit.taskId, { taskId: edit.taskId, rank: rankFromDetail(edit.detail) });
    if (edit.type === 'unlock') hard.delete(edit.taskId);
    if (edit.type === 'insert') soft.set(edit.taskId, { taskId: edit.taskId, rank: rankFromDetail(edit.detail) });
  });
  return { hard: [...hard.values()], soft: [...soft.values()], inserted: new Set(soft.keys()) };
}
function rankFromDetail(detail: string): number {
  const match = detail.match(/#(\d+)/);
  return match ? Number(match[1]) : 1;
}

export function viewDraft(draft: Draft, focusedEquipmentId?: string): DraftView | undefined {
  const current = drafts.get(draft.id) ?? draft;
  const { hard, soft, inserted } = pinsOf(current);
  const built = buildPlan({ focusedEquipmentId, hardPins: hard, softPins: soft, insertedIds: inserted });
  // 用当前序列中的实际名次回写钉位，保证下次重放位置稳定。
  const posById = new Map(built.plan.sequence.map((entry, index) => [entry.taskId, index + 1]));
  current.edits = current.edits.map(edit => {
    const pos = posById.get(edit.taskId);
    if (pos === undefined) return edit;
    return { ...edit, detail: edit.detail.replace(/#\d+/, `#${pos}`) };
  });
  const drift = detectDrift(current.base);
  return { draft: current, plan: built.plan, drift, staleManipulations: built.stale };
}

function detectDrift(base: Fingerprints): { hasDrift: boolean; changes: DriftChange[] } {
  const changes: DriftChange[] = [];
  const compare = (entity: DriftChange['entity'], current: { id: string; status: string }[], baseGroup: Record<string, Fingerprint>) => {
    current.forEach(item => {
      const old = baseGroup[item.id];
      const currentVersion = entity === 'task' ? versionOf(tasks.find(t => t.id === item.id)!) : entity === 'container' ? versionOf(containers.find(c => c.id === item.id)!) : versionOf(equipment.find(e => e.id === item.id)!);
      if (!old) return;
      if (old.version !== currentVersion) changes.push({ entity, id: item.id, baseVersion: old.version, currentVersion, detail: `${labelOf(entity, item.id)} 版本 ${old.version}→${currentVersion}${old.status !== item.status ? `，状态 ${old.status}→${item.status}` : '，现场数据已更新'}` });
    });
    Object.keys(baseGroup).forEach(id => {
      const exists = current.some(item => item.id === id);
      if (!exists && isDeletedAfter(id, baseGroup[id].version)) changes.push({ entity, id, baseVersion: baseGroup[id].version, currentVersion: baseGroup[id].version + 1, detail: `${labelOf(entity, id)} 在计划生成后已被删除` });
    });
  };
  compare('task', tasks, base.tasks);
  compare('container', containers, base.containers);
  compare('equipment', equipment, base.equipment);
  return { hasDrift: changes.length > 0, changes };
}
function labelOf(entity: string, id: string) {
  if (entity === 'task') return `任务 ${id}`;
  if (entity === 'container') return `箱 ${id}`;
  return `设备 ${id}`;
}

function assertEditable(draft: Draft) {
  if (draft.submitted) throw new Error('计划已提交并部分生效，不能再编辑；如需调整请基于现场数据新建计划');
}

function currentOrder(draft: Draft) {
  const { hard, soft, inserted } = pinsOf(draft);
  return buildPlan({ hardPins: hard, softPins: soft, insertedIds: inserted });
}

export function lockTask(draftId: string, taskId: string, locked: boolean): DraftView {
  const draft = drafts.get(draftId);
  if (!draft) throw new Error('计划不存在');
  assertEditable(draft);
  if (!tasks.some(t => t.id === taskId)) throw new Error('任务不存在或已删除');
  const built = currentOrder(draft);
  const entry = built.plan.sequence.find(e => e.taskId === taskId);
  if (!entry) throw new Error(`任务 ${taskId} 当前在阻塞队列中，解除阻塞后才能锁定到执行序列`);
  if (entry.mode === 'frozen') throw new Error('任务正在现场执行，无需锁定');
  const rank = (entry.rank ?? 0) + 1;
  draft.edits = draft.edits.filter(edit => !(edit.type === 'insert' && edit.taskId === taskId));
  if (locked) draft.edits.push({ id: nextId('EDT'), at: new Date().toISOString(), type: 'lock', taskId, detail: `锁定到第 #${rank} 位，自动重排不会移动该任务` });
  else draft.edits.push({ id: nextId('EDT'), at: new Date().toISOString(), type: 'unlock', taskId, detail: `解除锁定（原 #${rank}）` });
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: locked ? 'PLAN_LOCK' : 'PLAN_UNLOCK', entity: 'yard-task', entityId: taskId, at: new Date().toISOString(), details: `计划 ${draftId}：${locked ? `锁定第 ${rank} 位` : '解除锁定'}` });
  return viewDraft(draft)!;
}

export function insertTask(draftId: string, taskId: string, beforeTaskId?: string | null): DraftView {
  const draft = drafts.get(draftId);
  if (!draft) throw new Error('计划不存在');
  assertEditable(draft);
  const built = currentOrder(draft);
  const order = built.plan.sequence;
  const index = order.findIndex(e => e.taskId === taskId);
  const target = beforeTaskId ? order.findIndex(e => e.taskId === beforeTaskId) : order.length;
  if (index < 0) throw new Error(`任务 ${taskId} 在阻塞队列中，不能插队`);
  if (beforeTaskId && target < 0) throw new Error(`锚点任务 ${beforeTaskId} 不在可执行序列中`);
  if (order[index].mode === 'locked') throw new Error(`任务 ${taskId} 已锁定在第 ${(order[index].rank ?? 0) + 1} 位，请先解除锁定再插队`);
  if (index === target || index + 1 === target) return viewDraft(draft)!;

  // 前置关系约束先于锁定边界校验：新位置必须晚于所有（传递）前驱、早于所有（传递）后继。
  const live = tasks.filter(t => t.status !== 'done');
  const graph = buildGraph(live);
  const transitive = (start: string, map: Map<string, string[]>) => {
    const result = new Set<string>(); const stack = [...(map.get(start) ?? [])];
    while (stack.length) { const node = stack.pop()!; if (!result.has(node)) { result.add(node); stack.push(...(map.get(node) ?? [])); } }
    return result;
  };
  const rankById = new Map(order.map((e, i) => [e.taskId, i]));
  const preds = transitive(taskId, graph.predecessors);
  const succs = transitive(taskId, graph.successors);
  const maxPred = Math.max(-1, ...[...preds].map(id => rankById.get(id) ?? -1));
  const minSucc = Math.min(order.length, ...[...succs].map(id => rankById.get(id) ?? order.length));
  if (target <= maxPred) throw new Error(`不能插到前置任务 ${order[maxPred]?.taskId ?? ''} 之前，前置链必须先完成`);
  if (target > minSucc) throw new Error(`不能插到后继任务 ${order[minSucc]?.taskId ?? ''} 之后，否则会阻断下游作业`);

  // 锁定项是不可跨越的边界：插队只能在相邻两个锁定项之间的区间内移动。
  const lockedRanks = order.filter(e => e.mode === 'locked').map(e => e.rank!);
  const nearestBelow = Math.max(-1, ...lockedRanks.filter(r => r < index));
  const nearestAbove = Math.min(order.length, ...lockedRanks.filter(r => r > index));
  if (target <= nearestBelow || target >= nearestAbove) throw new Error(`插队不能越过已锁定的任务（可移动区间：第 ${nearestBelow + 2} 位 ~ 第 ${nearestAbove} 位）`);
  // 不能插到另一个锁定任务的位置上把它顶开（业务约束通过后再检查锚点锁定状态）。
  if (beforeTaskId && order[target]?.mode === 'locked') throw new Error(`锚点任务 ${beforeTaskId} 已锁定，不能插到它前面；请先解除该锁定`);

  draft.edits.push({ id: nextId('EDT'), at: new Date().toISOString(), type: 'insert', taskId, beforeTaskId: beforeTaskId ?? undefined, detail: `手动插队到第 #${target + (target <= index ? 1 : 0)} 位（${beforeTaskId ? `置于 ${beforeTaskId} 之前` : '置于队尾'}）` });
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: 'PLAN_INSERT', entity: 'yard-task', entityId: taskId, at: new Date().toISOString(), details: `计划 ${draftId}：${taskId} 插队${beforeTaskId ? ` 至 ${beforeTaskId} 之前` : ' 至队尾'}` });
  return viewDraft(draft)!;
}

export function undoLastEdit(draftId: string): DraftView {
  const draft = drafts.get(draftId);
  if (!draft) throw new Error('计划不存在');
  assertEditable(draft);
  const edit = draft.edits.pop();
  if (!edit) throw new Error('没有可撤销的人工调整');
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: 'PLAN_UNDO', entity: 'plan', entityId: draftId, at: new Date().toISOString(), details: `撤销人工调整：${edit.detail}` });
  return viewDraft(draft)!;
}

export function rebaseDraft(draftId: string): DraftView {
  const draft = drafts.get(draftId);
  if (!draft) throw new Error('计划不存在');
  assertEditable(draft);
  draft.base = captureFingerprints();
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: 'PLAN_REBASE', entity: 'plan', entityId: draftId, at: new Date().toISOString(), details: '采用现场最新状态重算漂移基线，保留锁定与插队' });
  return viewDraft(draft)!;
}

export function discardDraft(draftId: string) {
  const draft = drafts.get(draftId);
  if (!draft) return undefined;
  drafts.delete(draftId);
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: 'PLAN_DISCARD', entity: 'plan', entityId: draftId, at: new Date().toISOString(), details: `撤销并丢弃编排计划（含 ${draft.edits.length} 项人工调整，未对现场下发）` });
  return true;
}

/* ------------------------------------------------------------------ */
/* 计划提交：过期检查 + 部分应用 + 幂等                                    */
/* ------------------------------------------------------------------ */

export function submitPlan(draftId: string, clientId?: string): SubmitResult {
  if (clientId && submitIndex.has(clientId)) return submitIndex.get(clientId)!;
  const draft = drafts.get(draftId);
  if (!draft) throw new Error('计划不存在');
  if (draft.submitted && draft.submitResult) return draft.submitResult;

  const view = viewDraft(draft)!;
  const plan = view.plan;
  const baseAt = draft.base;
  const applied: AppliedItem[] = [];
  const rejected: RejectedItem[] = [];
  const rejectedIds = new Set<string>();
  const liveById = new Map(tasks.map(t => [t.id, t]));
  const containerById = new Map(containers.map(c => [c.id, c]));

  // 第一遍：逐条校验，绝不覆盖现场正在执行的任务。
  plan.sequence.forEach(entry => {
    const reject = (reason: string, currentStatus = 'missing', currentVersion = 0) => {
      rejected.push({ taskId: entry.taskId, reason, currentStatus, baseVersion: baseAt.tasks[entry.taskId]?.version ?? 0, currentVersion });
      rejectedIds.add(entry.taskId);
    };
    const task = liveById.get(entry.taskId);
    if (!task) { reject('计划生成后该任务已被删除'); return; }
    const currentVersion = versionOf(task);
    const baseVersion = baseAt.tasks[entry.taskId]?.version;
    if (baseVersion !== undefined && baseVersion !== currentVersion) { reject(`排序基于过期版本 v${baseVersion}，现场任务已变更为 v${currentVersion}（${task.status}），拒绝覆盖`, task.status, currentVersion); return; }
    if (task.status === 'executing' || task.status === 'done') { reject(`现场正在${task.status === 'executing' ? '执行' : '已完成'}该任务，过期排序不能覆盖`, task.status, currentVersion); return; }
    const container = containerById.get(task.containerId);
    if (container && baseAt.containers[container.id] && versionOf(container) !== baseAt.containers[container.id].version) { reject(`关联箱 ${container.id} 状态已变化（${baseAt.containers[container.id].status}→${container.status}），请基于现场重算`, task.status, currentVersion); return; }
    // 关联设备漂移同样拒发，避免把过期的设备判断下发给不可用设备
    const assigned = equipment.find(m => m.id === task.equipmentId);
    if (assigned && baseAt.equipment[assigned.id] && versionOf(assigned) !== baseAt.equipment[assigned.id].version) { reject(`指派设备 ${assigned.name} 状态已变化（${baseAt.equipment[assigned.id].status}→${assigned.status}），请基于现场重算`, task.status, currentVersion); return; }
    if (entry.hardBlockers.length) { reject(`仍存在阻塞：${entry.hardBlockers.join('；')}`, task.status, currentVersion); return; }
  });

  // 第二遍：按计划顺序应用，任何单项异常都不影响其他项（部分应用）。
  plan.sequence.forEach(entry => {
    if (rejectedIds.has(entry.taskId)) return;
    const task = liveById.get(entry.taskId)!;
    // 前置任务若在本计划中被拒，本任务一并拒绝，保持链完整。
    const failedPred = entry.predecessors.find(pred => rejectedIds.has(pred.taskId));
    if (failedPred) { rejected.push({ taskId: entry.taskId, reason: `前置任务 ${failedPred.taskId} 未被纳入本次下发，暂缓本任务`, currentStatus: task.status, baseVersion: baseAt.tasks[task.id]?.version ?? 0, currentVersion: versionOf(task) }); rejectedIds.add(entry.taskId); return; }
    try {
      if (entry.startAt) task.scheduledAt = entry.startAt;
      if (entry.proposedEquipmentId) {
        const machine = equipment.find(m => m.id === entry.proposedEquipmentId);
        if (machine && (machine.status === 'available' || machine.status === 'working')) {
          task.equipmentId = machine.id;
          if (task.status === 'queued') task.status = 'assigned';
        }
      }
      bumpVersion(task);
      applied.push({ taskId: task.id, rank: entry.rank ?? 0, scheduledAt: task.scheduledAt, ...(task.equipmentId ? { equipmentId: task.equipmentId } : {}) });
    } catch (error) {
      rejected.push({ taskId: entry.taskId, reason: `应用失败：${error instanceof Error ? error.message : '未知错误'}`, currentStatus: task.status, baseVersion: baseAt.tasks[task.id]?.version ?? 0, currentVersion: versionOf(task) });
      rejectedIds.add(entry.taskId);
    }
  });

  // 第三遍：阻塞队列中的任务不会被下发，但必须在提交回执中逐条说明原因，
  // 尤其是计划生成后因箱/设备状态漂移而新落入阻塞队列的任务。
  plan.blockedLane.forEach(entry => {
    const task = liveById.get(entry.taskId);
    if (!task) { rejected.push({ taskId: entry.taskId, reason: '计划生成后该任务已被删除', currentStatus: 'missing', baseVersion: baseAt.tasks[entry.taskId]?.version ?? 0, currentVersion: 0 }); return; }
    const container = containerById.get(task.containerId);
    const containerDrift = container && baseAt.containers[container.id] && versionOf(container) !== baseAt.containers[container.id].version;
    const reason = containerDrift
      ? `关联箱 ${container!.id} 状态已变化（${baseAt.containers[container!.id].status}→${container!.status}），且任务当前处于阻塞队列，请基于现场重算`
      : `未下发：仍在阻塞队列（${entry.hardBlockers.join('；')}）`;
    rejected.push({ taskId: entry.taskId, reason, currentStatus: task.status, baseVersion: baseAt.tasks[task.id]?.version ?? 0, currentVersion: versionOf(task) });
  });

  const result: SubmitResult = {
    planId: draft.id, ...(clientId ? { clientId } : {}),
    status: applied.length === 0 ? 'rejected' : rejected.length === 0 ? 'applied' : 'partial',
    at: new Date().toISOString(), applied, rejected,
  };
  draft.submitted = true; draft.submitResult = result;
  if (clientId) submitIndex.set(clientId, result);
  auditEvents.unshift({ id: nextId('AUD'), actor: draft.createdBy, action: 'PLAN_SUBMIT', entity: 'plan', entityId: draft.id, at: result.at, details: `下发 ${applied.length} 项，拒绝 ${rejected.length} 项（${result.status}）` });
  return result;
}
