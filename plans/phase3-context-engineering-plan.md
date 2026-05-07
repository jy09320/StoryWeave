# Phase 3 上下文工程实施计划

> 本文档面向 StoryWeave 的“第三档”AI 长篇续写能力建设。目标不是继续堆叠单点功能，而是建立一套可持续演进的上下文工程系统，让长篇项目在多章节、长周期创作中保持剧情连续性、设定一致性与可解释性。

## 一、背景与目标

当前项目已经具备：

- 项目、章节、编辑器、AI 续写基础链路
- 角色与世界观等结构化上下文入口
- 基础的 AI prompt 注入能力

但对长篇创作来说，现状仍然存在明显上限：

1. 续写主要依赖当前章节与即时输入，缺少跨章节连续性管理
2. 没有完整的长期记忆系统，主线、伏笔、角色状态容易丢失
3. 检索粒度偏粗，难以按剧情关系而非文本相似度取证
4. 生成链路缺少规划、校验、回写的闭环
5. 缺少稳定 benchmark，后续优化容易落回“体感调 prompt”

Phase 3 的核心目标分为五类：

1. 建立可持久化、可追溯、可分层治理的故事记忆系统
2. 建立面向剧情关系的图谱化上下文表示与混合检索能力
3. 将“一步直写”升级为“规划 -> 检索 -> 写作 -> 校验 -> 回写”的多阶段流水线
4. 为后续多 Agent 协作提供稳定的数据接口与编排边界
5. 建立自动评测与回归体系，使上下文工程具备持续优化基础

## 二、范围定义

### 本阶段纳入范围

1. 章节级结构化记忆抽取与回写
2. 项目级长期故事记忆聚合
3. 证据链与可追溯 memory 模型
4. 剧情图谱建模
5. 混合检索服务
6. 多阶段续写流水线
7. 连续性检查器
8. benchmark 与实验框架

### 本阶段暂不纳入范围

1. 面向最终用户的复杂可视化图谱编辑器
2. 多人协作写作冲突协调系统
3. 通用知识库问答系统
4. 复杂图数据库基础设施切换
5. 全量自动化剧情规划器

## 三、总体架构

Phase 3 目标架构由五个子系统组成：

1. 记忆治理系统
2. 剧情图谱系统
3. 上下文装配与混合检索系统
4. 多 Agent 续写流水线
5. 评测与回归系统

### 3.1 记忆治理系统

负责处理：

- 章节正文到结构化记忆的抽取
- 项目长期记忆的聚合
- 记忆的重要性评分、分层和更新
- 证据来源绑定

### 3.2 剧情图谱系统

负责处理：

- 人物、地点、组织、道具、秘密、规则等实体建模
- 章节事件建模
- 关系变化建模
- 伏笔与冲突链条建模

### 3.3 上下文装配与混合检索系统

负责处理：

- 最近章节摘要链装配
- 项目长期记忆装配
- 图谱结构检索
- 向量片段检索
- 统一 rerank 和 token budget 裁剪

### 3.4 多 Agent 续写流水线

负责处理：

- 规划本段续写目标
- 拉取相关上下文
- 生成正文
- 校验连续性与设定一致性
- 在接受后回写新记忆

### 3.5 评测与回归系统

负责处理：

- 固定 benchmark 场景回放
- 不同策略 A/B 对比
- 连续性与成本指标监控
- 回归测试与效果归档

## 四、分阶段实施计划

## Phase 0：基线定义与评测准备

### 目标

先定义问题、指标、样本和预算，避免后续建设目标模糊。

### 交付物

1. 连续性失败模式清单
2. benchmark 数据集初版
3. token budget 规则
4. Phase 3 架构说明文档

### 任务拆解

1. 梳理当前 AI 续写失败模式
   - 接不上上一章结尾
   - 角色口吻漂移
   - 已知信息边界错乱
   - 世界观规则冲突
   - 时间线断裂
   - 伏笔遗失或误回收

2. 建立 benchmark 场景集
   - 选取 30~50 组真实或半真实的长篇章节续写场景
   - 每组包含项目设定、前序章节、当前章节、续写目标、检查点

3. 定义核心指标
   - `continuity_score`
   - `timeline_conflict_rate`
   - `character_drift_rate`
   - `open_loop_recall`
   - `retrieval_precision`
   - `context_token_efficiency`
   - `avg_latency_ms`
   - `avg_generation_cost`

4. 定义上下文预算
   - 静态设定
   - 长期记忆
   - 近期剧情
   - 图谱证据
   - 检索片段
   - 当前章节正文
   - 用户指令

### 预计周期

1 周

## Phase 1：结构化记忆系统

### 目标

建立章节级与项目级记忆体系，让系统具备可持续的故事记忆能力。

### 交付物

