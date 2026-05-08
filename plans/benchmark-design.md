# StoryWeave Benchmark Design

> 本文档是 [`phase3-context-engineering-plan.md`](./phase3-context-engineering-plan.md) 的第三份配套设计稿，用于定义 StoryWeave 在长篇续写场景下的 benchmark 数据结构、评测维度、实验分组与回归流程。目标不是一次性做出完整评测平台，而是先建立一套可持续复用的基线与样本规范，避免后续优化重新退回“凭体感调 prompt”。

## 一、设计目标

Benchmark 体系需要先解决四件事：

1. 把“续写失败”从模糊体验转成可复现样本
2. 把“效果更好”从主观感觉转成稳定指标
3. 让旧链路、Pipeline、后续 graph/retrieval 增强都能在同一套样本上比较
4. 让每次关键改动都能留下回归记录，而不是只看单次人工调试

当前阶段优先保证：

- 样本结构稳定
- 结果可归档
- 支持手工 spot check 与规则校验
- 能平滑接入现有 `/api/ai/generate-once`、`/api/ai/continuation/generate`、`/api/ai/continuation/debug`

当前阶段暂不追求：

- 完整自动裁判平台
- 大规模在线评测调度
- UI 化的 benchmark 管理后台
- 自动重放所有历史用户项目

## 二、适用范围

本 benchmark 只面向 StoryWeave 的“章节续写”能力，尤其关注：

1. 当前章节未写完时的承接是否自然
2. 跨章节承接是否稳定
3. 人设、时间线、世界设定是否漂移
4. 检索上下文是否真的帮助续写，而不是制造噪声
5. Pipeline 的 Planner / Retriever / Checker 是否带来可观收益

不纳入第一版 benchmark 的范围：

1. 通用问答
2. 角色卡生成
3. 设定整理
4. 富文本编辑器交互性能
5. 多人协作冲突处理

## 三、评测对象

第一版建议固定以下 6 组实验对象：

1. `baseline`
   - 旧 `generate-once` 链路
   - 作为后续所有优化的对照基线

2. `recent-summary-only`
   - 只使用最近章节摘要和当前章节上下文
   - 用于观察“轻上下文”表现

3. `summary+memory`
   - 引入 chapter memory / story memory

4. `memory+retrieval`
   - 引入 memory + chunk retrieval

5. `planner+writer+checker`
   - 启用 Planner、Writer、Checker，但 retrieval 仍保持轻量

6. `full-pipeline`
   - 当前完整 continuation pipeline

说明：

- 第一阶段即使系统内部尚未完全提供以上全部开关，也要先保留实验命名与结果字段
- 尚未实现的组可以先记为 `not_available`

## 四、失败模式清单

Phase 0 先围绕以下失败模式建样本：

1. `current_chapter_continuation_miss`
   - 当前章节已经写了一部分，续写却错误回接上一章

2. `previous_chapter_tail_misalignment`
   - 确实应承接上一章，但开头衔接生硬或错位

3. `character_voice_drift`
   - 角色语气、立场、习惯表达明显漂移

4. `timeline_conflict`
   - 时间顺序、地点切换、事件先后冲突

5. `knowledge_boundary_break`
   - 角色知道了不该知道的信息

6. `world_rule_conflict`
   - 违反既有设定、能力规则、限制条件

7. `open_loop_drop`
   - 应承接的伏笔完全丢失

8. `premature_loop_resolution`
   - 不该回收的伏笔被过早回收

9. `retrieval_noise_pollution`
   - 检索结果把生成带偏

10. `instruction_underfollow`
    - 用户明确要求未被执行

建议每种失败模式至少准备 3 组样本，第一版总量控制在 30~50 组。

## 五、样本结构设计

每个 benchmark 样本建议为一个独立 JSON 对象，便于后续做批量回放。

### 5.1 顶层结构

```json
{
  "id": "bench-current-tail-001",
  "name": "当前章节半段续写应承接本章尾部",
  "group": "current_chapter_continuation",
  "enabled": true,
  "project_snapshot": {},
  "request": {},
  "expectations": {},
  "metadata": {}
}
```

### 5.2 `project_snapshot`

用于描述一次续写所需的最小项目上下文，建议包含：

```json
{
  "project_title": "",
  "project_summary": "",
  "characters": [],
  "worldbook": [],
  "chapters": [],
  "story_memory": {},
  "recent_memories": [],
  "notes": []
}
```

字段约定：

