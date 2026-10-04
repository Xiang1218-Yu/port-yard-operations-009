# HarborGrid · 港口集装箱堆场作业协同与闸口调度系统

React + Vite + TypeScript 前端，Node.js + Express + TypeScript 服务端。面向中型集装箱码头，把船期、箱务、堆场区块、闸口预约、设备作业和异常闭环放在同一套作业控制台中。

## 启动

```bash
npm install
npm run dev
```

前端默认 Vite 端口 5178，API 默认 `http://localhost:4107`。

## 业务能力

- 船舶航次、泊位窗口、计划/已完成翻箱和延误风险
- 箱号、尺寸、冷藏温度、危险品级别、海关状态、进出口/中转流向
- 堆场区块容量、堆存热度、冷藏插座、危险品隔离和设备可达性
- 闸口预约时隙、车道、OCR/称重/封志校验状态与同车冲突检测
- 岸桥、场桥、集卡、正面吊设备池和约束感知任务队列
- 自动堆位推荐、冷藏/危险品约束、海关查验阻塞、任务指派审计
- 跨任务编排器：基于航次 ETD、箱务优先级、前置关系（含同箱互斥自动串链）、设备能力/可用性、区块位置与阻塞原因生成可解释执行序列；支持锁定、插队、撤销整份计划；提交时按版本指纹检查现场漂移，部分应用并回执逐项原因，clientId 幂等防重复提交；自动检测环形前置依赖
- React 控制台支持船期驾驶舱、闸口操作、堆场热区、设备任务与跨任务编排（排序变化对航次剩余作业/阻塞任务的影响面板）

当前使用内存种子数据，领域服务通过 REST API 暴露，后续可接入 TOS、OCR、称重、RTG 遥测、预约配额和优化求解器。

## 跨任务编排 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/orchestrator/drafts` | 生成编排计划草稿（记录任务/箱/设备版本指纹） |
| GET | `/api/orchestrator/drafts/:id` | 查看序列、阻塞队列、航次影响与现场漂移（支持 `?equipmentId=` 聚焦设备） |
| POST | `/api/orchestrator/drafts/:id/lock` | 锁定/解锁任务位次（`{taskId, locked}`） |
| POST | `/api/orchestrator/drafts/:id/insert` | 插队（`{taskId, beforeTaskId}`，null 为队尾；受前置链与锁定边界约束） |
| POST | `/api/orchestrator/drafts/:id/undo` | 撤销最近一次人工调整 |
| POST | `/api/orchestrator/drafts/:id/rebase` | 采用现场最新状态重算漂移基线 |
| DELETE | `/api/orchestrator/drafts/:id` | 撤销并丢弃整份计划（未下发不影响现场） |
| POST | `/api/orchestrator/drafts/:id/submit` | 提交下发，`{clientId}` 幂等；返回 applied/rejected 逐条回执（过期/执行中/漂移项拒绝，其余部分应用） |
