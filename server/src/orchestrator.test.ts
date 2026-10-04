import test from 'node:test';
import assert from 'node:assert/strict';
import { containers, tasks, updateEquipmentStatus, updateYardTask, createYardTask, deleteYardTask } from './domain.js';
import { buildPlan, createDraft, discardDraft, getDraft, insertTask, lockTask, rebaseDraft, submitPlan, undoLastEdit, viewDraft } from './orchestrator.js';
import { bumpVersion } from './versions.js';

const find = (id: string) => tasks.find(t => t.id === id)!;

test('orchestrator promotes the near-ETD load chain ahead of lower urgency work', () => {
  const { plan } = buildPlan();
  const ids = plan.sequence.map(e => e.taskId);
  // 近 ETD 航次 VOY-AX7 的「收箱 TASK-105 → 装船 TASK-106」必须排在 VOY-QF2 装船 TASK-104 之前
  assert.ok(ids.indexOf('TASK-105') < ids.indexOf('TASK-106'));
  assert.ok(ids.indexOf('TASK-106') < ids.indexOf('TASK-104'));
  // 每条序列项都给出可解释的评分因子
  assert.ok(plan.sequence.every(e => e.scoreFactors.some(f => f.key === 'etd' || e.mode === 'frozen')));
  assert.ok(plan.voyageImpacts.find(v => v.voyageId === 'VOY-AX7')!.etdMinutes < 400);
});

test('orchestrator detects circular prerequisite chains and pulls the cycle out of the sequence', () => {
  const a = createYardTask({ kind: 'rehandle', containerId: 'MSCU-4829017', from: 'A01-R01-T1', to: 'A01-R02-T1', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 10 });
  const b = createYardTask({ kind: 'rehandle', containerId: 'MSCU-4829017', from: 'A01-R02-T1', to: 'A01-R03-T1', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 10, dependsOn: [a.id] });
  // 直接构造 A -> B -> A 的环（CRUD 层会拒绝保存环，环只可能来自外部系统/脏数据）
  a.dependsOn = [b.id];
  try {
    const { plan } = buildPlan();
    assert.ok(plan.cycles.length >= 1);
    assert.ok(plan.cycles.some(c => c.members.includes(a.id) && c.members.includes(b.id)));
    const blockedIds = plan.blockedLane.map(e => e.taskId);
    assert.ok(blockedIds.includes(a.id) && blockedIds.includes(b.id));
    assert.ok(!plan.sequence.some(e => e.taskId === a.id || e.taskId === b.id));
  } finally {
    a.dependsOn = [];
    deleteYardTask(b.id); deleteYardTask(a.id);
  }
});

test('equipment going offline blocks its tasks and removes them from execution sequence', () => {
  const machine = updateEquipmentStatus('YC-05', { status: 'maintenance' })!;
  assert.equal(machine.status, 'maintenance');
  try {
    const { plan } = buildPlan();
    const blocked = plan.blockedLane.find(e => e.taskId === 'TASK-104');
    assert.ok(blocked, '指派给维护设备的装船任务必须进入阻塞队列');
    assert.ok(blocked.hardBlockers.some(r => r.includes('维护') || r.includes('不可用')));
  } finally {
    updateEquipmentStatus('YC-05', { status: 'available' });
  }
  const { plan } = buildPlan();
  assert.ok(plan.sequence.some(e => e.taskId === 'TASK-104'));
});

test('same-container tasks are serialized implicitly (receive before load)', () => {
  const { plan } = buildPlan();
  const receive = plan.sequence.find(e => e.taskId === 'TASK-105')!;
  assert.ok(receive.sameContainerTasks.includes('TASK-106'));
  assert.ok(receive.predecessors.every(p => p.taskId !== 'TASK-106'));
  const load = plan.sequence.find(e => e.taskId === 'TASK-106')!;
  // 同箱边可以是显式前置，也可以是编排器按阶段自动补的隐式互斥边
  assert.ok(load.predecessors.some(p => p.taskId === 'TASK-105'));
  // 另一对没有显式依赖的同箱链（临时收箱任务 → 已有的 TASK-104 装船）必须由互斥规则自动串起来
  const t1 = createYardTask({ kind: 'receive', containerId: 'FCIU-9920310', from: '南闸口', to: 'C03-R01-T1', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 10 });
  try {
    const rebuilt = buildPlan().plan;
    // receive 阶段必须隐式排在 load 之前
    const ids = rebuilt.sequence.map(e => e.taskId);
    assert.ok(ids.indexOf(t1.id) < ids.indexOf('TASK-104'));
    const loadEntry = rebuilt.sequence.find(e => e.taskId === 'TASK-104')!;
    assert.ok(loadEntry.predecessors.some(p => p.taskId === t1.id && p.implicit), '同箱收箱→装船应生成隐式互斥边');
  } finally {
    deleteYardTask(t1.id);
  }
});

test('plan submit applies schedule and equipment assignment, and duplicate client submit is idempotent', () => {
  const task = find('TASK-104');
  const before = task.scheduledAt;
  const view = createDraft();
  const result1 = submitPlan(view.draft.id, 'client-idem-001');
  assert.notEqual(result1.status, 'rejected');
  assert.notEqual(find('TASK-104').scheduledAt, before, '提交后计划开始时间应回写');
  const appliedCount = result1.applied.length;
  const appliedAt = find('TASK-104').scheduledAt;
  // 同一 clientId 重复提交：返回原结果，不再次修改现场
  const result2 = submitPlan(view.draft.id, 'client-idem-001');
  assert.deepEqual(result2.applied, result1.applied);
  assert.equal(result2.applied.length, appliedCount);
  assert.equal(find('TASK-104').scheduledAt, appliedAt);
  discardDraft(view.draft.id);
});