1. `characters`
   - 只放对本次续写有影响的关键角色

2. `worldbook`
   - 只放必须遵守的设定规则

3. `chapters`
   - 至少包含：
     - 上一章摘要或尾段
     - 当前章节已有正文
     - 当前章节标题或场景信息

4. `story_memory`
   - 用于模拟 `project_story_memories`

5. `recent_memories`
   - 用于模拟最近 1~3 章 memory

第一版允许用“脱敏后的手工整理数据”作为样本来源，不要求直接导出真实数据库记录。

### 5.3 `request`

用于描述本次实际要重放的续写请求：

```json
{
  "text": "",
  "instruction": "",
  "chapter_id": "chapter-003",
  "model_provider": "openai",
  "model_id": "gpt-4.1",
  "temperature": 0.8,
  "max_tokens": 1200
}
```

说明：

- `text`
  - 对应当前用户传入的待承接正文或选中正文

- `instruction`
  - 对应“继续写”“加强冲突”“保持克制语气”这类直接创作指令

- `model_provider` / `model_id`
  - 可固定，也可在运行 benchmark 时由实验配置覆盖

### 5.4 `expectations`

用于定义规则检查、人工抽查和模型裁判的依据：

```json
{
  "must_include": [],
  "must_avoid": [],
  "continuation_anchor": "",
  "expected_open_loops": [],
  "forbidden_conflicts": [],
  "quality_notes": []
}
```

字段说明：

1. `must_include`
   - 必须出现的人物、动作、信息或剧情推进点

2. `must_avoid`
   - 禁止出现的错误，比如跳到第二天、角色提前知道秘密、突然切换视角

3. `continuation_anchor`
   - 这次应承接的位置描述
   - 例如：
     - “承接当前章节最后一句”
     - “承接上一章结尾对话”

4. `expected_open_loops`
   - 本轮续写应该保持或推进的伏笔

5. `forbidden_conflicts`
   - 显式标注不能触发的连续性问题类型

6. `quality_notes`
   - 供人工复核的附加提示

### 5.5 `metadata`

建议包含：

```json
{
  "source": "manual-curation",
  "difficulty": "medium",
  "failure_modes": ["current_chapter_continuation_miss"],
  "tags": ["continuation", "chapter-tail", "pipeline"],
  "created_at": "2026-05-08"
}
```

## 六、运行结果结构

每次实验对象对某个 benchmark 样本跑完之后，建议记录为一个结果对象：

```json
{
  "benchmark_id": "bench-current-tail-001",
  "variant": "full-pipeline",
  "status": "completed",
  "generated_text": "",
  "warnings": [],
  "fallbacks": [],
  "metrics": {},
  "artifacts": {},
  "review": {}
}
```

### 6.1 `metrics`

第一版建议统一保留以下字段：

```json
{
  "continuity_score": null,
  "timeline_conflict_rate": null,
  "character_drift_rate": null,
  "open_loop_recall": null,
  "retrieval_precision": null,
  "context_token_efficiency": null,
  "avg_latency_ms": null,
  "generation_cost": null
}
```

说明：

1. `continuity_score`
   - 综合连续性得分，建议 1~5 或 0~100

2. `timeline_conflict_rate`
   - 该样本是否出现时间线冲突
   - 第一版可先用 `0` / `1`

3. `character_drift_rate`
   - 是否出现明显人设漂移
   - 第一版可先用 `0` / `1`

4. `open_loop_recall`
   - 应承接的伏笔是否被保留或推进

5. `retrieval_precision`
   - 检索结果中真正有帮助的比例
   - 第一版主要用于 debug 样本，不必强求自动化

6. `context_token_efficiency`
   - 上下文 token 中实际产生帮助的比例估计

7. `avg_latency_ms`
   - 单次请求总耗时

8. `generation_cost`
   - 单次请求估算成本

### 6.2 `artifacts`

用于归档可复核证据：

```json
{
  "plan": {},
  "context_bundle": {},
  "continuity_report": {},
  "retrieval_preview": {},
  "request_payload": {}
}
```

要求：

- `baseline` 至少保留 `request_payload` 与 `generated_text`
- `full-pipeline` 建议保留 `plan`、`context_bundle`、`continuity_report`
- 回归争议样本必须能从 artifacts 反查“为什么这次会写错”

### 6.3 `review`

用于记录自动评分与人工复核：