1. 章节结构化记忆表
2. 项目长期记忆表
3. 证据链表
4. 章节记忆抽取服务
5. 长期记忆聚合服务
6. 内部调试视图或调试接口

### 核心数据模型

#### `chapter_memories`

建议字段：

- `id`
- `project_id`
- `chapter_id`
- `summary_short`
- `summary_long`
- `key_events` JSON
- `character_state_changes` JSON
- `relationship_changes` JSON
- `open_loops` JSON
- `resolved_loops` JSON
- `timeline_markers` JSON
- `important_objects` JSON
- `knowledge_state_changes` JSON
- `created_at`
- `updated_at`

#### `project_story_memories`

建议字段：

- `id`
- `project_id`
- `global_plot_summary`
- `active_conflicts` JSON
- `resolved_conflicts` JSON
- `character_arcs` JSON
- `global_open_loops` JSON
- `timeline_constraints` JSON
- `world_rules_active` JSON
- `updated_from_chapter_id`
- `updated_at`

#### `memory_evidence_links`

建议字段：

- `id`
- `memory_type`
- `memory_id`
- `source_chapter_id`
- `source_excerpt`
- `source_offset_start`
- `source_offset_end`
- `confidence`

### 核心能力

1. 章节保存后异步抽取结构化记忆
2. 按章节顺序聚合项目长期记忆
3. 为每条关键记忆绑定来源证据
4. 建立 memory 的基础更新策略

### 实施要点

1. 不在同步续写请求中做完整记忆重建
2. 记忆抽取应优先走结构化输出
3. 所有记忆对象必须能追溯到原文证据
4. 第一版先解决“记住”，第二版再解决“自动治理”

### 预计周期

2 周

## Phase 2：剧情图谱与混合检索

### 目标

让系统不仅能记住历史，还能按剧情结构获取相关上下文。

### 交付物

1. 剧情图谱基础表结构
2. 正文 chunk 切分与索引流程
3. 向量检索接口
4. 图谱结构检索接口
5. 混合检索服务
6. 上下文包装配器

### 剧情图谱模型

#### `story_entities`

用于表示：

- 角色
- 地点
- 组织
- 物品
- 秘密
- 规则

#### `story_events`

用于表示：

- 事件标题
- 事件摘要
- 所属章节
- 发生时间与地点
- 参与角色
- 前置事件
- 后续事件

#### `story_relations`

用于表示：

- 实体 A
- 实体 B
- 关系类型
- 当前状态
- 变化来源章节

#### `story_open_loops`

用于表示：

- 伏笔内容
- 埋设章节
- 当前状态
- 最近关联章节
- 计划回收线索

### 正文分块策略

建议：

1. 按自然段或场景切分
2. 控制单块在 500~1000 tokens
3. 每块挂 metadata：
   - `project_id`
   - `chapter_id`
   - `order_index`
   - `scene_label`
   - `characters`
   - `tags`

### 混合检索流程

1. 取最近章节摘要链
2. 按剧情图谱检索相关实体、事件、伏笔
3. 按向量检索相关正文片段
4. 统一 rerank
5. 组合为可控的上下文包

### 设计原则

1. 不以向量检索替代剧情结构检索
2. 不将所有命中片段直接拼入 prompt
3. 裁剪顺序必须可配置
4. 检索结果要可解释

### 预计周期

2 周

## Phase 3：多 Agent 续写流水线

### 目标

把当前“一步直写”升级为稳定、可控、可插拔的多阶段流水线。

### 交付物

1. Planner
2. Retriever
3. Writer
4. Continuity Checker
5. Continuation Pipeline Orchestrator
6. 生成后回写钩子

### 推荐 Agent 划分

#### 1. Planner

负责：

- 判断本次续写应推进什么
- 明确场景承接点
- 约束必须保留和必须避免的内容

输出建议结构：

- `scene_continuation_point`
- `writing_goal`
- `must_include`
- `must_avoid`
- `relevant_open_loops`
- `character_constraints`
- `timeline_constraints`

#### 2. Retriever

负责：

- 拉取近期记忆
- 检索剧情图谱证据
- 拉取相关正文片段
- 输出统一上下文包

#### 3. Writer

负责：

- 基于计划和上下文生成正文
- 优先保证承接与一致性

#### 4. Continuity Checker

负责：

- 检查时间线冲突
- 检查人设冲突
- 检查规则冲突
- 检查已知信息边界冲突
- 检查伏笔推进错位

输出建议结构：

- `timeline_conflicts`
- `character_conflicts`
- `world_rule_conflicts`
- `knowledge_boundary_conflicts`
- `open_loop_misalignment`
- `severity`

### 流水线步骤

1. 接收续写请求
2. Planner 生成续写计划
3. Retriever 生成上下文包
4. Writer 生成候选正文
5. Checker 进行连续性审查
6. 风险可接受则返回结果
7. 用户接受并保存后触发记忆与图谱回写

