export type ContainerStatus = 'in-transit' | 'at-gate' | 'in-yard' | 'on-quay' | 'released' | 'hold';
export type EquipmentKind = 'quay-crane' | 'yard-crane' | 'terminal-truck' | 'reach-stacker';
export type TaskStatus = 'queued' | 'assigned' | 'executing' | 'blocked' | 'done';
export type AppointmentStatus = 'booked' | 'checked-in' | 'completed' | 'cancelled' | 'exception';

export interface Voyage { id: string; vessel: string; imo: string; service: string; eta: string; etd: string; status: 'approaching' | 'berthed' | 'loading' | 'departed'; berth: string; movesPlanned: number; movesDone: number; lateRisk: 'low' | 'medium' | 'high'; }
export interface Container { id: string; voyageId: string; size: '20' | '40' | '45'; isoType: string; direction: 'import' | 'export' | 'transshipment'; status: ContainerStatus; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released' | 'inspection' | 'hold'; priority: 'normal' | 'hot' | 'reefer' | 'hazmat'; yardSlot: string; appointmentId?: string; lastEvent: string; }
export interface YardBlock { id: string; zone: string; rows: number; tiers: number; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; equipment: EquipmentKind[]; heat: number; }
export interface GateAppointment { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup' | 'dropoff'; windowStart: string; windowEnd: string; lane: 'north' | 'south' | 'rail'; status: AppointmentStatus; sealVerified: boolean; weightVerified: boolean; exception?: string; }
export interface Equipment { id: string; name: string; kind: EquipmentKind; status: 'available' | 'working' | 'maintenance' | 'offline'; location: string; battery: number; queue: number; movesPerHour: number; }
export interface YardTask { id: string; kind: 'receive' | 'deliver' | 'rehandle' | 'load' | 'discharge' | 'inspect'; containerId: string; from: string; to: string; equipmentId?: string; priority: number; status: TaskStatus; scheduledAt: string; blockingReasons: string[]; estimatedMinutes: number; dependsOn?: string[]; planId?: string; planOrder?: number; }
export interface AuditEvent { id: string; actor: string; action: string; entity: string; entityId: string; at: string; details: string; }

export type PlanStatus = 'draft' | 'submitted' | 'undone';
export type IssueSeverity = 'critical' | 'warning' | 'info';
export interface PlanFactor { code: string; label: string; weight: number; detail: string }
export interface PlanIssue { severity: IssueSeverity; code: string; message: string; taskIds: string[] }
export interface OrchestrationControl { id: string; type: 'lock' | 'insert'; taskId: string; position?: number; beforeTaskId?: string; at: string }
export interface PlanSnapshot { taskId: string; taskStatus: TaskStatus; taskPriority: number; scheduledAt: string; blockingReasons: string[]; dependsOn: string[]; containerId: string; containerStatus: ContainerStatus; containerCustoms: Container['customs']; equipmentId?: string; equipmentStatus?: Equipment['status']; fingerprint: string }
export interface OrchestrationStep { taskId: string; rank: number | null; baselineRank: number | null; rankDelta: number; containerId: string; voyageId?: string; kind: YardTask['kind']; status: TaskStatus; from: string; to: string; urgencyScore: number; factors: PlanFactor[]; hardBlocked: boolean; executableNow: boolean; reasons: string[]; warnings: string[]; prerequisiteTaskIds: string[]; sameContainerTaskIds: string[]; cycleTaskIds: string[]; currentEquipmentId?: string; proposedEquipmentId?: string; proposedEquipmentName?: string; proposedEquipmentStatus?: Equipment['status']; blockId?: string; lockedPosition?: number; insertedBeforeTaskId?: string; scheduledStartAt?: string; scheduledEndAt?: string }
export interface VoyageImpact { voyageId: string; vessel: string; etd: string; remainingMoves: number; loadTaskCount: number; blockedTaskCount: string[]; baselineFinishAt?: string; plannedFinishAt?: string; baselineDelayMinutes: number; plannedDelayMinutes: number; delayDeltaMinutes: number; risk: Voyage['lateRisk'] }
export interface OrchestrationPlan { id: string; status: PlanStatus; createdAt: string; updatedAt: string; submittedAt?: string; undoneAt?: string; clientToken?: string; domainRevision: number; controls: OrchestrationControl[]; steps: OrchestrationStep[]; voyageImpacts: VoyageImpact[]; issues: PlanIssue[]; snapshots: PlanSnapshot[]; appliedSnapshots?: PlanSnapshot[] }
export interface PlanSubmissionResult { plan: OrchestrationPlan; status: 'submitted' | 'duplicate' | 'conflict'; message: string; conflicts: PlanIssue[]; applied: number; skipped: number }

const start = Date.now(); const iso = (minutes: number) => new Date(start + minutes * 60000).toISOString();
export const voyages: Voyage[] = [
  { id: 'VOY-AX7', vessel: 'MSC Aurora', imo: 'IMO9382014', service: 'AE-3', eta: iso(-90), etd: iso(350), status: 'berthed', berth: 'B07', movesPlanned: 1240, movesDone: 886, lateRisk: 'medium' },
  { id: 'VOY-QF2', vessel: 'Ever Quartz', imo: 'IMO9721103', service: 'TP9', eta: iso(190), etd: iso(890), status: 'approaching', berth: 'B04', movesPlanned: 760, movesDone: 0, lateRisk: 'high' },
  { id: 'VOY-RD8', vessel: 'ONE Redwood', imo: 'IMO9812340', service: 'PNW', eta: iso(-700), etd: iso(-330), status: 'departed', berth: 'B02', movesPlanned: 520, movesDone: 520, lateRisk: 'low' }
];
export const blocks: YardBlock[] = [
  { id: 'A01', zone: 'North Import', rows: 14, tiers: 5, capacity: 280, occupied: 247, reeferPlugs: 18, usedPlugs: 16, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 78 },
  { id: 'B07', zone: 'Central Transshipment', rows: 18, tiers: 5, capacity: 360, occupied: 302, reeferPlugs: 24, usedPlugs: 19, hazmatAllowed: true, equipment: ['yard-crane', 'reach-stacker', 'terminal-truck'], heat: 91 },
  { id: 'C03', zone: 'Export Pre-staging', rows: 12, tiers: 4, capacity: 192, occupied: 128, reeferPlugs: 8, usedPlugs: 3, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 54 },
  { id: 'D05', zone: 'Inspection & Hold', rows: 8, tiers: 3, capacity: 96, occupied: 72, reeferPlugs: 5, usedPlugs: 4, hazmatAllowed: true, equipment: ['reach-stacker'], heat: 63 }
];
export const containers: Container[] = [
  { id: 'MSCU-4829017', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: 22.4, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'A01-R07-T3', lastEvent: '卸船完成 08:42' },
  { id: 'EISU-1288420', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 27.8, reefer: true, temperature: -18, customs: 'released', priority: 'reefer', yardSlot: 'B07-R03-T2', lastEvent: '温度回传正常 08:51' },
  { id: 'TGHU-9831204', voyageId: 'VOY-AX7', size: '20', isoType: '22K2', direction: 'transshipment', status: 'hold', weightT: 19.7, reefer: false, hazmatClass: '3', customs: 'inspection', priority: 'hazmat', yardSlot: 'D05-R02-T1', lastEvent: '海关查验挂起' },
  { id: 'OOLU-7734201', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'export', status: 'at-gate', weightT: 24.1, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R06-T1', appointmentId: 'APT-9001', lastEvent: '南闸口已称重' },
  { id: 'CMAU-6001722', voyageId: 'VOY-QF2', size: '40', isoType: '45G1', direction: 'import', status: 'in-transit', weightT: 23.5, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'B07-R10-T1', lastEvent: '船期 ETA +35min' },
  { id: 'FCIU-9920310', voyageId: 'VOY-QF2', size: '20', isoType: '22G1', direction: 'export', status: 'in-yard', weightT: 12.2, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R04-T2', lastEvent: '待装船' },
  { id: 'TEMU-1774029', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 26.3, reefer: true, temperature: 4, customs: 'inspection', priority: 'reefer', yardSlot: 'D05-R05-T1', lastEvent: '待海关查验' }
];
export const appointments: GateAppointment[] = [
  { id: 'APT-9001', containerId: 'OOLU-7734201', truckNo: '沪A·7K229', driver: '陈海', type: 'dropoff', windowStart: iso(-14), windowEnd: iso(16), lane: 'south', status: 'checked-in', sealVerified: true, weightVerified: true },
  { id: 'APT-9002', containerId: 'MSCU-4829017', truckNo: '苏E·66218', driver: '王建国', type: 'pickup', windowStart: iso(34), windowEnd: iso(64), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9003', containerId: 'EISU-1288420', truckNo: '沪B·02891', driver: '赵晨', type: 'pickup', windowStart: iso(38), windowEnd: iso(68), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9004', containerId: 'FCIU-9920310', truckNo: '沪A·7K229', driver: '陈海', type: 'pickup', windowStart: iso(4), windowEnd: iso(22), lane: 'south', status: 'booked', sealVerified: false, weightVerified: false, exception: '同一车辆相邻窗口过短' }
];
export const equipment: Equipment[] = [
  { id: 'QC-07', name: '岸桥 QC-07', kind: 'quay-crane', status: 'working', location: 'B07 / MSC Aurora', battery: 96, queue: 4, movesPerHour: 31 },
  { id: 'YC-12', name: '场桥 YC-12', kind: 'yard-crane', status: 'working', location: 'B07-R03', battery: 72, queue: 9, movesPerHour: 24 },
  { id: 'YC-05', name: '场桥 YC-05', kind: 'yard-crane', status: 'available', location: 'C03-R06', battery: 88, queue: 3, movesPerHour: 27 },
  { id: 'TT-31', name: '集卡 TT-31', kind: 'terminal-truck', status: 'working', location: '南闸口', battery: 61, queue: 2, movesPerHour: 8 },
  { id: 'RS-02', name: '正面吊 RS-02', kind: 'reach-stacker', status: 'maintenance', location: 'D05', battery: 34, queue: 0, movesPerHour: 14 },
  { id: 'RS-05', name: '正面吊 RS-05', kind: 'reach-stacker', status: 'available', location: 'D05-R01', battery: 83, queue: 1, movesPerHour: 16 }
];
export const tasks: YardTask[] = [
  { id: 'TASK-101', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', equipmentId: 'YC-12', priority: 92, status: 'assigned', scheduledAt: iso(12), blockingReasons: [], estimatedMinutes: 18 },
  { id: 'TASK-102', kind: 'rehandle', containerId: 'EISU-1288420', from: 'B07-R03-T2', to: 'D05-R05-T1', equipmentId: 'YC-12', priority: 88, status: 'queued', scheduledAt: iso(24), blockingReasons: ['查验区插件余量接近阈值'], estimatedMinutes: 26 },
  { id: 'TASK-103', kind: 'inspect', containerId: 'TGHU-9831204', from: 'D05-R02-T1', to: 'D05-R02-T1', priority: 125, status: 'blocked', scheduledAt: iso(4), blockingReasons: ['RS-02 维护中', '待海关查验窗口'], estimatedMinutes: 32 },
  { id: 'TASK-104', kind: 'load', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'B07 / VOY-QF2', equipmentId: 'QC-07', priority: 75, status: 'queued', scheduledAt: iso(210), blockingReasons: [], estimatedMinutes: 21 },
  { id: 'TASK-105', kind: 'receive', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R06-T1', equipmentId: 'TT-31', priority: 70, status: 'assigned', scheduledAt: iso(6), blockingReasons: [], estimatedMinutes: 16 },
  { id: 'TASK-106', kind: 'load', containerId: 'OOLU-7734201', from: 'C03-R06-T1', to: 'B07 / VOY-AX7', equipmentId: 'QC-07', priority: 94, status: 'queued', scheduledAt: iso(92), blockingReasons: [], estimatedMinutes: 20, dependsOn: ['TASK-105'] }
];
export const auditEvents: AuditEvent[] = [{ id: 'AUD-500', actor: '中控调度员', action: 'REPLAN', entity: 'voyage', entityId: 'VOY-AX7', at: new Date(start - 20 * 60000).toISOString(), details: '因 QC-07 瞬时降速，重新计算 14 个高优先级作业' }];

let domainRevision = 0;
export const orchestrationPlans: OrchestrationPlan[] = [];
const submissionResultByToken = new Map<string, PlanSubmissionResult>();
function bumpDomainRevision() { domainRevision += 1; }
bumpDomainRevision();

function parseSlot(slot: string) { const match = slot.match(/^([A-Z]\d\d)-/); return match?.[1]; }

const equipmentForTask: Record<YardTask['kind'], EquipmentKind> = {
  receive: 'terminal-truck',
  deliver: 'yard-crane',
  rehandle: 'yard-crane',
  load: 'quay-crane',
  discharge: 'quay-crane',
  inspect: 'reach-stacker'
};
const taskTypeUrgency: Record<YardTask['kind'], number> = { inspect: 100, load: 95, discharge: 85, receive: 72, deliver: 62, rehandle: 55 };
const boxPriorityUrgency: Record<Container['priority'], number> = { hazmat: 100, reefer: 86, hot: 76, normal: 46 };
const minutes = (from: string | Date, to: string | Date) => (new Date(to).getTime() - new Date(from).getTime()) / 60000;
const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
function findCycle(graph: Map<string, string[]>) {
  const seen = new Set<string>(), stack = new Set<string>(), trail: string[] = [];
  const visit = (id: string): string[] | undefined => {
    if (stack.has(id)) return [...trail.slice(trail.indexOf(id)), id];
    if (seen.has(id)) return undefined;
    seen.add(id); stack.add(id); trail.push(id);
    for (const next of graph.get(id) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.delete(id); trail.pop();
    return undefined;
  };
  for (const id of graph.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return undefined;
}
export function detectTaskDependencyCycle(extraEdge?: { taskId: string; dependsOn: string }) {
  const graph = new Map(tasks.filter(task => task.status !== 'done').map(task => [task.id, [...(task.dependsOn ?? [])]]));
  if (extraEdge) graph.set(extraEdge.taskId, [...(graph.get(extraEdge.taskId) ?? []), extraEdge.dependsOn]);
  return findCycle(graph);
}
function taskSnapshot(task: YardTask): PlanSnapshot {
  const container = containers.find(item => item.id === task.containerId);
  const machine = task.equipmentId ? equipment.find(item => item.id === task.equipmentId) : undefined;
  const snapshot: PlanSnapshot = {
    taskId: task.id, taskStatus: task.status, taskPriority: task.priority, scheduledAt: task.scheduledAt,
    blockingReasons: [...task.blockingReasons], dependsOn: [...(task.dependsOn ?? [])],
    containerId: task.containerId, containerStatus: container?.status ?? 'hold', containerCustoms: container?.customs ?? 'hold',
    ...(task.equipmentId ? { equipmentId: task.equipmentId } : {}), ...(machine ? { equipmentStatus: machine.status } : {}),
    fingerprint: ''
  };
  snapshot.fingerprint = stableHash(JSON.stringify([snapshot.taskStatus, snapshot.taskPriority, snapshot.scheduledAt, snapshot.blockingReasons, snapshot.dependsOn, snapshot.containerId, snapshot.containerStatus, snapshot.containerCustoms, snapshot.equipmentId ?? '', snapshot.equipmentStatus ?? '']));
  return snapshot;
}
type TaskAnalysis = {
  task: YardTask; container?: Container; voyage?: Voyage; block?: ReturnType<typeof blocks.find>;
  prerequisiteIds: string[]; sameContainerIds: string[]; cycleIds: string[];
  hardReasons: string[]; warningReasons: string[]; equipmentReasons: string[]; waits: string[];
  requiredKind: EquipmentKind; currentMachine?: Equipment; proposedMachine?: Equipment;
};
function lifecycleOrder(task: YardTask | YardTask['kind']) { const kind = typeof task === 'string' ? task : task.kind; return { receive: 1, inspect: 2, rehandle: 2, discharge: 3, deliver: 4, load: 5 }[kind]; }
function analyzeTasks(controls: OrchestrationControl[], includeManualEdge = true) {
  const active = tasks.filter(task => task.status !== 'done');
  const byId = new Map(active.map(task => [task.id, task]));
  const manualEdges = includeManualEdge ? controls.filter(control => control.type === 'insert' && byId.has(control.taskId) && control.beforeTaskId && byId.has(control.beforeTaskId)) : [];
  const graph = new Map<string, string[]>();
  active.forEach(task => graph.set(task.id, (task.dependsOn ?? []).filter(id => byId.has(id))));
  const sameContainerPairs: [string, string][] = [];
  const byContainer = new Map<string, YardTask[]>();
  active.forEach(task => { const list = byContainer.get(task.containerId) ?? []; list.push(task); byContainer.set(task.containerId, list); });
  byContainer.forEach(list => {
    const ordered = [...list].sort((a, b) => lifecycleOrder(a) - lifecycleOrder(b) || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() || a.priority - b.priority || a.id.localeCompare(b.id));
    ordered.forEach((task, index) => ordered.slice(index + 1).forEach(next => {
      graph.get(next.id)?.push(task.id); sameContainerPairs.push([task.id, next.id]);
    }));
  });
  manualEdges.forEach(control => graph.get(control.beforeTaskId as string)?.push(control.taskId));
  const cyclePath = findCycle(graph);
  const cycleIds = cyclePath ? [...new Set(cyclePath)] : [];
  const cycleSet = new Set(cycleIds);
  const analyses = new Map<string, TaskAnalysis>();
  active.forEach(task => {
    const container = containers.find(item => item.id === task.containerId);
    const voyage = container ? voyages.find(item => item.id === container.voyageId) : undefined;
    const blockId = parseSlot(task.from) ?? parseSlot(task.to);
    const block = blockId ? blocks.find(item => item.id === blockId) : undefined;
    const currentMachine = task.equipmentId ? equipment.find(item => item.id === task.equipmentId) : undefined;
    const requiredKind = equipmentForTask[task.kind];
    const prerequisiteIds = [...new Set([...(task.dependsOn ?? []).filter(id => byId.has(id))])];
    // 同箱互斥边与人工前置边共同决定可执行时刻；这里保留同箱前驱作为解释信息。
    const incomingSameContainer = sameContainerPairs.filter(([, to]) => to === task.id).map(([from]) => from);
    prerequisiteIds.push(...incomingSameContainer);
    analyses.set(task.id, { task, container, voyage, block, prerequisiteIds: [...new Set(prerequisiteIds)], sameContainerIds: active.filter(item => item.containerId === task.containerId && item.id !== task.id).map(item => item.id), cycleIds, hardReasons: [], warningReasons: [], equipmentReasons: [], waits: [], requiredKind, currentMachine });
  });
  active.forEach(task => {
    const analysis = analyses.get(task.id)!;
    if (cycleSet.has(task.id)) analysis.hardReasons.push(`前置依赖成环：${cycleIds.join(' → ')}`);
    task.blockingReasons.forEach(reason => {
      if (reason.includes('接近阈值')) analysis.warningReasons.push(reason);
      else if (/维护中|离线|设备/.test(reason)) analysis.equipmentReasons.push(reason);
      else analysis.hardReasons.push(reason);
    });
    if (!analysis.container) analysis.hardReasons.push('关联箱号不存在或已删除');
    if (analysis.container && ['load', 'deliver'].includes(task.kind) && analysis.container.customs !== 'released') analysis.hardReasons.push(`箱子海关状态为 ${analysis.container.customs}，不能${task.kind === 'load' ? '装船' : '提箱交付'}`);
    if (task.kind === 'inspect' && analysis.container && !['inspection', 'hold'].includes(analysis.container.customs)) analysis.warningReasons.push('海关已放行，查验任务可能可以关闭');
    const requiredStatus: Partial<Record<YardTask['kind'], ContainerStatus[]>> = { receive: ['at-gate'], deliver: ['in-yard', 'on-quay'], load: ['in-yard', 'on-quay'], discharge: ['on-quay', 'in-yard'], rehandle: ['in-yard', 'hold'], inspect: ['in-yard', 'hold', 'at-gate'] };
    if (analysis.container && !requiredStatus[task.kind]?.includes(analysis.container.status)) {
      const incomingReceive = analyses.get(analysis.prerequisiteIds.find(preId => analyses.get(preId)?.task.kind === 'receive' && analyses.get(preId)?.task.containerId === task.containerId) ?? '');
      if (task.kind === 'load' && incomingReceive) analysis.warningReasons.push(`${task.containerId} 仍在闸口，完成前置 ${incomingReceive.task.id} 后进入可装船状态`);
      else analysis.hardReasons.push(`箱子状态 ${analysis.container.status} 不满足 ${task.kind} 作业要求`);
    }
    if (analysis.voyage?.status === 'departed' && ['load', 'discharge'].includes(task.kind)) analysis.hardReasons.push(`航次 ${analysis.voyage.id} 已离港`);
    if (analysis.voyage && ['load', 'discharge'].includes(task.kind) && new Date(analysis.voyage.eta).getTime() > Date.now()) analysis.waits.push(`等待航次 ${analysis.voyage.id} ETA`);
    if (analysis.currentMachine && analysis.currentMachine.kind !== analysis.requiredKind) analysis.equipmentReasons.push(`${analysis.currentMachine.name} 是${analysis.currentMachine.kind}，本任务需要 ${analysis.requiredKind}`);
    if (analysis.currentMachine && ['maintenance', 'offline'].includes(analysis.currentMachine.status)) analysis.equipmentReasons.push(`${analysis.currentMachine.name} 当前${analysis.currentMachine.status === 'maintenance' ? '维护中' : '离线'}`);
    if (analysis.block) {
      if (analysis.block.heat >= 85) analysis.warningReasons.push(`${analysis.block.id} 区块热度 ${analysis.block.heat}，通行/翻倒垛风险高`);
      if (analysis.container?.reefer && analysis.block.reeferPlugs - analysis.block.usedPlugs <= 2) analysis.warningReasons.push(`${analysis.block.id} 冷插位仅剩 ${analysis.block.reeferPlugs - analysis.block.usedPlugs} 个`);
    }
  });
  const propagated = new Set<string>();
  const propagate = (id: string): boolean => {
    if (propagated.has(id)) return analyses.get(id)?.hardReasons.length !== 0;
    propagated.add(id);
    const analysis = analyses.get(id);
    if (!analysis) return false;
    analysis.prerequisiteIds.forEach(preId => {
      const pre = analyses.get(preId);
      if (pre && (propagate(preId) || cycleSet.has(preId))) analysis.hardReasons.push(`前置任务 ${preId} 尚未解除阻塞`);
    });
    return analysis.hardReasons.length !== 0;
  };
  active.forEach(task => propagate(task.id));
  active.forEach(task => {
    const analysis = analyses.get(task.id)!;
    const capable = equipment.filter(machine => machine.kind === analysis.requiredKind);
    if (analysis.currentMachine && analysis.currentMachine.kind === analysis.requiredKind && !['maintenance', 'offline'].includes(analysis.currentMachine.status)) analysis.proposedMachine = analysis.currentMachine;
    if (!analysis.proposedMachine) analysis.proposedMachine = capable.filter(machine => machine.status === 'available').sort((a, b) => a.queue - b.queue || b.movesPerHour - a.movesPerHour)[0] ?? capable.find(machine => machine.status === 'working');
    if (!analysis.proposedMachine) analysis.hardReasons.push(...analysis.equipmentReasons, `没有可用的 ${analysis.requiredKind} 设备`);
    else if (analysis.equipmentReasons.length) {
      analysis.warningReasons.push(...analysis.equipmentReasons, `建议改用 ${analysis.proposedMachine.name}`);
    }
  });
  return { active, byId, graph, manualEdges, cyclePath, cycleIds, analyses };
}
function scoreTask(analysis: TaskAnalysis, rankState: { scheduled: Set<string> }, controls: OrchestrationControl[], timelineReady: boolean) {
  const task = analysis.task;
  const now = Date.now();
  const etdMs = analysis.voyage ? new Date(analysis.voyage.etd).getTime() : now + 12 * 3600000;
  const hours = (etdMs - now) / 3600000;
  const etdValue = analysis.voyage?.status === 'departed' ? 0 : hours < 0 ? 110 : hours <= 1 ? 100 : hours <= 3 ? 90 : hours <= 6 ? 72 : hours <= 12 ? 48 : 24;
  const prereqUnfinished = analysis.prerequisiteIds.some(id => !rankState.scheduled.has(id));
  const hardBlocked = analysis.hardReasons.length > 0;
  const readiness = hardBlocked ? 0 : prereqUnfinished || !timelineReady ? 52 : 100;
  const controlled = controls.some(control => control.taskId === task.id) ? 100 : 0;
  const factors: PlanFactor[] = [
    { code: 'etd', label: '航节ETD压力', weight: 30, detail: analysis.voyage ? `${analysis.voyage.id} 距 ETD ${Math.round(hours * 10) / 10} 小时` : '未关联在港航次' },
    { code: 'container-priority', label: '箱务优先级', weight: 15, detail: `${analysis.container?.priority ?? 'unknown'} / 海关 ${analysis.container?.customs ?? 'unknown'}` },
    { code: 'task-kind', label: '任务类型', weight: 15, detail: `${task.kind} 任务基础紧急度` },
    { code: 'task-priority', label: '单任务评分', weight: 15, detail: `现场优先级 ${task.priority}/100` },
    { code: 'block-location', label: '区块位置', weight: 5, detail: analysis.block ? `${analysis.block.id} · 热度 ${analysis.block.heat}` : '未识别堆场区块' },
    { code: 'manual-control', label: '锁定/插队承诺', weight: 10, detail: controlled ? '调度员已人工调整' : '无人工调整' },
    { code: 'readiness', label: '前置与设备就绪度', weight: 10, detail: hardBlocked ? '存在硬阻塞' : prereqUnfinished ? '等待前置任务' : '当前可执行' }
  ];
  const values = [etdValue, boxPriorityUrgency[analysis.container?.priority ?? 'normal'], taskTypeUrgency[task.kind], task.priority, analysis.block?.heat ?? 40, controlled, readiness];
  let score = factors.reduce((sum, factor, index) => sum + factor.weight * values[index], 0) / 100;
  if (hardBlocked) score = Math.max(0, score - 80);
  return { score: Math.round(score), factors, hardBlocked, prereqUnfinished };
}
function rankTasks(controls: OrchestrationControl[], baseline = false) {
  const context = analyzeTasks(baseline ? [] : controls);
  const locks = new Map<number, string>();
  if (!baseline) controls.filter(control => control.type === 'lock' && context.byId.has(control.taskId) && control.position !== undefined).forEach(control => locks.set(control.position! - 1, control.taskId));
  const scheduled = new Set<string>();
  const order: string[] = [];
  const issues: PlanIssue[] = [];
  const state = { scheduled };
  while (scheduled.size < context.active.length) {
    const ready = context.active.filter(task => !scheduled.has(task.id) && !context.cycleIds.includes(task.id) && (context.graph.get(task.id) ?? []).every(pre => scheduled.has(pre) || !context.byId.has(pre)));
    if (!ready.length) break;
    const position = order.length;
    const lockedId = locks.get(position);
    let chosen: YardTask | undefined;
    if (lockedId) {
      chosen = ready.find(task => task.id === lockedId);
      if (!chosen) {
        const target = context.byId.get(lockedId);
        issues.push({ severity: 'critical', code: 'LOCK_IMPOSSIBLE', message: `锁定位置 ${position + 1} 的 ${lockedId} 仍有前置/同箱任务未完成，已暂时忽略该锁`, taskIds: target ? [lockedId, ...(context.analyses.get(lockedId)?.prerequisiteIds ?? [])] : [lockedId] });
        locks.delete(position);
      }
    }
    if (!chosen) {
      const forced = ready.filter(task => context.manualEdges.some(edge => edge.beforeTaskId === task.id));
      const pool = forced.length ? forced : ready;
      const ranked = pool.map(task => {
        const analysis = context.analyses.get(task.id)!;
        const scored = scoreTask(analysis, state, baseline ? [] : controls, true);
        const fixedCommitment = ['assigned', 'executing'].includes(task.status) && !analysis.hardReasons.length ? 250 : 0;
        return { task, scored: { ...scored, score: scored.score + fixedCommitment } };
      });
      chosen = ranked.sort((a, b) => b.scored.score - a.scored.score || a.task.scheduledAt.localeCompare(b.task.scheduledAt) || a.task.id.localeCompare(b.task.id))[0]?.task;
    }
    if (!chosen) break;
    scheduled.add(chosen.id); order.push(chosen.id);
  }
  context.active.filter(task => !scheduled.has(task.id)).forEach(task => order.push(task.id));
  return { context, order, issues };
}
function locationDelay(machine: Equipment, task: YardTask) {
  const fromBlock = parseSlot(task.from);
  const machineBlock = parseSlot(machine.location);
  if (fromBlock && machineBlock) return Math.max(0, Number(fromBlock.slice(1)) - Number(machineBlock.slice(1))) * 3;
  if (machine.location.includes('闸口') && task.from.includes('闸口')) return 1;
  return 4;
}
function buildTimeline(order: string[], context: ReturnType<typeof analyzeTasks>, baseline: boolean) {
  const starts = new Map<string, Date>(), ends = new Map<string, Date>();
  const machineAvailable = new Map<string, Date>();
  equipment.forEach(machine => machineAvailable.set(machine.id, new Date(Date.now() + (machine.status === 'working' ? machine.queue * 4 * 60000 : 0))));
  order.forEach(id => {
    const analysis = context.analyses.get(id);
    const task = analysis?.task;
    if (!analysis || !task || !analysis.proposedMachine || task.status !== 'assigned' || analysis.hardReasons.length || analysis.prerequisiteIds.some(preId => context.active.some(pre => pre.id === preId))) return;
    const start = new Date(task.scheduledAt);
    const end = new Date(start.getTime() + task.estimatedMinutes * 60000);
    starts.set(id, start); ends.set(id, end);
    machineAvailable.set(analysis.proposedMachine.id, new Date(Math.max(machineAvailable.get(analysis.proposedMachine.id)?.getTime() ?? 0, end.getTime())));
  });
  order.forEach((id, index) => {
    const analysis = context.analyses.get(id);
    if (!analysis) return;
    const task = analysis.task;
    const machine = analysis.proposedMachine;
    const hardBlocked = analysis.hardReasons.length > 0 || context.cycleIds.includes(id);
    if (!machine || hardBlocked || task.status === 'done' || ends.has(id)) return;
    if (task.status === 'executing') {
      const start = new Date(task.scheduledAt); const end = new Date(Math.max(start.getTime() + task.estimatedMinutes * 60000, Date.now()));
      starts.set(id, start); ends.set(id, end); machineAvailable.set(machine.id, end); return;
    }
    const prerequisiteEnds = analysis.prerequisiteIds.map(pre => ends.get(pre)?.getTime()).filter((value): value is number => typeof value === 'number');
    const etaWait = analysis.waits.length && analysis.voyage ? new Date(analysis.voyage.eta).getTime() : 0;
    const fixed = task.status === 'assigned';
    const travel = fixed ? 0 : locationDelay(machine, task);
    const earliest = Math.max(Date.now(), ...prerequisiteEnds, etaWait, fixed ? new Date(task.scheduledAt).getTime() : 0);
    const start = fixed ? new Date(earliest) : new Date(Math.max(earliest, machineAvailable.get(machine.id)?.getTime() ?? Date.now()) + travel * 60000);
    const end = new Date(start.getTime() + task.estimatedMinutes * 60000);
    starts.set(id, start); ends.set(id, end);
    if (!fixed || index === 0 || machineAvailable.get(machine.id)!.getTime() < end.getTime()) machineAvailable.set(machine.id, end);
  });
  return { starts, ends };
}
function buildVoyageImpacts(steps: OrchestrationStep[], baselineTimeline: { ends: Map<string, Date> }, plannedTimeline: { ends: Map<string, Date> }) {
  return voyages.filter(voyage => voyage.status !== 'departed').map(voyage => {
    const related = steps.filter(step => step.voyageId === voyage.id && ['load', 'discharge'].includes(step.kind));
    const baselineTimes = related.map(step => baselineTimeline.ends.get(step.taskId)?.getTime()).filter((value): value is number => typeof value === 'number');
    const plannedTimes = related.map(step => plannedTimeline.ends.get(step.taskId)?.getTime()).filter((value): value is number => typeof value === 'number');
    const baselineFinish = baselineTimes.length ? new Date(Math.max(...baselineTimes)) : undefined;
    const plannedFinish = plannedTimes.length ? new Date(Math.max(...plannedTimes)) : undefined;
    const baselineDelayMinutes = baselineFinish ? Math.max(0, Math.round(minutes(voyage.etd, baselineFinish))) : 0;
    const plannedDelayMinutes = plannedFinish ? Math.max(0, Math.round(minutes(voyage.etd, plannedFinish))) : 0;
    return {
      voyageId: voyage.id, vessel: voyage.vessel, etd: voyage.etd, remainingMoves: voyage.movesPlanned - voyage.movesDone,
      loadTaskCount: related.length, blockedTaskCount: related.filter(step => step.hardBlocked).map(step => step.taskId),
      ...(baselineFinish ? { baselineFinishAt: baselineFinish.toISOString() } : {}), ...(plannedFinish ? { plannedFinishAt: plannedFinish.toISOString() } : {}),
      baselineDelayMinutes, plannedDelayMinutes, delayDeltaMinutes: baselineDelayMinutes - plannedDelayMinutes,
      risk: plannedDelayMinutes > 30 ? 'high' : plannedDelayMinutes > 0 || voyage.lateRisk === 'high' ? 'high' : voyage.lateRisk
    } satisfies VoyageImpact;
  });
}
function buildPlanSteps(controls: OrchestrationControl[]) {
  const baseline = rankTasks([], true);
  const planned = rankTasks(controls, false);
  const baselineTimeline = buildTimeline(baseline.order, baseline.context, true);
  const plannedTimeline = buildTimeline(planned.order, planned.context, false);
  const baselineRank = new Map(baseline.order.map((id, index) => [id, index]));
  const lockByTask = new Map(controls.filter(control => control.type === 'lock').map(control => [control.taskId, control.position]));
  const insertByTask = new Map(controls.filter(control => control.type === 'insert').map(control => [control.taskId, control.beforeTaskId]));
  const scoreCache = new Map<string, ReturnType<typeof scoreTask>>();
  planned.context.active.forEach(task => {
    const state = { scheduled: new Set(planned.order.slice(0, planned.order.indexOf(task.id))) };
    scoreCache.set(task.id, scoreTask(planned.context.analyses.get(task.id)!, state, controls, true));
  });
  const steps: OrchestrationStep[] = planned.order.map((id, index) => {
    const analysis = planned.context.analyses.get(id)!;
    const scored = scoreCache.get(id)!;
    const scheduled = planned.context.graph.get(id)?.every(pre => planned.order.indexOf(pre) < index && pre !== id) && !scored.hardBlocked;
    const rank = scheduled ? index : null;
    const baseRank = baselineRank.has(id) ? baselineRank.get(id)! : null;
    const warnings = [...analysis.warningReasons];
    if (analysis.waits.length) warnings.push(...analysis.waits);
    return {
      taskId: id, rank, baselineRank: scheduled && baseRank !== null && !baseline.context.cycleIds.includes(id) ? baseRank : null,
      rankDelta: rank !== null && baseRank !== null ? baseRank - rank : 0,
      containerId: analysis.task.containerId, ...(analysis.voyage ? { voyageId: analysis.voyage.id } : {}),
      kind: analysis.task.kind, status: analysis.task.status, from: analysis.task.from, to: analysis.task.to, urgencyScore: scored.score, factors: scored.factors,
      hardBlocked: scored.hardBlocked, executableNow: !scored.hardBlocked && !scored.prereqUnfinished && Boolean(analysis.proposedMachine),
      reasons: analysis.hardReasons, warnings, prerequisiteTaskIds: analysis.prerequisiteIds, sameContainerTaskIds: analysis.sameContainerIds,
      cycleTaskIds: planned.context.cycleIds, ...(analysis.task.equipmentId ? { currentEquipmentId: analysis.task.equipmentId } : {}),
      ...(analysis.proposedMachine ? { proposedEquipmentId: analysis.proposedMachine.id, proposedEquipmentName: analysis.proposedMachine.name, proposedEquipmentStatus: analysis.proposedMachine.status } : {}),
      ...(analysis.block ? { blockId: analysis.block.id } : {}), ...(lockByTask.get(id) ? { lockedPosition: lockByTask.get(id) } : {}),
      ...(insertByTask.get(id) ? { insertedBeforeTaskId: insertByTask.get(id) } : {}),
      ...(plannedTimeline.starts.get(id) ? { scheduledStartAt: plannedTimeline.starts.get(id)!.toISOString(), scheduledEndAt: plannedTimeline.ends.get(id)!.toISOString() } : {})
    };
  });
  return { steps, baselineTimeline, plannedTimeline, issues: planned.issues, context: planned.context, snapshots: planned.context.active.map(task => taskSnapshot(task)) };
}
function buildPlan(plan: OrchestrationPlan) {
  const built = buildPlanSteps(plan.controls);
  const issues: PlanIssue[] = [...built.issues];
  if (built.context.cycleIds.length) issues.push({ severity: 'critical', code: 'DEPENDENCY_CYCLE', message: `检测到环形前置依赖：${built.context.cycleIds.join(' → ')}，环上任务不会自动执行`, taskIds: built.context.cycleIds });
  built.context.active.forEach(task => {
    const analysis = built.context.analyses.get(task.id)!;
    if (analysis.hardReasons.length) issues.push({ severity: 'critical', code: 'TASK_BLOCKED', message: `${task.id}：${analysis.hardReasons.join('；')}`, taskIds: [task.id] });
    analysis.warningReasons.forEach(reason => issues.push({ severity: 'warning', code: 'TASK_WARNING', message: `${task.id}：${reason}`, taskIds: [task.id] }));
  });
  Object.assign(plan, { steps: built.steps, voyageImpacts: buildVoyageImpacts(built.steps, built.baselineTimeline, built.plannedTimeline), issues, snapshots: built.snapshots, updatedAt: new Date().toISOString() });
  return plan;
}
export function createOrchestrationPlan() {
  const plan: OrchestrationPlan = { id: `PLAN-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), domainRevision, controls: [], steps: [], voyageImpacts: [], issues: [], snapshots: [] };
  orchestrationPlans.unshift(plan);
  return buildPlan(plan);
}
export function listOrchestrationPlans() { return orchestrationPlans; }
export function getOrchestrationPlan(id: string) { return orchestrationPlans.find(plan => plan.id === id); }
export function lockOrchestrationTask(planId: string, taskId: string, position: number) {
  const plan = getOrchestrationPlan(planId);
  const task = tasks.find(item => item.id === taskId);
  if (!plan) throw new Error('编排计划不存在');
  if (plan.status !== 'draft') throw new Error('已提交计划不能直接调整，请撤销后再锁定');
  if (!task || task.status === 'done') throw new Error('任务不存在或已完成');
  const activeCount = tasks.filter(item => item.status !== 'done').length;
  if (!Number.isInteger(position) || position < 1 || position > activeCount) throw new Error(`锁定位置必须在 1–${activeCount} 之间`);
  if (plan.controls.some(control => control.type === 'lock' && control.position === position && control.taskId !== taskId)) throw new Error(`位置 ${position} 已被其他任务锁定`);
  const prerequisiteMaxRank = Math.max(-1, ...plan.steps.filter(step => task.dependsOn?.includes(step.taskId)).map(step => step.rank ?? -1));
  if (prerequisiteMaxRank >= 0 && position <= prerequisiteMaxRank + 1) throw new Error('不能锁定到未完成前置任务之前');
  plan.controls = plan.controls.filter(control => !(control.type === 'lock' && control.taskId === taskId));
  plan.controls.push({ id: `CTL-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`, type: 'lock', taskId, position, at: new Date().toISOString() });
  return buildPlan(plan);
}
export function unlockOrchestrationTask(planId: string, taskId: string) {
  const plan = getOrchestrationPlan(planId);
  if (!plan) throw new Error('编排计划不存在');
  if (plan.status !== 'draft') throw new Error('已提交计划不能直接调整');
  plan.controls = plan.controls.filter(control => control.taskId !== taskId);
  return buildPlan(plan);
}
export function insertOrchestrationTask(planId: string, taskId: string, beforeTaskId: string) {
  const plan = getOrchestrationPlan(planId);
  if (!plan) throw new Error('编排计划不存在');
  if (plan.status !== 'draft') throw new Error('已提交计划不能直接调整');
  if (taskId === beforeTaskId) throw new Error('不能插队到自身之前');
  if (!tasks.some(task => task.id === taskId && task.status !== 'done') || !tasks.some(task => task.id === beforeTaskId && task.status !== 'done')) throw new Error('插队任务或目标任务不存在/已完成');
  const source = tasks.find(task => task.id === taskId)!;
  const target = tasks.find(task => task.id === beforeTaskId)!;
  if (source.dependsOn?.includes(beforeTaskId)) throw new Error('该插队会颠倒已声明的前置关系');
  if (source.containerId === target.containerId && lifecycleOrder(source) >= lifecycleOrder(target)) throw new Error('同一箱子的互斥作业不能重叠或颠倒工艺顺序');
  const pairGraph = new Map<string, string[]>();
  [...tasks.filter(task => task.status !== 'done').flatMap(task => (task.dependsOn ?? []).map(pre => [task.id, pre] as [string, string])),
    ...plan.controls.filter(control => control.type === 'insert' && control.beforeTaskId).map(control => [control.beforeTaskId as string, control.taskId] as [string, string]),
    [beforeTaskId, taskId]
  ].forEach(([from, to]) => {
    const list = pairGraph.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    pairGraph.set(from, list);
  });
  const cycle = findCycle(pairGraph);
  if (cycle) throw new Error(`该插队会形成环形依赖：${cycle.join(' → ')}`);
  if (!plan.controls.some(control => control.type === 'insert' && control.taskId === taskId && control.beforeTaskId === beforeTaskId)) plan.controls.push({ id: `CTL-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`, type: 'insert', taskId, beforeTaskId, at: new Date().toISOString() });
  return buildPlan(plan);
}
function planConflicts(plan: OrchestrationPlan) {
  const conflicts: PlanIssue[] = [];
  plan.snapshots.forEach(snapshot => {
    const current = tasks.find(task => task.id === snapshot.taskId);
    if (!current) { conflicts.push({ severity: 'critical', code: 'TASK_DELETED', message: `${snapshot.taskId} 已被删除`, taskIds: [snapshot.taskId] }); return; }
    const currentSnapshot = taskSnapshot(current);
    if (currentSnapshot.fingerprint !== snapshot.fingerprint) conflicts.push({ severity: 'critical', code: 'STALE_PLAN', message: `${snapshot.taskId} 或其箱子/设备状态已变化，请重新排序后再提交`, taskIds: [snapshot.taskId] });
    if (current.status === 'executing') conflicts.push({ severity: 'critical', code: 'FIELD_TASK_EXECUTING', message: `${snapshot.taskId} 已在现场执行，不能被过期计划覆盖`, taskIds: [snapshot.taskId] });
  });
  return conflicts;
}
export function submitOrchestrationPlan(planId: string, clientToken?: string, options: { failAfterStep?: number } = {}) {
  const plan = getOrchestrationPlan(planId);
  if (!plan) throw new Error('编排计划不存在');
  if (plan.status === 'submitted') return { plan, status: 'duplicate', message: '该计划已经提交，请勿重复提交', conflicts: [], applied: 0, skipped: 0 } satisfies PlanSubmissionResult;
  if (clientToken && submissionResultByToken.has(clientToken)) return submissionResultByToken.get(clientToken)!;
  if (plan.status === 'undone') throw new Error('计划已撤销，请基于最新状态重新编排');
  const conflicts = planConflicts(plan);
  if (conflicts.length) return { plan, status: 'conflict', message: '现场状态已变化，提交已拦截', conflicts, applied: 0, skipped: 0 } satisfies PlanSubmissionResult;
  const before = new Map(tasks.map(task => [task.id, { ...task, blockingReasons: [...task.blockingReasons], dependsOn: [...(task.dependsOn ?? [])] }]));
  const restore = () => before.forEach((saved, id) => { const task = tasks.find(item => item.id === id); if (task) Object.assign(task, saved); });
  const executable = plan.steps.filter(step => !step.hardBlocked && step.scheduledEndAt && step.status !== 'executing');
  try {
    executable.forEach((step, index) => {
      const task = tasks.find(item => item.id === step.taskId)!;
      const analysis = analyzeTasks(plan.controls).analyses.get(task.id);
      task.equipmentId = step.proposedEquipmentId;
      task.scheduledAt = step.scheduledStartAt!;
      task.planOrder = (step.rank ?? 0) + 1;
      task.planId = plan.id;
      task.blockingReasons = analysis?.hardReasons ?? [];
      if (task.status === 'queued' && !task.blockingReasons.length) task.status = 'assigned';
      if (task.status === 'blocked' && !task.blockingReasons.length) task.status = 'assigned';
      if (options.failAfterStep !== undefined && index + 1 === options.failAfterStep) throw new Error('模拟部分应用失败');
    });
    plan.appliedSnapshots = tasks.filter(task => plan.steps.some(step => step.taskId === task.id)).map(task => taskSnapshot(task));
    plan.status = 'submitted'; plan.submittedAt = new Date().toISOString(); plan.updatedAt = plan.submittedAt; plan.clientToken = clientToken;
    const result: PlanSubmissionResult = { plan, status: 'submitted', message: `已应用 ${executable.length} 个可执行任务，${plan.steps.length - executable.length} 个阻塞任务保持阻塞`, conflicts: [], applied: executable.length, skipped: plan.steps.length - executable.length };
    if (clientToken) submissionResultByToken.set(clientToken, result);
    recordAudit('ORCHESTRATION_SUBMIT', 'orchestration-plan', plan.id, result.message);
    return result;
  } catch (error) {
    restore();
    throw error instanceof Error ? error : new Error('编排计划部分应用失败，已回滚全部变更');
  }
}
export function undoOrchestrationPlan(planId: string) {
  const plan = getOrchestrationPlan(planId);
  if (!plan) throw new Error('编排计划不存在');
  if (plan.status !== 'submitted') throw new Error('只有已提交计划可以撤销');
  const latestSubmitted = orchestrationPlans.find(item => item.status === 'submitted');
  if (latestSubmitted && latestSubmitted.id !== plan.id) throw new Error('已有更新的计划提交，请先撤销更新计划');
  const currentConflicts = (plan.appliedSnapshots ?? []).filter(snapshot => taskSnapshot(tasks.find(task => task.id === snapshot.taskId)!).fingerprint !== snapshot.fingerprint);
  if (currentConflicts.length) throw new Error(`现场任务 ${currentConflicts.map(item => item.taskId).join(', ')} 已变化，为避免覆盖执行结果，不能撤销`);
  const before = new Map(tasks.map(task => [task.id, { ...task, blockingReasons: [...task.blockingReasons], dependsOn: [...(task.dependsOn ?? [])] }]));
  try {
    plan.snapshots.forEach(snapshot => {
      const task = tasks.find(item => item.id === snapshot.taskId);
      if (!task) return;
      task.status = snapshot.taskStatus; task.priority = snapshot.taskPriority; task.scheduledAt = snapshot.scheduledAt;
      task.blockingReasons = [...snapshot.blockingReasons]; task.dependsOn = [...snapshot.dependsOn];
      task.equipmentId = snapshot.equipmentId; task.planId = undefined; task.planOrder = undefined;
    });
    plan.status = 'undone'; plan.undoneAt = new Date().toISOString(); plan.updatedAt = plan.undoneAt;
    recordAudit('ORCHESTRATION_UNDO', 'orchestration-plan', plan.id, '撤销计划并恢复提交前任务字段');
    return plan;
  } catch {
    before.forEach((saved, id) => { const task = tasks.find(item => item.id === id); if (task) Object.assign(task, saved); });
    throw new Error('撤销过程中发生冲突，已回滚撤销操作');
  }
}
export function dashboard() {
  const activeVoyages = voyages.filter(v => v.status !== 'departed');
  const yardCapacity = blocks.reduce((sum, block) => sum + block.capacity, 0); const yardOccupied = blocks.reduce((sum, block) => sum + block.occupied, 0);
  return { activeVoyages: activeVoyages.length, berthMoves: activeVoyages.reduce((sum, v) => sum + v.movesPlanned - v.movesDone, 0), yardUtilization: yardOccupied / yardCapacity, gateQueue: appointments.filter(a => a.status === 'checked-in').length + 7, pendingTasks: tasks.filter(t => t.status !== 'done').length, blockedTasks: tasks.filter(t => t.status === 'blocked').length, reeferAlerts: containers.filter(c => c.reefer && (c.customs === 'inspection' || (c.temperature ?? 0) > 5)).length, hazmatHolds: containers.filter(c => c.hazmatClass && c.customs !== 'released').length, lateVessels: activeVoyages.filter(v => v.lateRisk === 'high').length };
}
export function gateConflicts() {
  const result: { severity: 'critical' | 'warning'; appointmentId: string; reason: string }[] = [];
  appointments.forEach((a, index) => appointments.slice(index + 1).forEach(b => {
    const overlap = a.truckNo === b.truckNo && new Date(a.windowStart).getTime() < new Date(b.windowEnd).getTime() && new Date(b.windowStart).getTime() < new Date(a.windowEnd).getTime();
    if (overlap) result.push({ severity: 'critical', appointmentId: a.id, reason: `车辆 ${a.truckNo} 与 ${b.id} 时间窗口重叠，需重新分配闸口时隙` });
  }));
  appointments.filter(a => a.status === 'booked').forEach(a => { const container = containers.find(c => c.id === a.containerId); if (container?.customs !== 'released') result.push({ severity: 'warning', appointmentId: a.id, reason: `箱 ${a.containerId} 海关状态为 ${container?.customs}，无法无条件放行` }); });
  return result;
}
export function yardHeatmap() { return blocks.map(block => ({ ...block, utilization: block.occupied / block.capacity, freeSlots: block.capacity - block.occupied, pressure: block.heat > 85 ? 'critical' : block.heat > 65 ? 'warning' : 'normal' })); }
export function containerPlan(containerId: string) {
  const container = containers.find(c => c.id === containerId); if (!container) return undefined;
  const reasons: string[] = []; const candidates = blocks.filter(block => block.capacity > block.occupied && (!container.hazmatClass || block.hazmatAllowed) && (!container.reefer || block.reeferPlugs > block.usedPlugs));
  if (container.customs !== 'released' && container.status === 'in-yard') reasons.push('海关未放行，必须保持在查验/监管区');
  const ranked = candidates.map(block => ({ block, score: (block.capacity - block.occupied) * 2 - block.heat - (container.reefer && block.reeferPlugs - block.usedPlugs < 3 ? 18 : 0) - (container.hazmatClass && !block.hazmatAllowed ? 100 : 0) })).sort((a, b) => b.score - a.score);
  if (!ranked.length) reasons.push('没有同时满足危险品、冷藏电源与容量约束的区块');
  const selected = ranked[0]?.block; if (container.reefer && selected) reasons.push(`需要占用 ${selected.reeferPlugs - selected.usedPlugs} 个剩余冷插位中的 1 个`);
  if (container.hazmatClass) reasons.push(`危险品 ${container.hazmatClass} 级，只能进入有隔离资质的区块`);
  return { container, recommendedBlock: selected, alternatives: ranked.slice(1, 3).map(item => item.block), reasons };
}
export function prioritizeTasks() { return tasks.map(task => ({ ...task, score: task.priority + (task.blockingReasons.length ? -20 : 10) + (task.kind === 'inspect' ? 12 : 0) })).sort((a, b) => b.score - a.score); }
export function createAppointment(input: Omit<GateAppointment, 'id' | 'status' | 'sealVerified' | 'weightVerified'>) {
  const container = containers.find(item => item.id === input.containerId); if (!container) throw new Error('箱号不存在');
  if (container.customs !== 'released' && input.type === 'pickup') throw new Error('海关未放行，不能预约提箱');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false }; appointments.unshift(item); container.appointmentId = item.id; return item;
}
export function updateAppointment(id: string, patch: Partial<Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) { const item = appointments.find(a => a.id === id); if (!item) return undefined; Object.assign(item, patch); const container = containers.find(c => c.id === item.containerId); if (item.status === 'checked-in' && container) container.status = 'at-gate'; if (item.status === 'completed' && container) container.status = item.type === 'pickup' ? 'released' : 'in-yard'; auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '闸口值班员', action: 'GATE_UPDATE', entity: 'appointment', entityId: id, at: new Date().toISOString(), details: JSON.stringify(patch) }); return item; }
export function assignTask(id: string, equipmentId: string) { const task = tasks.find(item => item.id === id); const machine = equipmentId ? equipment.find(item => item.id === equipmentId) : undefined; if (!task || (equipmentId && !machine)) return undefined; const blockingReasons = task.blockingReasons.filter(reason => reason.includes('当前不可用') || reason.includes('本任务需要')); task.equipmentId = equipmentId || undefined; if (machine) { if (machine.status === 'maintenance' || machine.status === 'offline') blockingReasons.push(`${machine.name} 当前不可用`); if (machine.kind !== equipmentForTask[task.kind]) blockingReasons.push(`本任务需要 ${equipmentForTask[task.kind]}，不能指派给 ${machine.kind}`); } task.status = blockingReasons.length ? 'blocked' : task.status === 'blocked' ? 'assigned' : task.status; task.blockingReasons = blockingReasons; bumpDomainRevision(); auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action: 'ASSIGN_TASK', entity: 'yard-task', entityId: id, at: new Date().toISOString(), details: `${equipmentId || 'unassigned'} -> ${task.containerId}` }); return task; }
export function containerDetail(id: string) { const container = containers.find(item => item.id === id); if (!container) return undefined; return { container, voyage: voyages.find(v => v.id === container.voyageId), appointment: appointments.find(a => a.id === container.appointmentId), plan: containerPlan(id), tasks: tasks.filter(t => t.containerId === id) }; }

export type ContainerInput = Omit<Container, 'lastEvent' | 'appointmentId'> & { appointmentId?: string };
export type AppointmentInput = Pick<GateAppointment, 'containerId' | 'truckNo' | 'driver' | 'type' | 'windowStart' | 'windowEnd' | 'lane'>;
export type TaskInput = Pick<YardTask, 'kind' | 'containerId' | 'from' | 'to' | 'priority' | 'scheduledAt' | 'estimatedMinutes'> & { equipmentId?: string; dependsOn?: string[] };

function recordAudit(action: string, entity: string, entityId: string, details: string) {
  auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action, entity, entityId, at: new Date().toISOString(), details });
}

export function createContainer(input: ContainerInput) {
  const id = input.id.trim().toUpperCase();
  if (!id) throw new Error('箱号不能为空');
  if (containers.some(item => item.id === id)) throw new Error(`箱号 ${id} 已存在`);
  if (!voyages.some(item => item.id === input.voyageId)) throw new Error('关联航次不存在');
  const blockId = parseSlot(input.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (input.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  if (input.reefer && blockId) {
    const block = blocks.find(item => item.id === blockId);
    if (block && block.reeferPlugs <= block.usedPlugs) throw new Error('当前区块没有可用冷藏插座');
  }
  const item: Container = { ...input, id, lastEvent: `人工建档 ${new Date().toLocaleString()}` };
  containers.unshift(item);
  bumpDomainRevision();
  recordAudit('CREATE', 'container', item.id, '新增集装箱台账记录');
  return item;
}

export function updateContainer(id: string, patch: Partial<Omit<Container, 'id' | 'lastEvent'>>) {
  const item = containers.find(container => container.id === id);
  if (!item) return undefined;
  if (patch.voyageId && !voyages.some(voyage => voyage.id === patch.voyageId)) throw new Error('关联航次不存在');
  const next = { ...item, ...patch };
  const blockId = parseSlot(next.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (next.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  Object.assign(item, patch, { lastEvent: `台账更新 ${new Date().toLocaleString()}` });
  bumpDomainRevision();
  recordAudit('UPDATE', 'container', id, '更新集装箱台账字段');
  return item;
}

export function deleteContainer(id: string) {
  const index = containers.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = containers.splice(index, 1);
  const removedAppointments = appointments.filter(appointment => appointment.containerId === id);
  for (const appointment of removedAppointments) appointments.splice(appointments.indexOf(appointment), 1);
  const removedTasks = tasks.filter(task => task.containerId === id);
  for (const task of removedTasks) tasks.splice(tasks.indexOf(task), 1);
  bumpDomainRevision();
  recordAudit('DELETE', 'container', id, `删除箱务记录，并级联清理 ${removedAppointments.length} 条预约、${removedTasks.length} 条未完成任务`);
  return item;
}

export function createGateAppointment(input: AppointmentInput) {
  const container = containers.find(item => item.id === input.containerId);
  if (!container) throw new Error('箱号不存在');
  if (input.type === 'pickup' && container.customs !== 'released') throw new Error('海关未放行，不能预约提箱');
  if (new Date(input.windowEnd) <= new Date(input.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false };
  appointments.unshift(item);
  container.appointmentId = item.id;
  bumpDomainRevision();
  recordAudit('CREATE', 'appointment', item.id, `为 ${item.containerId} 创建闸口预约`);
  return item;
}

export function editGateAppointment(id: string, patch: Partial<AppointmentInput & Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) {
  const item = appointments.find(appointment => appointment.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('箱号不存在');
  if (patch.windowStart && patch.windowEnd && new Date(patch.windowEnd) <= new Date(patch.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const previousContainer = containers.find(container => container.id === item.containerId);
  Object.assign(item, patch);
  const nextContainer = containers.find(container => container.id === item.containerId);
  if (previousContainer && previousContainer.id !== nextContainer?.id && previousContainer.appointmentId === id) previousContainer.appointmentId = undefined;
  if (nextContainer) nextContainer.appointmentId = id;
  if (item.status === 'checked-in' && nextContainer) nextContainer.status = 'at-gate';
  if (item.status === 'completed' && nextContainer) nextContainer.status = item.type === 'pickup' ? 'released' : 'in-yard';
  bumpDomainRevision();
  recordAudit('UPDATE', 'appointment', id, `更新预约状态/时隙：${JSON.stringify(patch)}`);
  return item;
}

export function deleteGateAppointment(id: string) {
  const index = appointments.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = appointments.splice(index, 1);
  const container = containers.find(entry => entry.id === item.containerId);
  if (container?.appointmentId === id) container.appointmentId = undefined;
  recordAudit('DELETE', 'appointment', id, `取消并删除 ${item.containerId} 的闸口预约`);
  return item;
}

export function createYardTask(input: TaskInput) {
  if (!containers.some(container => container.id === input.containerId)) throw new Error('关联箱号不存在');
  if (input.priority < 1 || input.priority > 100) throw new Error('优先级范围为 1–100');
  if (input.estimatedMinutes <= 0) throw new Error('预计作业时长必须大于 0');
  const dependsOn = [...new Set(input.dependsOn ?? [])];
  dependsOn.forEach(preId => { if (!tasks.some(task => task.id === preId)) throw new Error(`前置任务 ${preId} 不存在`); });
  if (dependsOn.some(preId => tasks.find(task => task.id === preId)?.containerId === input.containerId && lifecycleOrder(tasks.find(task => task.id === preId)!) > lifecycleOrder(input.kind))) throw new Error('同箱前置任务的工艺顺序不能晚于当前任务');
  const item: YardTask = { ...input, dependsOn, id: `TASK-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, status: input.equipmentId ? 'assigned' : 'queued', blockingReasons: [], scheduledAt: input.scheduledAt };
  tasks.unshift(item);
  bumpDomainRevision();
  recordAudit('CREATE', 'yard-task', item.id, `创建 ${input.kind} 任务，关联 ${input.containerId}`);
  return item;
}

export function updateYardTask(id: string, patch: Partial<TaskInput & Pick<YardTask, 'status' | 'blockingReasons'>>) {
  const item = tasks.find(task => task.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('关联箱号不存在');
  if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 100)) throw new Error('优先级范围为 1–100');
  if (patch.dependsOn) {
    patch.dependsOn = [...new Set(patch.dependsOn)].filter(preId => preId !== id);
    patch.dependsOn.forEach(preId => { if (!tasks.some(task => task.id === preId)) throw new Error(`前置任务 ${preId} 不存在`); });
    const graph = new Map(tasks.filter(task => task.status !== 'done').map(task => [task.id, task.id === id ? [...patch.dependsOn!] : [...(task.dependsOn ?? [])]]));
    if (findCycle(graph)) throw new Error('前置依赖不能形成环');
  }
  Object.assign(item, patch);
  bumpDomainRevision();
  recordAudit('UPDATE', 'yard-task', id, `更新场内作业任务：${JSON.stringify(patch)}`);
  return item;
}

export function deleteYardTask(id: string) {
  const index = tasks.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = tasks.splice(index, 1);
  tasks.forEach(task => { task.dependsOn = task.dependsOn?.filter(preId => preId !== id); });
  bumpDomainRevision();
  recordAudit('DELETE', 'yard-task', id, `删除 ${item.containerId} 的场内任务`);
  return item;
}
