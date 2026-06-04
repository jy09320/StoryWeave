# Phase 4 实施计划

> 承接 Phase 3 的完成状态，Phase 4 的核心目标是：把现有能力做深、做稳、做可用。
> Phase 3 解决了"有没有"的问题，Phase 4 解决"好不好用"和"真正闭环"的问题。

## 当前实际基线（2026-06）

已完成且可用：
- 完整的多阶段续写 Pipeline（Planner → Retriever → Writer → Checker）
- Pipeline Trace 可视化（用户步骤条 + 开发者诊断中心）
- 记忆系统（章节级 + 项目级，章节保存后自动触发）
- 剧情图谱：数据模型 + 后端 API + 前端 D3 力导向图可视化
- 图谱 RAG：`_retrieve_graph_evidence` 已实现，实体/事件/关系/伏笔均有检索打分逻辑
- 图谱自动构建：`story_graph_service.refresh_for_project` 已实现，章节保存时自动触发重建
- 知识图谱页面可视化（筛选/拖拽/缩放/hover详情）

尚未做的：
1. 图谱刷新触发入口在前端不明显（知识图谱页只有刷新按钮，无状态反馈）
2. 世界观页面（`project-world-page.tsx`）是独立路由，但侧边栏没有对应入口
3. AI 工作区（`project-ai-workspace-page.tsx`）功能不清晰，缺少定位
4. benchmark 数据集为空，无法量化评估 Pipeline 效果
5. 旧链路 `/api/ai/generate` 未退场
6. token budget 无自动裁剪

---

## Phase 4 目标

**主线：体验打磨 + 图谱与 RAG 联调验证 + 工程清理**

分三个方向并行推进：

| 方向 | 核心价值 | 优先级 |
|---|---|---|
| A. 产品体验补全 | 消除明显的导航缺口和功能断点 | 高 |
| B. 图谱 & RAG 验证 | 确认图谱证据真正进入 Pipeline 上下文 | 高 |
| C. 工程清理 | 减少技术债，降低维护成本 | 中 |

---

## 方向 A：产品体验补全

### A1. 侧边栏补全世界观入口

**问题**：`project-world-page.tsx` 对应路由 `/projects/:id/world` 已存在，但 `app-shell.tsx` 的项目侧边栏中**没有**"世界观设定"的导航链接，用户无法直接从侧边栏进入。

**修复**：在项目侧边栏的导航列表中补加"世界观设定"入口，与"角色库"、"知识图谱"并列。

涉及文件：[`frontend/src/components/app-shell.tsx`](../frontend/src/components/app-shell.tsx)

---

### A2. 知识图谱页面 — 图谱刷新状态反馈

**问题**：知识图谱页面右上角有"刷新"按钮（`graphQuery.refetch()`），但这只是重新拉取当前数据库的快照，并不触发后端重建图谱。用户看到的是旧图谱，不知道需要先触发重建。

**改进**：
1. 新增"重建图谱"按钮，调用新建的后端接口 `POST /projects/:id/story-graph/rebuild`
2. 重建完成后自动刷新查询
3. 展示最后更新时间（从 `StoryEntity` 的 `updated_at` 等字段推断）

涉及文件：
- [`backend/app/api/routes/story_graph.py`](../backend/app/api/routes/story_graph.py) — 新增 rebuild 端点
- [`frontend/src/pages/project-graph-page.tsx`](../frontend/src/pages/project-graph-page.tsx)
- [`frontend/src/services/projects.ts`](../frontend/src/services/projects.ts)

---

### A3. AI 工作区定位明确化

**问题**：`project-ai-workspace-page.tsx` 存在但功能定位模糊，与编辑器内置 AI 侧栏重叠。

**选项**（需决策）：
- **方案 1（推荐）**：将 AI 工作区定位为"自由问答 + 项目知识问答"入口，脱离章节编辑上下文，补充面向整个项目的全局分析（如"分析本项目的伏笔完成度"、"建议下一章的方向"）
- **方案 2**：暂时在侧边栏隐藏该入口，等功能成熟再开放