### 实施策略

1. 第一版先做单候选生成
2. Checker 先做“报警”，后续再考虑“自动重写”
3. 所有 Agent 都应有清晰输入输出结构
4. 编排逻辑统一收口到单独 pipeline service

### 预计周期

2~3 周

## Phase 4：自动评测与优化闭环

### 目标

让系统具备持续优化能力，而不是停留在人工主观调优阶段。

### 交付物

1. benchmark 回放工具
2. 自动评分工具
3. 实验配置体系
4. 回归测试报告模板

### 评测维度

1. 连续性
2. 设定一致性
3. 角色稳定性
4. 剧情推进有效性
5. 检索质量
6. token 成本
7. 平均响应时长

### 评测方法

1. 模型裁判评分
2. 规则校验
3. 人工 spot check
4. 多版本对比实验

### 推荐实验维度

1. `baseline`
2. `recent-summary-only`
3. `summary+memory`
4. `memory+graph+retrieval`
5. `planner+writer+checker`
6. `full-pipeline`

### 预计周期

1~2 周

## 五、模块划分建议

建议新增以下服务模块：

- `backend/app/services/chapter_memory_service.py`
- `backend/app/services/story_memory_service.py`
- `backend/app/services/story_graph_service.py`
- `backend/app/services/context_retrieval_service.py`
- `backend/app/services/continuation_planner_service.py`
- `backend/app/services/continuity_checker_service.py`
- `backend/app/services/continuation_pipeline_service.py`

职责建议如下：

1. `chapter_memory_service`
   - 抽取章节结构化记忆
   - 维护章节 memory 回写

2. `story_memory_service`
   - 聚合项目长期记忆
   - 维护记忆更新与合并策略

3. `story_graph_service`
   - 管理实体、事件、关系、伏笔图谱

4. `context_retrieval_service`
   - 统一管理摘要链、图谱检索、向量检索和 rerank

5. `continuation_planner_service`
   - 生成结构化续写计划

6. `continuity_checker_service`
   - 对候选文本做一致性校验

7. `continuation_pipeline_service`
   - 编排完整续写链路

## 六、数据库演进建议

推荐按以下顺序推进 schema：

1. `chapter_memories`
2. `project_story_memories`
3. `memory_evidence_links`
4. `story_entities`
5. `story_events`
6. `story_relations`
7. `story_open_loops`
8. `document_chunks` 或等价索引映射表

这样有几个好处：

1. 能先落 memory，再逐步扩展图谱
2. 不会因为检索基础设施未定而阻塞主线
3. 每个阶段都能单独验证收益

## 七、里程碑

### M1：记忆可视化可用

验收标准：

1. 章节记忆可抽取
2. 项目长期记忆可聚合
3. 关键 memory 可追溯到证据
4. 内部能查看 memory 内容

### M2：混合检索可用

验收标准：

1. 能获取最近章节摘要链
2. 能按图谱关系检索相关上下文
3. 能与向量检索结果统一重排
4. 能输出可解释的上下文包

### M3：多阶段续写闭环可用

验收标准：

1. 续写链路完成“规划 -> 检索 -> 写作 -> 校验”
2. 生成结果具备风险报告
3. 用户接受后可触发记忆回写
4. benchmark 相对 baseline 有可观提升

## 八、风险与控制

### 1. 系统复杂度快速上升

控制策略：

- 每阶段都保留 baseline fallback
- 每个子系统先做最小闭环

### 2. 记忆漂移与误抽取

控制策略：

- 所有高价值记忆必须有 evidence link
- 优先采用结构化抽取和聚合更新，而非全文自由摘要覆盖

### 3. 检索噪声过高

控制策略：

- 向量检索和结构检索分别打分
- 统一 rerank 后再进入 prompt

### 4. 响应延迟过高

控制策略：

- 续写链路只读取 memory
- 记忆更新与图谱回写走异步

### 5. 成本失控

控制策略：

- 以结构化摘要替代大段历史正文
- 固定 token budget
- 优先复用稳定前缀

## 九、排期建议

按单线推进估算：

- Phase 0：1 周
- Phase 1：2 周
- Phase 2：2 周
- Phase 3：2~3 周
- Phase 4：1~2 周

总计：8~10 周

## 十、下一步建议

为了把本计划转成可执行开发任务，建议接着补三份配套设计稿：

1. `memory-schema-design.md`
   - 细化表结构、字段定义、索引与约束

2. `continuation-pipeline-design.md`
   - 细化 Planner、Retriever、Writer、Checker 的输入输出协议

3. `benchmark-design.md`
   - 细化测试样本结构、评分规则、实验维度与报告模板

在这三份文档完成前，不建议直接大规模开工多 Agent 或剧情图谱实现。
