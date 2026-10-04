import express from 'express';
import { appointments, assignTask, blocks, containerDetail, containers, createContainer, createGateAppointment, createYardTask, dashboard, deleteContainer, deleteGateAppointment, deleteYardTask, editGateAppointment, equipment, gateConflicts, prioritizeTasks, tasks, updateContainer, updateEquipmentStatus, updateYardTask, voyages, yardHeatmap } from './domain.js';
import { createDraft, discardDraft, getDraft, insertTask, listDrafts, lockTask, rebaseDraft, submitPlan, undoLastEdit, viewDraft } from './orchestrator.js';
const app = express(); app.use(express.json());
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/voyages', (_req, res) => res.json(voyages));
app.get('/api/containers', (req, res) => res.json(req.query.status ? containers.filter(c => c.status === req.query.status) : containers));
app.post('/api/containers', (req, res) => { try { res.status(201).json(createContainer(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建箱务记录失败' }); } });
app.patch('/api/containers/:id', (req, res) => { try { const result = updateContainer(req.params.id, req.body); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新箱务记录失败' }); } });
app.delete('/api/containers/:id', (req, res) => { const result = deleteContainer(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/containers/:id', (req, res) => { const result = containerDetail(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); });
app.get('/api/yard/heatmap', (_req, res) => res.json(yardHeatmap()));
app.get('/api/yard/blocks', (_req, res) => res.json(blocks));
app.get('/api/gate/appointments', (_req, res) => res.json(appointments));
app.get('/api/gate/conflicts', (_req, res) => res.json(gateConflicts()));
app.post('/api/gate/appointments', (req, res) => { try { res.status(201).json(createGateAppointment(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '预约失败' }); } });
app.patch('/api/gate/appointments/:id', (req, res) => { try { const result = editGateAppointment(req.params.id, req.body); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新预约失败' }); } });
app.delete('/api/gate/appointments/:id', (req, res) => { const result = deleteGateAppointment(req.params.id); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/equipment', (_req, res) => res.json(equipment));
app.get('/api/tasks', (_req, res) => res.json(prioritizeTasks()));
app.post('/api/tasks', (req, res) => { try { res.status(201).json(createYardTask(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建作业任务失败' }); } });
app.patch('/api/tasks/:id', (req, res) => { try { const result = updateYardTask(req.params.id, req.body); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新作业任务失败' }); } });
app.delete('/api/tasks/:id', (req, res) => { const result = deleteYardTask(req.params.id); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json({ deleted: true, id: result.id }); });
app.patch('/api/tasks/:id/assign', (req, res) => { const result = assignTask(req.params.id, req.body.equipmentId); if (!result) return res.status(404).json({ message: '任务或设备不存在' }); res.json(result); });
app.patch('/api/equipment/:id', (req, res) => { try { const result = updateEquipmentStatus(req.params.id, req.body); if (!result) return res.status(404).json({ message: '设备不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '设备更新失败' }); } });

/* ---------- 跨任务编排器 ---------- */
app.post('/api/orchestrator/drafts', (_req, res) => { try { res.status(201).json(createDraft()); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '生成编排计划失败' }); } });
app.get('/api/orchestrator/drafts', (_req, res) => res.json(listDrafts()));
app.get('/api/orchestrator/drafts/:id', (req, res) => {
  const draft = getDraft(req.params.id);
  if (!draft) return res.status(404).json({ message: '计划不存在或已被丢弃' });
  res.json(viewDraft(draft, typeof req.query.equipmentId === 'string' ? req.query.equipmentId : undefined));
});
app.post('/api/orchestrator/drafts/:id/lock', (req, res) => {
  try { res.json(lockTask(req.params.id, String(req.body?.taskId ?? ''), req.body?.locked !== false)); }
  catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '锁定失败' }); }
});
app.post('/api/orchestrator/drafts/:id/insert', (req, res) => {
  try { res.json(insertTask(req.params.id, String(req.body?.taskId ?? ''), req.body?.beforeTaskId === undefined ? null : String(req.body.beforeTaskId))); }
  catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '插队失败' }); }
});
app.post('/api/orchestrator/drafts/:id/undo', (req, res) => {
  try { res.json(undoLastEdit(req.params.id)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '撤销失败' }); }
});
app.post('/api/orchestrator/drafts/:id/rebase', (req, res) => {
  try { res.json(rebaseDraft(req.params.id)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '重算失败' }); }
});
app.delete('/api/orchestrator/drafts/:id', (req, res) => { const result = discardDraft(req.params.id); if (!result) return res.status(404).json({ message: '计划不存在' }); res.json({ discarded: true, id: req.params.id }); });
app.post('/api/orchestrator/drafts/:id/submit', (req, res) => {
  try { res.json(submitPlan(req.params.id, req.body?.clientId ? String(req.body.clientId) : undefined)); }
  catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '计划提交失败' }); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'port-yard-operations' }));
const port = Number(process.env.PORT || 4107); app.listen(port, () => console.log(`port yard API listening on ${port}`));
