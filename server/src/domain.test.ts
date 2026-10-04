import test from 'node:test'; import assert from 'node:assert/strict'; import { containerPlan, createOrchestrationPlan, createYardTask, dashboard, deleteYardTask, gateConflicts, insertOrchestrationTask, prioritizeTasks, submitOrchestrationPlan, undoOrchestrationPlan, updateYardTask } from './domain.js';
test('dashboard aggregates berth, yard, gate and exception signals', () => { const data = dashboard(); assert.equal(data.activeVoyages, 2); assert.ok(data.yardUtilization > 0.7); assert.ok(data.blockedTasks >= 1); });
test('gate conflict engine detects same truck overlap', () => { const conflicts = gateConflicts(); assert.ok(conflicts.some(item => item.appointmentId === 'APT-9001' || item.appointmentId === 'APT-9004')); });
test('yard planner respects reefer and hazmat constraints', () => { const plan = containerPlan('TGHU-9831204'); assert.equal(plan?.recommendedBlock?.hazmatAllowed, true); assert.ok(plan?.reasons.some(reason => reason.includes('危险品'))); });
test('priority queue promotes customs inspection work', () => { const tasks = prioritizeTasks(); assert.equal(tasks[0].containerId, 'TGHU-9831204'); });

test('container create, update and delete form a complete audited CRUD cycle', async () => {
  const { createContainer, updateContainer, deleteContainer, containers } = await import('./domain.js');
  const created = createContainer({ id: 'TEST-CRUD-0001', voyageId: 'VOY-AX7', size: '20', isoType: '22G1', direction: 'import', status: 'in-yard', weightT: 10, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R11-T1' });
  assert.equal(created.id, 'TEST-CRUD-0001');
  assert.equal(updateContainer(created.id, { weightT: 12 })?.weightT, 12);
  assert.equal(deleteContainer(created.id)?.id, 'TEST-CRUD-0001');
  assert.equal(containers.some(item => item.id === 'TEST-CRUD-0001'), false);
});

test('appointment and task domain operations support create, update and delete', async () => {
  const { createGateAppointment, editGateAppointment, deleteGateAppointment, createYardTask, updateYardTask, deleteYardTask } = await import('./domain.js');
  const appointment = createGateAppointment({ containerId: 'MSCU-4829017', truckNo: 'TEST-CRUD-01', driver: '测试司机', type: 'pickup', windowStart: new Date(Date.now()+3600000).toISOString(), windowEnd: new Date(Date.now()+7200000).toISOString(), lane: 'north' });
  assert.equal(editGateAppointment(appointment.id, { driver: '更新司机' })?.driver, '更新司机');
  assert.equal(deleteGateAppointment(appointment.id)?.id, appointment.id);
  const task = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R01-T1', to: '南闸口', priority: 40, scheduledAt: new Date().toISOString(), estimatedMinutes: 12 });
  assert.equal(updateYardTask(task.id, { to: '北闸口' })?.to, '北闸口');
  assert.equal(deleteYardTask(task.id)?.id, task.id);
});

test('cross-task orchestration detects cyclic prerequisites and explains blocked tasks', () => {
  const a = createYardTask({ kind: 'rehandle', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'C03-R05-T2', priority: 50, scheduledAt: new Date().toISOString(), estimatedMinutes: 10 });
  const b = createYardTask({ kind: 'rehandle', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: 'A01-R08-T3', priority: 50, scheduledAt: new Date().toISOString(), estimatedMinutes: 10, dependsOn: [a.id] });
  assert.throws(() => updateYardTask(a.id, { dependsOn: [b.id] }), /环/);
  deleteYardTask(a.id); deleteYardTask(b.id);
});

test('orchestrator proposes capable equipment when current equipment is unavailable', () => {
  const task = createYardTask({ kind: 'inspect', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: 'A01-R07-T3', priority: 60, scheduledAt: new Date().toISOString(), estimatedMinutes: 12, equipmentId: 'RS-02' });
  const plan = createOrchestrationPlan();
  const step = plan.steps.find(item => item.taskId === task.id);
  assert.equal(step?.proposedEquipmentId, 'RS-05');
  assert.ok(step.warnings.some(reason => reason.includes('RS-05')));
  deleteYardTask(task.id);
});

test('same-container mutually exclusive tasks preserve lifecycle order and support manual insert', () => {
  const earlier = createYardTask({ kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', priority: 40, scheduledAt: new Date(Date.now() + 5 * 60000).toISOString(), estimatedMinutes: 10 });
  const later = createYardTask({ kind: 'load', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: 'B07 / VOY-AX7', priority: 80, scheduledAt: new Date(Date.now() + 40 * 60000).toISOString(), estimatedMinutes: 12 });
  const plan = createOrchestrationPlan();
  assert.throws(() => insertOrchestrationTask(plan.id, later.id, earlier.id), /互斥|前置/);
  const inserted = insertOrchestrationTask(plan.id, earlier.id, later.id);
  assert.ok(inserted.steps.find(step => step.taskId === earlier.id)!.rank! < inserted.steps.find(step => step.taskId === later.id)!.rank!);
  deleteYardTask(earlier.id); deleteYardTask(later.id);
});

test('plan submission rejects stale state, enforces idempotency and rolls back partial failures', () => {
  const task = createYardTask({ kind: 'rehandle', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'C03-R06-T2', priority: 51, scheduledAt: new Date(Date.now() + 30 * 60000).toISOString(), estimatedMinutes: 11 });
  const stalePlan = createOrchestrationPlan();
  updateYardTask(task.id, { priority: 66 });
  const conflict = submitOrchestrationPlan(stalePlan.id, 'token-stale');
  assert.equal(conflict.status, 'conflict');
  assert.ok(conflict.conflicts.some(item => item.code === 'STALE_PLAN'));

  const freshPlan = createOrchestrationPlan();
  const first = submitOrchestrationPlan(freshPlan.id, 'token-once');
  const second = submitOrchestrationPlan(freshPlan.id, 'token-once');
  assert.equal(first.status, 'submitted');
  assert.equal(second.status, 'duplicate');
  undoOrchestrationPlan(freshPlan.id);
  const partialPlan = createOrchestrationPlan();
  assert.throws(() => submitOrchestrationPlan(partialPlan.id, 'token-fail', { failAfterStep: 1 }), /部分应用失败/);
  deleteYardTask(task.id);
});