---

## 方向 B：图谱 & RAG 联调验证

### B1. 验证图谱 RAG 实际参与续写

**现状**：`context_retrieval_service._retrieve_graph_evidence()` 已实现完整的实体/事件/关系/伏笔打分检索逻辑，但尚未确认在真实续写请求中是否真的返回了非空的 `graph_evidence`。

**任务**：
1. 在有完整章节记忆的项目上运行一次 Pipeline，在诊断中心的"检索" tab 中确认 `graph_evidence_count > 0`
2. 若始终为 0，排查原因：
   - 图谱是否已通过 `story_graph_service.refresh_for_project` 正确填充
   - `_build_graph_query_terms` 过滤是否过于严格
   - 打分阈值是否过高

**验收标准**：在一个有 3 章以上记忆的项目上，Pipeline Trace 的 Retriever 步骤能看到 `graph_evidence_count >= 1`。

---

### B2. 图谱证据在 Prompt 中的呈现质量

**现状**：`graph_evidence` 已拼入上下文包，但在 Prompt 模板中如何呈现尚不明确。

**任务**：
1. 在诊断中心"上下文" tab 查看 `graph_evidence` 对应的 section 内容
2. 评估呈现格式是否清晰（实体描述、关系三元组、伏笔状态）
3. 若格式杂乱，优化 `context_retrieval_service` 中图谱证据的序列化格式

---

## 方向 C：工程清理

### C1. 退场旧链路

**现状**：`/api/ai/generate` 和 `/api/ai/generate-once` 仍保留，前端 AI 面板已默认使用 Pipeline 链路，但旧链路接口没有被弃用标记。

**任务**：
1. 评估哪些地方还在消费旧链路（grep `generate-once`、`/api/ai/generate`）
2. 若 AI 工具箱仍用旧链路，迁移到 Pipeline 或保留作为轻量工具链路
3. 在旧路由上加 deprecation 注释，明确是否计划移除

---

### C2. 世界观页面路由统一

**现状**：`/projects/:id/world` 路由存在，`project-world-page.tsx` 已实现，但部分世界观编辑功能也在 `project-workspace-page.tsx` 中重复存在。

**任务**：
1. 确认 `project-world-page.tsx` 与 `project-workspace-page.tsx` 中世界观相关功能的边界
2. 若重复，收口到独立的世界观页面，工作台只保留摘要预览 + 跳转入口

---

### C3. 数据库迁移状态确认

**现状**：`alembic/versions/` 目录为空（Glob 无结果），但应用启动时走 `init_db.py` 的 `create_all`，没有 Alembic 版本管理。

**任务**：
1. 确认当前是否有正式的 Alembic 迁移文件
2. 若没有，评估是否需要补建 Alembic 版本管理（尤其是 story graph 相关的新表）

---

## 优先顺序

```
Week 1
├── A1  侧边栏补世界观入口（30min，低风险）
├── A2  知识图谱 rebuild 接口 + 前端按钮（半天）
└── B1  图谱 RAG 验证（实测 + 排查，半天）

Week 2
├── B2  图谱证据 Prompt 呈现质量评估与优化
├── A3  AI 工作区定位决策 + 实现（视方案复杂度）
└── C1  旧链路退场评估

Week 3
├── C2  世界观页面职责收口
└── C3  Alembic 迁移补建（视必要性）
```

---

## 不纳入本阶段的内容

- benchmark 数据集建设（有价值但非阻塞，单独立项）
- memory_evidence_links 证据链（设计文档已有，优先级低于体验补全）
- Checker 自动重写闭环（需要较大架构改动，留 Phase 5）
- token budget 自动裁剪（当前硬编码 limit 可用，暂不阻塞）
- 多人协作 / 导出增强（超出当前阶段）
