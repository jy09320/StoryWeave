# Phase 3 实施进度

> 本文档是 [`phase3-context-engineering-plan.md`](./phase3-context-engineering-plan.md) 的当前实施状态跟踪。

## 整体进度

| 子系统 | 状态 | 说明 |
|---|---|---|
| 记忆治理系统 | ✅ 已完成 | 章节记忆 + 项目长期记忆均已落地 |
| 剧情图谱系统 | ✅ 已完成（基础版） | 数据模型、后端 API、前端知识图谱可视化页面已落地 |
| 上下文装配与混合检索 | ✅ 已完成（向量部分） | 向量检索 + 上下文包装配可用，图谱 RAG 通道预留 |
| 多 Agent 续写流水线 | ✅ 已完成 | Planner / Retriever / Writer / Checker 全部落地 |
| Pipeline Trace 可视化与开发者诊断 | ✅ 已完成 | 用户步骤状态条 + 诊断中心面板均已实现 |
| 评测与回归系统 | 🟡 部分完成 | 目录与脚本骨架已建立，数据集待补充 |

---

## 子系统详情

### 1. 记忆治理系统

**状态：已完成**

- `chapter_memories` 表：章节级结构化记忆
- `project_story_memories` 表：项目级长期记忆
- `chapter_memory_service.py`：章节保存后异步抽取
- `story_memory_service.py`：项目级长期记忆聚合
- 章节保存时自动触发 memory + chunk 回写钩子

待完善（低优先级）：
- `memory_evidence_links` 表（证据链）已在设计文档定义，尚未落库
- Memory 版本历史与生命周期治理

---

### 2. 剧情图谱系统

**状态：已完成**

已完成：
- `story_entities` / `story_events` / `story_relations` / `story_open_loops` 表已创建
- `backend/app/api/routes/story_graph.py`：`GET /{project_id}/story-graph` 路由
- `backend/app/schemas/project.py`：StoryGraphResponse 及子类型完整定义
- `backend/app/services/story_graph_service.py`：从 `chapter_memories` + 角色档案自动构建图谱，章节保存时自动触发 `refresh_for_project`
- `frontend/src/pages/project-graph-page.tsx`：D3 力导向图可视化（筛选/拖拽/缩放/hover详情）
- 图谱 RAG：`context_retrieval_service._retrieve_graph_evidence` 已实现实体/事件/关系/伏笔的检索打分逻辑，接入 Retriever 的 `graph_evidence` 通道

待验证：
- 图谱 RAG 在真实续写请求中是否返回非空 `graph_evidence`（需实测确认打分阈值和 query term 构建是否合理）
- 前端知识图谱页面缺少"主动重建图谱"的独立按钮（当前仅有刷新快照的按钮）

---

### 3. 上下文装配与混合检索系统

**状态：已完成（向量检索部分）**

已完成：
- `context_retrieval_service.py`：向量检索 + 近期记忆装配
- `chapter_chunk_service.py`：正文 chunk 切分与索引
- `_build_context_bundle()` 完整装配上下文包

待完成：
- `graph_evidence` 通道（依赖剧情图谱 RAG 服务落地）
- token budget 自动裁剪

---

### 4. 多 Agent 续写流水线

**状态：已完成**

- `continuation_pipeline_service.py`：Pipeline 编排器
- `continuation_planner_service.py`：Planner
- `continuity_checker_service.py`：Checker
- `context_retrieval_service.py`：Retriever

API 端点：
- `POST /api/ai/continuation/generate`：生产链路（SSE 流式，含 trace）
- `POST /api/ai/continuation/debug`：调试链路

Fallback 策略已实现（planner/retriever/checker 均有独立 fallback）。

待完成：
- Checker 自动重写闭环（当前仅报警）
- 旧链路 `/api/ai/generate` 的退场计划

---

### 5. Pipeline Trace 可视化与开发者诊断

**状态：已完成**

已完成：
- 后端统一 trace 数据结构，每阶段记录耗时、状态、skip/fallback 原因、输入输出摘要
- SSE 流式 progress 事件，前端实时收到 trace 更新
- **用户层**：AI 侧栏生成过程中的步骤状态条（planner/retriever/context_bundle/writer/checker/final_output）
- **开发者层**：诊断中心面板（Ctrl/点击进入），包含：
  - 风险提示 tab（continuity_report / warnings / fallbacks）
  - 上下文 tab（context sections / final instruction 可复制）
  - 检索 tab（query terms / chunk 列表 / match reasons / score）
  - 链路追踪 tab（完整 trace 时间线、每步耗时、input/output 摘要可展开）
- 支持运行深度诊断（`/api/ai/continuation/debug`）

---

### 6. 评测与回归系统

**状态：部分完成**

已完成：
- `backend/app/benchmarks/` 目录结构
- `scripts/benchmark_replay.py` 脚本骨架
- 接入三条回放链路

待完成：
- benchmark 数据集（正式样本未补充，目前仅示例）
- 自动评分与 LLM 裁判层
- Markdown 回归报告生成

---

## 主要剩余风险

1. **图谱 RAG 待实测验证**：`_retrieve_graph_evidence` 已实现，但尚未确认在真实续写请求中是否返回非空 `graph_evidence`，需要在有完整章节记忆的项目上实测
2. **benchmark 数据集为空**：无法用量化指标衡量 Pipeline 效果
3. **旧链路未退出**：`/api/ai/generate` 和 `/api/ai/generate-once` 仍保留，维护成本存在
4. **token budget 无自动裁剪**：上下文包大小依赖各字段硬编码字符 limit
5. **前端缺少"主动重建图谱"入口**：知识图谱页面的"刷新"只拉取快照，不触发后端重建

---

## 下一步建议优先级

1. **验证图谱 RAG**：在有 3+ 章记忆的项目上运行 Pipeline，在诊断中心确认 `graph_evidence_count >= 1`
2. **补全侧边栏世界观入口**：`/projects/:id/world` 路由存在但侧边栏没有导航链接
3. **新增"重建图谱"接口与前端按钮**：让用户能主动触发 `story_graph_service.refresh_for_project`
4. **补充 benchmark 数据集**：5 个高价值样本即可启动轻回归
5. **评估旧链路退场**：清理 `/api/ai/generate` 或明确保留为 fallback
