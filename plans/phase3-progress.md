# Phase 3 实施进度

> 本文档是 [`phase3-context-engineering-plan.md`](./phase3-context-engineering-plan.md) 的当前实施状态跟踪，记录各子系统的完成情况与待完成项。

## 整体进度

Phase 3 目标架构的五个子系统完成情况：

| 子系统 | 状态 | 说明 |
|---|---|---|
| 记忆治理系统 | ✅ 已完成 | 章节记忆 + 项目长期记忆均已落地 |
| 剧情图谱系统 | ❌ 未实装 | 数据模型预留，服务层未实现 |
| 上下文装配与混合检索 | ✅ 已完成 | 向量检索 + 上下文包装配可用，图谱部分预留 |
| 多 Agent 续写流水线 | ✅ 已完成 | Planner / Retriever / Writer / Checker 全部落地 |
| Pipeline Trace 可视化与开发者诊断 | 🟡 计划已立项 | 已写入 Phase 3 计划文档，尚未进入实现 |
| 评测与回归系统 | 🟡 部分完成 | 目录与脚本骨架已建立，数据集待补充 |

---

## 子系统详情

### 1. 记忆治理系统

**状态：已完成（对应 Phase 3 中 Phase 1 阶段目标）**

已完成：
- `chapter_memories` 表：存储章节级结构化记忆（key_events、open_loops、character_state_changes、timeline_markers 等）
- `project_story_memories` 表：存储项目级长期记忆（global_plot_summary、active_conflicts、world_rules_active 等）
- `chapter_memory_service.py`：章节保存后异步抽取结构化记忆
- `story_memory_service.py`：项目级长期记忆聚合
- 章节保存时自动触发 memory + chunk 回写钩子

待完善：
- `memory_evidence_links` 表（证据链）已在设计文档定义，尚未落库
- Memory 版本历史与生命周期治理（设计文档中标注为"后续版本"）

---

### 2. 剧情图谱系统

**状态：未实装（对应 Phase 3 中 Phase 2 阶段目标）**

当前状态：
- `context_bundle.graph_evidence` 字段已预留，始终返回空数组
- `story_entities` / `story_events` / `story_relations` / `story_open_loops` 等表尚未创建
- `story_graph_service.py` 尚未实现

影响：
- 续写 Retriever 的图谱证据通道为空，当前仅依赖向量检索 + 记忆装配
- Checker 的图谱关联证据追溯能力待图谱完成后补充

---

### 3. 上下文装配与混合检索系统

**状态：已完成（向量检索部分）**

已完成：
- `context_retrieval_service.py`：向量检索 + 近期记忆装配
- `chapter_chunk_service.py`：正文 chunk 切分与索引
- `_build_context_bundle()` 在 pipeline 中完整组装上下文包：
  - project_summary / story_memory_summary / current_chapter_summary
  - current_chapter_tail（当前章节正文尾部，最关键的续写锚点）
  - recent_memories（最近 3 章记忆）
  - retrieved_chunks（向量检索片段，最多 6 条）
  - character_context / world_context
  - token_budget_report

待完成：
- graph_evidence（剧情图谱检索，依赖子系统 2）
- token budget 自动裁剪（当前只有报告，无自动裁剪逻辑）

---

### 4. 多 Agent 续写流水线

**状态：已完成（对应 Phase 3 中 Phase 3 阶段目标）**

已完成的服务：
- `continuation_pipeline_service.py`：Pipeline 编排器（Orchestrator）
- `continuation_planner_service.py`：Planner — 规则 + LLM 双步规划（temperature=0.2）
- `continuity_checker_service.py`：Checker — 规则前置 + LLM 深度校验（temperature=0.1）
- `context_retrieval_service.py`：Retriever — 复用现有向量检索 + 上下文装配

API 端点：
- `POST /api/ai/continuation/generate`：生产链路
- `POST /api/ai/continuation/debug`：调试链路（含 plan / context_bundle 中间产物）