```json
{
  "rule_checks": [],
  "llm_judgement": {},
  "human_verdict": "",
  "notes": []
}
```

第一版建议：

- 规则检查先做硬约束
- LLM 裁判只做辅助评分
- 最终抽样仍保留人工 spot check

## 七、评测维度与判分建议

### 7.1 规则型指标

适合优先自动化：

1. 是否正确承接当前章节或上一章指定锚点
2. 是否包含 `must_include`
3. 是否违反 `must_avoid`
4. 是否出现显式禁用的人名、地点、时间跳变
5. Checker 是否被跳过
6. 是否触发 fallback

### 7.2 模型裁判型指标

适合后续逐步补齐：

1. 连续性整体评价
2. 人设稳定度
3. 文风延续度
4. 剧情推进有效性
5. 检索材料利用质量

建议使用统一裁判 prompt，要求输出结构化 JSON，而不是自由评论。

### 7.3 人工 spot check

建议每次只抽查：

1. 所有高风险失败样本
2. 所有从 `pass -> fail` 的回归样本
3. 随机 10% 正常样本

## 八、实验分层建议

为避免一次性做过重，benchmark 建议分三层：

### Layer A：样本归档层

目标：

- 能收集 benchmark JSON 样本
- 能记录变体结果

交付：

- benchmark 数据目录
- 样本模板
- 结果归档目录约定

### Layer B：回放执行层

目标：

- 给定一个样本和实验变体，能调用对应链路跑出结果

建议接入顺序：

1. `/api/ai/generate-once`
2. `/api/ai/continuation/generate`
3. `/api/ai/continuation/debug`

### Layer C：评分与报告层

目标：

- 自动汇总 pass/fail、耗时、fallback、checker 覆盖率
- 输出一份 markdown 或 JSON 报告

## 九、目录结构建议

建议在仓库中使用如下目录：

```text
backend/app/benchmarks/
  README.md
  datasets/
    continuation/
      sample.v1.json
  reports/
    .gitkeep
```

说明：

- `datasets/continuation/`
  - 存 benchmark 样本集

- `reports/`
  - 存实验输出结果

第一版先把目录和样例放进仓库即可，不强求立刻提交大批真实样本。

## 十、与现有实现的衔接

当前仓库已有如下能力，可直接复用：

1. `POST /api/ai/generate-once`
   - 旧链路基线

2. `POST /api/ai/continuation/generate`
   - 生产态 pipeline 结果

3. `POST /api/ai/continuation/debug`
   - 获取 `plan`、`context_bundle`、`continuity_report`

因此第一版 benchmark 回放工具不需要另起协议，只需要解决三件事：

1. 如何把 benchmark 样本映射成请求载荷
2. 如何选择实验变体对应的接口
3. 如何把结果写入统一归档格式

## 十一、回归运行建议

建议设置两种回归节奏：

1. 轻回归
   - 选 5~10 个高价值样本
   - 用于日常改 prompt、改 retrieval、改 checker 后快速复核

2. 全回归
   - 跑完整 30~50 个样本集
   - 用于阶段性里程碑验收

推荐触发时机：

1. 修改 `ai_service`
2. 修改 `context_retrieval_service`
3. 修改 `continuation_planner_service`
4. 修改 `continuity_checker_service`
5. 修改 `continuation_pipeline_service`

## 十二、第一版落地顺序

建议按以下顺序推进：

1. 补齐本设计文档
2. 在仓库中建立 benchmark 数据目录与样本模板
3. 先手工整理 5 个高价值样本
4. 编写最小 benchmark replay 脚本
5. 先输出 JSON 结果，再补 markdown 报告
6. 后续再接规则评分与 LLM 裁判

## 十三、验收标准

第一版 benchmark 体系达到以下标准即可视为可用：

1. 仓库中有稳定的 benchmark 样本格式
2. 能用同一份样本分别跑旧链路和 pipeline
3. 能保留生成结果、耗时、warnings、fallbacks、continuity_report
4. 能快速看出某次改动是否让已有样本退化
5. 能为后续 story graph / retrieval / checker 优化提供统一对照基线

## 十四、结语

Phase 3 接下来最值得做的，不是继续堆更多调试按钮，而是先把“怎么证明这次改动更好”这件事工程化。  
`benchmark-design.md` 的价值就在这里：它把样本、指标、回放、报告先钉成统一接口，后面不管是旧链路修补、Pipeline 迭代，还是更远一点的 story graph 接入，都能在同一把尺子下比较。
