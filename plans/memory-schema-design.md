# StoryWeave Memory Schema 设计稿

> 本文档是 [`phase3-context-engineering-plan.md`](./phase3-context-engineering-plan.md) 的第一份配套设计稿，聚焦 Phase 1 所需的记忆数据结构。目标是先定义稳定的数据底座，为后续抽取、聚合、检索、连续性校验与多 Agent 编排提供统一存储模型。

## 一、设计目标

Memory schema 需要满足五个要求：

1. 支持章节级结构化记忆
2. 支持项目级长期故事记忆
3. 支持证据追溯
4. 支持后续图谱、检索与重排系统消费
5. 支持未来记忆评分、热度分层和生命周期治理

当前阶段不追求一次性把所有高级语义都建模完整，先保证：

- 表结构稳定
- 写入路径清晰
- 查询路径可扩展
- 与现有 `projects` / `chapters` 结构兼容

## 二、总体建模原则

1. **章节记忆与项目记忆分层**
   - 章节记忆表达“这一章发生了什么”
   - 项目记忆表达“到当前为止，整部作品推进到了什么状态”

2. **结构化字段优先于自由文本**
   - 保留 `summary_short` / `summary_long`
   - 核心状态使用 JSON 结构化存储

3. **高价值记忆必须可追溯**
   - 每条关键记忆应能定位到来源章节和原文片段

4. **先兼容关系型数据库，再为图谱扩展预留边界**
   - 第一版采用 PostgreSQL 普通表 + JSON
   - 后续图谱与向量索引从这些表派生

## 三、核心表设计

## 3.1 `chapter_memories`

用途：

- 存储单章的结构化记忆快照
- 作为近期上下文和长期聚合的基础输入

建议字段：

- `id`
- `project_id`
- `chapter_id`
- `summary_short`
- `summary_long`
- `key_events`
- `character_state_changes`
- `relationship_changes`
- `open_loops`
- `resolved_loops`
- `timeline_markers`
- `important_objects`
- `knowledge_state_changes`
- `created_at`
- `updated_at`

字段说明：

- `summary_short`
  - 用于快速上下文装配
  - 建议长度 100~300 字

- `summary_long`
  - 用于更完整的章节记忆
  - 建议长度 300~1000 字

- `key_events`
  - 数组
  - 每项建议包含 `title`、`summary`、`actors`、`location`、`impact`

- `character_state_changes`
  - 数组
  - 每项建议包含 `character_id_or_name`、`before`、`after`、`reason`

- `relationship_changes`
  - 数组
  - 每项建议包含 `entity_a`、`entity_b`、`change`、`status_after`

- `open_loops`
  - 数组
  - 每项建议包含 `label`、`description`、`priority`

- `resolved_loops`
  - 数组
  - 每项建议包含 `label`、`resolution`

- `timeline_markers`
  - 数组
  - 每项建议包含 `time`、`location`、`scene`

- `important_objects`
  - 数组
  - 每项建议包含 `name`、`state`、`owner`

- `knowledge_state_changes`
  - 数组
  - 每项建议包含 `subject`、`learned_fact`、`visibility`

约束建议：

- `chapter_id` 唯一
- `project_id` 建索引

## 3.2 `project_story_memories`

用途：

- 表达某个项目当前整体故事状态
- 作为长期记忆主入口

建议字段：

- `id`
- `project_id`
- `global_plot_summary`
- `active_conflicts`
- `resolved_conflicts`
- `character_arcs`
- `global_open_loops`
- `timeline_constraints`
- `world_rules_active`
- `updated_from_chapter_id`
- `created_at`
- `updated_at`

字段说明：

- `global_plot_summary`
  - 当前主线整体进度概述

- `active_conflicts`
  - 当前仍在推进的主线和支线冲突

- `resolved_conflicts`
  - 已完成或已关闭冲突

- `character_arcs`
  - 主要角色的阶段弧线状态

- `global_open_loops`
  - 尚未回收的高价值伏笔或悬念

- `timeline_constraints`
  - 当前必须满足的时间线事实

