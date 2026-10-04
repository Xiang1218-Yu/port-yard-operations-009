import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ScoreFactor = { key: string; label: string; points: number };
type PlanEntry = {
  taskId: string; kind: string; containerId: string; voyageId?: string;
  rank: number | null; baselineRank: number | null; rankDelta: number | null;
  mode: 'auto' | 'locked' | 'inserted' | 'frozen' | 'blocked';
  score: number | null; scoreFactors: ScoreFactor[]; scoreSummary: string;
  hardBlockers: string[]; softWarnings: string[];
  predecessors: { taskId: string; implicit: boolean }[]; sameContainerTasks: string[];
  equipmentId?: string; equipmentStatus?: string; proposedEquipmentId?: string; proposedEquipmentName?: string;
  startAt: string | null; finishAt: string | null; waitMinutes: number | null; estimatedMinutes: number; from: string; to: string;
};
type VoyageImpact = {
  voyageId: string; vessel: string; etd: string; etdMinutes: number; remainingTasks: number; blockedTasks: number;
  baselineFinishAt: string | null; plannedFinishAt: string | null; deltaMinutes: number | null; slackMinutes: number | null;
  projectedMiss: boolean; movedEarlier: string[]; movedLater: string[]; blockedTaskIds: string[];
};
type DriftChange = { entity: string; id: string; detail: string; baseVersion: number; currentVersion: number };
type Plan = {
  generatedAt: string; focusedEquipmentId?: string;
  sequence: PlanEntry[]; blockedLane: PlanEntry[]; voyageImpacts: VoyageImpact[];
  cycles: { members: string[]; detail: string }[];
  summary: { schedulable: number; blocked: number; frozen: number; locked: number; inserted: number; projectedMisses: number; totalWaitMinutes: number };
  scoreLegend: { factor: string; meaning: string }[];
};
type EditRecord = { id: string; at: string; type: 'lock' | 'insert' | 'unlock'; taskId: string; beforeTaskId?: string; detail: string };
type Draft = { id: string; createdAt: string; createdBy: string; edits: EditRecord[]; submitted: boolean };
type DraftView = { draft: Draft; plan: Plan; drift: { hasDrift: boolean; changes: DriftChange[] }; staleManipulations: { taskId: string; reason: string; type: 'lock' | 'insert' }[] };
type SubmitResult = { planId: string; status: 'applied' | 'partial' | 'rejected'; at: string; applied: { taskId: string; rank: number; scheduledAt: string; equipmentId?: string }[]; rejected: { taskId: string; reason: string; currentStatus: string; baseVersion: number; currentVersion: number }[] };
type Equipment = { id: string; name: string; kind: string; status: string; location: string; battery: number; queue: number; movesPerHour: number };
type Task = { id: string; kind: string; containerId: string; status: string; priority: number; score: number; blockingReasons: string[] };

const KIND_LABEL: Record<string, string> = { load: '装船', discharge: '卸船', receive: '收箱进场', deliver: '提箱离场', inspect: '海关查验', rehandle: '翻箱移箱' };
const MODE_LABEL: Record<string, string> = { auto: '自动', locked: '🔒 已锁定', inserted: '↟ 人工插队', frozen: '❄ 现场执行', blocked: '⛔ 阻塞' };
const time = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const minutesLabel = (value: number | null) => value === null ? '—' : value >= 60 ? `${Math.floor(value / 60)}h${value % 60}m` : `${value}m`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/orchestrator${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body as T;
}