Fallback 策略（已实现）：
- Planner 失败 → 使用 `build_default_plan()`，记录 `"planner:default"`
- Retriever 失败 → 使用空 chunks，记录 `"retriever:empty_chunks"`
- Checker 失败 → 返回正文，标记 `check_status = "skipped"`，记录 `"checker:skipped"`

待完成：
- 用户接受并保存章节后触发 memory 回写钩子（当前回写由章节保存流程覆盖，Pipeline 无独立回写）
- Checker 自动重写闭环（当前仅报警，不自动修正）
- 旧链路灰度退出策略（当前两条链路共存，前端已切换 Pipeline 链路）

---

### 5. 评测与回归系统

**状态：部分完成**

已完成：
- `backend/app/benchmarks/` 目录已建立
- `scripts/benchmark_replay.py` 脚本骨架存在
- 接入了 `/api/ai/generate-once`、`/api/ai/continuation/generate`、`/api/ai/continuation/debug` 三条回放链路

待完成（对应 `benchmark-design.md`）：
- benchmark 数据集（`datasets/continuation/`）：当前仅有示例样本，正式样本未补充
- 自动评分与 LLM 裁判层
- Markdown 回归报告生成
- 轻回归 / 全回归的触发规范

---

### 6. Pipeline Trace 可视化与开发者诊断

**状态：已进入计划，待实现（对应 Phase 3A 阶段目标）**

已明确的方向：
- 已在 [`phase3-context-engineering-plan.md`](./phase3-context-engineering-plan.md) 中新增 `Phase 3A：Pipeline Trace 可视化与开发者诊断`
- 明确采用“两层可视化”：
  - 用户层：轻量步骤状态条，回答“现在跑到哪一步了”
  - 开发者层：完整 Trace 时间线，回答“哪一步慢、哪一步被跳过、哪一步发生 fallback”
- 最小 Trace 节点已确定：
  - `planner`
  - `retriever`
  - `context_bundle`
  - `writer`
  - `checker`
  - `fallback_decision`
  - `final_output`

待实现交付物：
- 后端统一 `pipeline trace` 数据结构
- Pipeline 各阶段 trace 事件记录与耗时统计
- `/api/ai/continuation/debug` 返回完整 trace
- 常规生成接口可选返回精简 trace 摘要
- 前端顶部步骤状态条
- 独立 Trace / Diagnostics 面板，替代当前零散调试卡片

为什么当前优先做它：
- 现有 Pipeline 已可用，但用户仍只能感知“转圈 -> 出结果”
- 开发者只能依赖日志和 JSON 排障，链路顺序与耗时不直观
- 后续推进 graph RAG、关系约束、benchmark 对比时，缺少一个前端可观测载体

---

## 当前主要风险

1. **旧链路未退出**：`/api/ai/generate` 和 `/api/ai/generate-once` 仍保留，与 Pipeline 链路并存，前端已切换但旧链路维护成本仍存在
2. **图谱缺失导致 Retriever 能力上限**：当前仅向量检索，跨章节剧情结构关系无法被检索命中
3. **benchmark 数据集为空**：无法用量化指标衡量 Pipeline 相对旧链路的实际提升
4. **token budget 无自动裁剪**：当前上下文包大小依赖各字段硬编码的字符 limit，缺乏统一裁剪策略
5. **链路可观测性不足**：用户无法区分“检索慢 / 写作慢 / Checker 被跳过”，开发者也难以前端直观看到完整执行顺序

---

## 下一步建议优先级

1. 实现 `Phase 3A：Pipeline Trace 可视化与开发者诊断`
   - 后端补齐统一 trace 结构、阶段耗时、skip / fallback 记录
   - 前端补齐步骤状态条与独立 Trace / Diagnostics 面板
2. 补充 benchmark 数据集（5 个高价值样本即可启动轻回归）
3. 落地 `memory_evidence_links` 表，完成证据追溯能力
4. 评估是否正式废弃旧链路或保留为 fallback
5. 开始剧情图谱最小实现（`story_entities` + `story_events` 表 + 简单图谱检索）