- `world_rules_active`
  - 已被正文确认、后续不能随意违反的规则

约束建议：

- `project_id` 唯一
- `updated_from_chapter_id` 可为空，但建索引有价值

## 3.3 `memory_evidence_links`

用途：

- 记录结构化记忆与原文证据之间的映射
- 为后续连续性检查器和调试面板提供追溯能力

建议字段：

- `id`
- `memory_kind`
- `memory_owner_id`
- `source_chapter_id`
- `source_excerpt`
- `source_offset_start`
- `source_offset_end`
- `confidence`
- `created_at`

字段说明：

- `memory_kind`
  - 例如：`chapter_memory`、`project_story_memory`

- `memory_owner_id`
  - 对应 memory 主记录 id

- `source_excerpt`
  - 原文片段摘要或截断片段

- `source_offset_start` / `source_offset_end`
  - 在章节纯文本中的相对位置

- `confidence`
  - 0~1
  - 表示抽取器对这条映射的置信度

说明：

- 第一版先使用宽松的“owner id + kind”关联
- 后续如果 evidence 粒度进一步细化，再拆到字段级别

## 四、与现有数据模型的关系

### 4.1 与 `chapters` 的关系

- `chapter_memories.chapter_id -> chapters.id`
- 一章对应一条当前有效章节记忆
- 未来如果需要保留版本化 memory，再额外引入 `chapter_memory_versions`

### 4.2 与 `projects` 的关系

- `project_story_memories.project_id -> projects.id`
- 一个项目对应一条当前有效长期记忆

### 4.3 与角色和世界观的关系

第一版不直接对 `characters` / `world_settings` 做硬外键展开。

原因：

1. 抽取阶段往往先拿到角色名、别名或未标准化实体
2. 如果过早强依赖角色 id，会阻塞抽取与聚合
3. 后续图谱阶段更适合统一做实体归一化

## 五、写入与更新策略

## 5.1 章节记忆写入

建议触发时机：

1. 章节保存后且正文变化超过阈值
2. 章节状态切换为 `done`
3. 用户手动触发“更新记忆”

建议流程：

1. 读取 `chapter.plain_text`
2. 调用结构化抽取器
3. upsert `chapter_memories`
4. 写入 `memory_evidence_links`

## 5.2 项目记忆更新

建议触发时机：

1. 某章记忆首次生成
2. 某章记忆被刷新
3. 关键章节状态切换

建议流程：

1. 取最近章节记忆与上一版项目记忆
2. 聚合更新主线、冲突、角色弧线、伏笔等
3. upsert `project_story_memories`
4. 记录对应 evidence

## 六、查询与消费场景

### 6.1 AI 续写

读取：

- 当前项目长期记忆
- 最近 1~3 章章节记忆
- 当前章节元信息

### 6.2 连续性检查

读取：

- 长期记忆中的时间线和规则约束
- 最近章节的角色状态变化
- 证据链

### 6.3 图谱构建

读取：

- `chapter_memories` 中的事件、角色变化、伏笔
- `project_story_memories` 中的全局冲突和弧线

## 七、第一版不做的内容

为了控制复杂度，以下能力不在第一版 schema 中强制落地：

1. memory 版本历史
2. memory 热度评分字段
3. memory 生命周期状态机
4. 字段级 evidence 多对多映射
5. 正式剧情图谱表
6. 向量索引映射表

这些能力将在后续图谱与检索阶段补充。

## 八、迁移建议

推荐落库顺序：

1. `chapter_memories`
2. `project_story_memories`
3. `memory_evidence_links`

这样可以先把 Phase 1 的抽取与聚合链路接起来，再继续扩到图谱和混合检索。

## 九、下一步接口需求

在本 schema 基础上，后续需要配套：

1. `chapter_memory_service`
2. `story_memory_service`
3. `continuation_pipeline` 对 memory 的读取接口
4. 内部调试接口或只读管理视图

在这些接口设计完成前，memory 表先作为基础设施落库，不直接暴露给最终用户。