export default function Orchestrator({ tasks, equipment, onChanged }: { tasks: Task[]; equipment: Equipment[]; onChanged: () => void }) {
  const [view, setView] = useState<DraftView>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [clientId] = useState(() => `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const load = useCallback(async (id: string) => {
    try { const fresh = await request<DraftView>(`/drafts/${id}`); setView(fresh); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '刷新计划失败'); setView(undefined); }
  }, []);

  const newDraft = useCallback(async () => {
    setBusy(true); setError(''); setSubmitResult(undefined);
    try { const created = await request<DraftView>('/drafts', { method: 'POST' }); setView(created); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '新建计划失败'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void newDraft(); }, [newDraft]);
  // 轮询现场漂移：调度员打开计划期间，其他终端的操作会体现在漂移条上。
  useEffect(() => {
    if (!view || view.draft.submitted) return;
    pollRef.current = setInterval(() => void load(view.draft.id), 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view?.draft.id, view?.draft.submitted, load]);

  const act = useCallback(async (path: string, body?: unknown) => {
    if (!view) return;
    setBusy(true); setError('');
    try { const result = await request<DraftView>(path, { method: path.endsWith('undo') || path.endsWith('rebase') ? 'POST' : 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); setView(result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); void load(view.draft.id); }
    finally { setBusy(false); }
  }, [view, load]);

  const discard = useCallback(async () => {
    if (!view || !window.confirm('撤销并丢弃整个计划？该计划尚未下发现场，人工调整将一并清空。')) return;
    setBusy(true);
    try { await request(`/drafts/${view.draft.id}`, { method: 'DELETE' }); setView(undefined); setSubmitResult(undefined); onChanged(); await newDraft(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '丢弃失败'); }
    finally { setBusy(false); }
  }, [view, newDraft, onChanged]);

  const submit = useCallback(async () => {
    if (!view) return;
    if (view.drift.hasDrift && !window.confirm(`检测到 ${view.drift.changes.length} 项现场状态变化。\n继续提交时，已变化的任务会被逐条拒绝（部分应用），未变化的任务正常下发。\n建议先「采用现场重算」。仍要提交吗？`)) return;
    setBusy(true); setError('');
    try {
      const result = await request<SubmitResult>(`/drafts/${view.draft.id}/submit`, { method: 'POST', body: JSON.stringify({ clientId }) });
      setSubmitResult(result);
      await load(view.draft.id);
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败'); }
    finally { setBusy(false); }
  }, [view, clientId, load, onChanged]);

  const toggle = (id: string) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const liveStatus = useCallback((id: string) => taskById.get(id)?.status, [taskById]);

  if (!view) return <section className="panel wide"><div className="orchestrator-empty">正在生成跨任务编排计划…{error && <b className="blocked-text">{error}</b>}</div></section>;
  const { plan, draft, drift, staleManipulations } = view;

  return <div className="orchestrator">
    <section className="panel wide orch-head">
      <div>
        <div className="eyebrow">CROSS-TASK ORCHESTRATION / 跨任务编排器</div>
        <h2>执行序列 {draft.submitted && <span className="submit-badge">已提交</span>}</h2>
        <p>基于航次 ETD、箱务优先级、前置关系、设备能力、区块位置与阻塞原因联合排序；可锁定、插队、撤销，提交时逐条校验现场漂移。</p>
      </div>
      <div className="orch-actions">
        <button onClick={() => void act(`/drafts/${draft.id}/undo`)} disabled={busy || draft.submitted || draft.edits.length === 0} title="撤销最近一次锁定/插队">↶ 撤销调整</button>
        <button onClick={() => void act(`/drafts/${draft.id}/rebase`)} disabled={busy || draft.submitted} className={drift.hasDrift ? 'primary-action' : ''}>⟳ 采用现场重算</button>
        <button className="danger-action" onClick={() => void discard()} disabled={busy}>撤销计划</button>
        <button className="primary-action" onClick={() => void submit()} disabled={busy || draft.submitted}>提交序列下发现场</button>
      </div>
    </section>

    {error && <div className="form-error orch-error">{error}<button onClick={() => setError('')}>关闭</button></div>}

    {drift.hasDrift && !draft.submitted && <div className="drift-banner">
      <strong>现场状态已变化（{drift.changes.length}）</strong>
      <span>排序生成后有任务/箱/设备被其他终端修改；提交时这些任务会被拒绝，不会覆盖现场执行。可「采用现场重算」后再下发。</span>
      <div className="drift-list">{drift.changes.slice(0, 6).map(change => <span key={`${change.entity}-${change.id}`} className={`drift-item drift-${change.entity}`}><b>{change.detail}</b><em>v{change.baseVersion}→v{change.currentVersion}</em></span>)}</div>
    </div>}

    {staleManipulations.length > 0 && <div className="stale-banner">
      {staleManipulations.map(item => <span key={`${item.type}-${item.taskId}`}>人工{item.type === 'lock' ? '锁定' : '插队'}已自动失效：<b>{item.taskId}</b> — {item.reason}</span>)}
    </div>}

    {plan.cycles.length > 0 && <div className="cycle-banner">{plan.cycles.map(cycle => <div key={cycle.members.join('-')}><strong>检测到环形前置依赖</strong><span>{cycle.detail}</span><em>环内任务已撤出排序，请先打破环</em></div>)}</div>}

    {submitResult && <div className={`submit-report submit-${submitResult.status}`}>
      <div className="submit-head"><strong>{submitResult.status === 'applied' ? '✓ 全部下发成功' : submitResult.status === 'partial' ? `⚠ 部分应用：成功 ${submitResult.applied.length} 项，拒绝 ${submitResult.rejected.length} 项` : `✗ 全部被拒绝（${submitResult.rejected.length} 项）`}</strong><button onClick={() => setSubmitResult(undefined)}>×</button></div>
      {submitResult.applied.length > 0 && <div className="submit-applied"><small>已下发</small>{submitResult.applied.map(item => <span key={item.taskId} className="applied-chip">{item.taskId} → #{item.rank + 1}{item.equipmentId ? ` · ${item.equipmentId}` : ''} · {time(item.scheduledAt)}</span>)}</div>}
      {submitResult.rejected.length > 0 && <div className="submit-rejected"><small>未下发（现场未改动）</small>{submitResult.rejected.map(item => <span key={item.taskId} className="rejected-chip" title={`v${item.baseVersion} → v${item.currentVersion}`}><b>{item.taskId}</b>{item.reason}<em>现场状态：{item.currentStatus}</em></span>)}</div>}
    </div>}

    <div className="layout orch-layout">
      <section className="panel wide">
        <div className="panel-head"><h3>建议执行序列</h3><span className="muted">{plan.summary.schedulable} 可执行 · {plan.summary.blocked} 阻塞 · {plan.summary.projectedMisses} 航次预计误期 · 总等待 {minutesLabel(plan.summary.totalWaitMinutes)}</span></div>
        <div className="seq-list">
          {plan.sequence.map(entry => {
            const isOpen = expanded.has(entry.taskId);
            const drifted = drift.changes.some(change => (change.entity === 'task' && change.id === entry.taskId) || (change.entity === 'container' && change.id === entry.containerId));
            return <div key={entry.taskId} className={`seq-row seq-${entry.mode}${drifted ? ' seq-drifted' : ''}${isOpen ? ' open' : ''}`} onClick={() => toggle(entry.taskId)}>
              <div className="seq-main">
                <span className="seq-rank">#{(entry.rank ?? 0) + 1}</span>
                <span className="seq-task"><b>{entry.taskId}</b><small>{KIND_LABEL[entry.kind] ?? entry.kind} · {entry.containerId}{entry.voyageId ? ` · ${entry.voyageId}` : ''}</small><small className="seq-route">{entry.from} → {entry.to}</small></span>
                <span className="seq-delta">{entry.rankDelta === null || entry.rankDelta === 0 ? <em>位次持平</em> : entry.rankDelta > 0 ? <b className="earlier">↑{entry.rankDelta} 提前</b> : <b className="later">↓{Math.abs(entry.rankDelta)} 延后</b>}</span>
                <span className="seq-score"><b>{entry.score ?? '—'}</b><small>综合分</small></span>
                <span className="seq-time"><b>{time(entry.startAt)}–{time(entry.finishAt)}</b><small>等待 {minutesLabel(entry.waitMinutes)} · {entry.estimatedMinutes}min</small></span>
                <span className="seq-equip"><b>{entry.proposedEquipmentName ?? '待分配'}</b><small>{entry.equipmentId && entry.proposedEquipmentId !== entry.equipmentId ? `原指派 ${entry.equipmentId}` : entry.equipmentStatus ? `现场：${entry.equipmentStatus}` : '仿真推荐'}</small></span>
                <span className={`seq-mode mode-${entry.mode}`}>{MODE_LABEL[entry.mode]}</span>
                <span className="seq-ops" onClick={event => event.stopPropagation()}>
                  {entry.mode === 'locked'
                    ? <button disabled={busy || draft.submitted} onClick={() => void act(`/drafts/${draft.id}/lock`, { taskId: entry.taskId, locked: false })}>解锁</button>
                    : entry.mode === 'auto' || entry.mode === 'inserted'
                      ? <button disabled={busy || draft.submitted} onClick={() => void act(`/drafts/${draft.id}/lock`, { taskId: entry.taskId, locked: true })}>锁定</button>
                      : null}
                  {entry.mode !== 'frozen' && <select disabled={busy || draft.submitted || entry.mode === 'locked'} value="" onChange={event => { const value = event.target.value; if (value) void act(`/drafts/${draft.id}/insert`, { taskId: entry.taskId, beforeTaskId: value === '__end__' ? null : value }); }}>
                    <option value="">插队到…</option>
                    {plan.sequence.filter(other => other.taskId !== entry.taskId && other.rank !== null && Math.abs((other.rank ?? 0) - (entry.rank ?? 0)) <= 4).map(other => <option key={other.taskId} value={other.taskId}>{other.taskId} 之前</option>)}
                    <option value="__end__">队尾</option>
                  </select>}
                </span>
              </div>
              <div className="seq-explain"><span>{entry.scoreSummary}</span>{entry.softWarnings.map(warning => <em key={warning} className="soft-warning">⚠ {warning}</em>)}{drifted && <em className="drift-flag">现场已漂移，提交时将被拒绝</em>}</div>
              {isOpen && <div className="seq-detail" onClick={event => event.stopPropagation()}>
                <div className="factor-grid">{entry.scoreFactors.map(factor => <span key={factor.key} className={factor.points < 0 ? 'factor neg' : 'factor'}><b>{factor.points > 0 ? '+' : ''}{factor.points}</b>{factor.label}</span>)}</div>
                <div className="seq-meta">
                  <span>前置任务：{entry.predecessors.length ? entry.predecessors.map(pred => <em key={pred.taskId} className={pred.implicit ? 'implicit-dep' : ''}>{pred.taskId}{pred.implicit ? '（同箱互斥自动生成）' : ''}</em>) : '无'}</span>
                  <span>同箱互斥：{entry.sameContainerTasks.length ? entry.sameContainerTasks.join('、') : '无'}</span>
                  <span>现场状态：{liveStatus(entry.taskId) ?? '—'}</span>
                </div>
              </div>}
            </div>;
          })}
        </div>
      </section>

      <div className="orch-side">
        <section className="panel">
          <div className="panel-head"><h3>航次剩余作业影响</h3></div>
          {plan.voyageImpacts.map(impact => <div key={impact.voyageId} className={`voyage-impact ${impact.projectedMiss ? 'miss' : ''}`}>
            <div className="vi-head"><b>{impact.vessel}</b><span>{impact.voyageId} · ETD {time(impact.etd)}（{minutesLabel(impact.etdMinutes)}）</span>{impact.projectedMiss ? <strong className="critical">预计误期</strong> : <strong className="ok">可保船期</strong>}</div>
            <div className="vi-grid">
              <span><b>{impact.remainingTasks}</b><small>剩余任务</small></span>
              <span><b className={impact.blockedTasks ? 'critical' : ''}>{impact.blockedTasks}</b><small>阻塞中</small></span>
              <span><b className={impact.deltaMinutes === null ? '' : impact.deltaMinutes < 0 ? 'earlier' : impact.deltaMinutes > 0 ? 'later' : ''}>{impact.deltaMinutes === null ? '—' : `${impact.deltaMinutes > 0 ? '+' : ''}${impact.deltaMinutes}m`}</b><small>完工时刻变化</small></span>
              <span><b className={(impact.slackMinutes ?? 1) < 0 ? 'critical' : ''}>{minutesLabel(impact.slackMinutes)}</b><small>ETD 余量</small></span>
            </div>
            <div className="vi-moves">{impact.movedEarlier.length > 0 && <span className="earlier">提前：{impact.movedEarlier.join('、')}</span>}{impact.movedLater.length > 0 && <span className="later">延后：{impact.movedLater.join('、')}</span>}{impact.blockedTaskIds.length > 0 && <span className="blocked-text">阻塞：{impact.blockedTaskIds.join('、')}</span>}</div>
          </div>)}
        </section>

        <section className="panel blocked-panel">
          <div className="panel-head"><h3>阻塞任务（{plan.blockedLane.length}）</h3><span className="muted">不参与下发，解除阻塞后自动回序列</span></div>
          {plan.blockedLane.map(entry => <div key={entry.taskId} className="blocked-card">
            <b>{entry.taskId}</b><small>{KIND_LABEL[entry.kind] ?? entry.kind} · {entry.containerId}{entry.voyageId ? ` · ${entry.voyageId}` : ''}</small>
            <ul>{entry.hardBlockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
            {entry.predecessors.length > 0 && <small className="blocked-text">受前置阻塞传染：{entry.predecessors.map(p => p.taskId).join('、')}</small>}
          </div>)}
        </section>

        <section className="panel">
          <div className="panel-head"><h3>排序依据</h3></div>
          <ul className="legend-list">{plan.scoreLegend.map(item => <li key={item.factor}><b>{item.factor}</b><span>{item.meaning}</span></li>)}</ul>
          <div className="edit-history"><small>人工调整记录（{draft.edits.length}）</small>{draft.edits.slice(-5).reverse().map(edit => <span key={edit.id}><em>{edit.type === 'lock' ? '锁定' : edit.type === 'insert' ? '插队' : '解锁'}</em>{edit.detail}</span>)}{draft.edits.length === 0 && <span className="muted">尚无调整，全部自动排序</span>}</div>
        </section>
      </div>
    </div>
  </div>;
}