test('stale ordering cannot overwrite a task that changed on site after plan generation', () => {
  const view = createDraft();
  // 计划生成后，现场把 TASK-104 的优先级改了（版本号前进）
  updateYardTask('TASK-104', { priority: 30 });
  const result = submitPlan(view.draft.id);
  const rejected = result.rejected.find(r => r.taskId === 'TASK-104');
  assert.ok(rejected, '过期任务必须被拒绝');
  assert.ok(rejected.reason.includes('过期版本'));
  assert.equal(result.status, 'partial');
  assert.ok(result.applied.length > 0, '其余未漂移任务应部分应用成功');
  discardDraft(view.draft.id);
});

test('executing task on site is never reordered or overwritten', () => {
  updateYardTask('TASK-101', { status: 'executing' });
  const view = createDraft();
  const entry = view.plan.sequence.find(e => e.taskId === 'TASK-101')!;
  assert.equal(entry.mode, 'frozen');
  const result = submitPlan(view.draft.id);
  const rejected = result.rejected.find(r => r.taskId === 'TASK-101');
  assert.ok(rejected && rejected.reason.includes('执行'));
  discardDraft(view.draft.id);
  updateYardTask('TASK-101', { status: 'assigned' });
});

test('container status drift after plan generation rejects the affected tasks', () => {
  const view = createDraft();
  const container = containers.find(c => c.id === 'FCIU-9920310')!;
  const original = container.customs;
  container.customs = 'hold';
  // 模拟外部系统写回：版本号需要前进
  bumpVersion(container);
  const result = submitPlan(view.draft.id);
  const rejected = result.rejected.find(r => r.taskId === 'TASK-104');
  assert.ok(rejected && rejected.reason.includes('状态已变化'));
  container.customs = original;
  bumpVersion(container);
  discardDraft(view.draft.id);
});

test('lock, insert and undo edit the plan while respecting lock boundaries and prerequisites', () => {
  const view = createDraft();
  // 锁定 TASK-105 在当前位置
  const locked = lockTask(view.draft.id, 'TASK-105', true);
  assert.equal(locked.plan.sequence.find(e => e.taskId === 'TASK-105')!.mode, 'locked');
  // 尝试把 TASK-106 插到 TASK-105 之前：违反同箱前置，必须被拒绝
  assert.throws(() => insertTask(view.draft.id, 'TASK-106', 'TASK-105'), /前置/);
  // 把 TASK-104 插到 TASK-105 之前：TASK-105 是锁定边界，不能跨越
  assert.throws(() => insertTask(view.draft.id, 'TASK-104', 'TASK-105'), /锁定/);
  // 合法插队：把 TASK-101 插到 TASK-106 之前（它们没有前置关系）
  const inserted = insertTask(view.draft.id, 'TASK-101', 'TASK-106');
  assert.equal(inserted.plan.sequence.find(e => e.taskId === 'TASK-101')!.mode, 'inserted');
  // 撤销最后一次人工调整
  const undone = undoLastEdit(view.draft.id);
  assert.equal(undone.plan.sequence.find(e => e.taskId === 'TASK-101')!.mode, 'auto');
  assert.ok(undone.plan.sequence.find(e => e.taskId === 'TASK-105')!.mode === 'locked');
  discardDraft(view.draft.id);
});

test('rebase adopts latest on-site state and clears drift after a task changed', () => {
  const view = createDraft();
  updateYardTask('TASK-104', { priority: 33 });
  let refreshed = viewDraft(getDraft(view.draft.id)!)!;
  assert.ok(refreshed.drift.hasDrift);
  assert.ok(refreshed.drift.changes.some(c => c.id === 'TASK-104'));
  refreshed = rebaseDraft(view.draft.id);
  assert.equal(refreshed.drift.hasDrift, false);
  const result = submitPlan(view.draft.id);
  assert.equal(result.rejected.some(r => r.taskId === 'TASK-104'), false);
  discardDraft(view.draft.id);
});

test('submitted plan cannot be edited again and blocked tasks never get applied', () => {
  const view = createDraft();
  submitPlan(view.draft.id);
  assert.throws(() => lockTask(view.draft.id, 'TASK-104', true), /已提交/);
  // 维护中的正面吊任务 TASK-107 无论如何都不会出现在 applied 中
  const result = submitPlan(view.draft.id); // 幂等返回
  assert.ok(!result.applied.some(a => a.taskId === 'TASK-107'));
  discardDraft(view.draft.id);
});

test('voyage impact shows rank movement and blocked work per voyage', () => {
  const { plan } = buildPlan();
  const ax7 = plan.voyageImpacts.find(v => v.voyageId === 'VOY-AX7')!;
  assert.ok(ax7.remainingTasks >= 4);
  assert.ok(ax7.blockedTaskIds.includes('TASK-103'));
  const moved = new Set([...ax7.movedEarlier, ...ax7.movedLater]);
  assert.ok(moved.size > 0, '排序变化必须反映到航次影响面板');
  // 排名变化字段与影响面板一致
  assert.ok(plan.sequence.some(e => e.rankDelta !== null && e.rankDelta !== 0));
});
