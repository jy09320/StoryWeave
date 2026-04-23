# MVP 第一阶段执行计划

## 目标
围绕[`PLAN.md`](PLAN.md)的 Phase 1，完成“项目管理 → 章节管理 → 编辑器工作流 → AI 续写 → 版本回看/恢复 → 误操作防护”的 MVP 闭环，并把当前工作重点正式切换到“验收收口、体验加固、文档归档”。

## 当前现状

### 已完成能力

#### 后端
- [`backend/app/main.py`](backend/app/main.py) 已完成应用启动、生命周期初始化、CORS、中间件注册与健康检查接口
- [`backend/app/main.py`](backend/app/main.py) 已注册项目、章节、AI 三类核心路由
- [`backend/app/models/project.py`](backend/app/models/project.py) 已包含 `Project`、`Chapter`、`ChapterVersion` 三个核心实体
- [`backend/alembic/versions/0001_initial_schema.py`](backend/alembic/versions/0001_initial_schema.py) 已提供初始数据库迁移
- [`backend/app/api/routes/projects.py`](backend/app/api/routes/projects.py) 已具备项目 CRUD 与项目详情聚合接口
- [`backend/app/api/routes/chapters.py`](backend/app/api/routes/chapters.py) 已具备章节 CRUD、排序调整、删除后重排、版本留档、版本历史查询
- [`backend/app/schemas/project.py`](backend/app/schemas/project.py) 已补齐项目/章节/版本历史请求响应模型与基础字段校验
- [`backend/app/api/routes/ai.py`](backend/app/api/routes/ai.py) 与 [`backend/app/services/ai_service.py`](backend/app/services/ai_service.py) 已支持 OpenAI / Anthropic 基础流式生成

#### 前端
- [`frontend/src/App.tsx`](frontend/src/App.tsx) 已完成 React Router 应用入口配置
- [`frontend/src/lib/api-client.ts`](frontend/src/lib/api-client.ts)、[`frontend/src/lib/query-client.ts`](frontend/src/lib/query-client.ts) 已建立 API 与查询基础设施
- [`frontend/src/pages/dashboard-page.tsx`](frontend/src/pages/dashboard-page.tsx) 已实现项目列表、统计卡片、创建/编辑/删除项目
- [`frontend/src/pages/project-workspace-page.tsx`](frontend/src/pages/project-workspace-page.tsx) 已实现项目概览、章节创建、章节切换、删除、上下移动排序
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已实现章节标题/状态/正文/备注编辑、自动保存、手动保存、字数统计
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已接入 AI 续写面板，支持模型提供商与模型选择、流式结果展示、停止生成、丢弃结果、接受结果回填
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已支持章节版本历史弹窗查看与“恢复到正文”
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已支持离开页面未保存提醒，覆盖刷新/关闭标签页与站内链接离开场景
- [`frontend/src/services/ai.ts`](frontend/src/services/ai.ts) 已实现 AI 流式读取与事件解析
- [`frontend/src/components/`](frontend/src/components/) 已形成 MVP 界面骨架与基础 UI 组件层

#### 基础设施与验证
- [`docker-compose.yml`](docker-compose.yml) 已完成 PostgreSQL、backend、frontend 三服务编排
- [`backend/Dockerfile`](backend/Dockerfile) 与 [`frontend/Dockerfile`](frontend/Dockerfile) 已具备容器构建能力
- 已验证 [`docker compose config`](docker-compose.yml)、[`docker compose build`](docker-compose.yml)、[`docker compose up`](docker-compose.yml) 主链路可执行
- 已验证 [`npm run build`](frontend/package.json) 可通过
- 已验证 [`python -m compileall`](backend/app) 可通过
- 已验证项目与章节主流程：创建项目、创建章节、更新章节、获取项目详情、章节重排、删除章节、删除项目

## 当前主要缺口
当前缺口已经不再是基础骨架，而集中在 MVP 收口质量：

1. **手工验收记录仍不完整**
   - 目前已有接口与构建验证，但缺少一份可重复执行的 UI 手工验收清单
   - 需要沉淀成文档，作为 Phase 1 收口依据

2. **编辑器仍为过渡方案**
   - [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 当前仍使用基础文本编辑
   - [`PLAN.md`](PLAN.md) 中 Phase 1 提到的 Wangeditor 集成尚未落地

3. **AI 交互仍偏 MVP 初版**
   - 当前“停止生成”仅为前端停止接收结果
   - 后端 [`backend/app/api/routes/ai.py`](backend/app/api/routes/ai.py) 尚无服务端取消能力
   - 缺少更精细的失败重试、超时提示与生成日志能力

4. **版本历史仍是最小能力**
   - 目前已支持查看与恢复
   - 但尚未支持版本对比、恢复确认、恢复后备注与更明确的版本来源说明

5. **前端包体仍需后续优化**
   - [`npm run build`](frontend/package.json) 仍提示 chunk 体积偏大
   - 需要后续通过拆包与懒加载优化

## Phase 1 当前判断
当前项目已进入：**Phase 1 主链路可用，正在做验收与体验收口**。

对照[`PLAN.md`](PLAN.md)的原始设想，当前实际状态可以概括为：
- 项目/章节基础数据链路已完成
- AI 续写 MVP 已完成
- 版本历史 UI 已提前完成最小闭环
- 编辑器防误操作能力已补齐
- 尚未完成的主要是富文本替换、AI 深化体验、正式验收文档

## 下一阶段实施顺序

### 体验与产品布局补充原则
结合[`plans/storyweave-product-layout-upgrade.md`](plans/storyweave-product-layout-upgrade.md) 的分析，MVP 收口阶段不应只关注接口可用，还应同步优化用户对产品结构的理解成本。下一阶段前端体验优化应优先遵循：

- 优先展示 创作场景入口，而不是直接暴露底层功能术语
- 优先展示 最近作品、最近章节、继续写作入口，提升回流效率
- 在编辑器与项目页明确区分 默认配置、当前任务配置、AI 工具能力 三种信息
- 为后续角色库、世界观、AI 工具箱预留统一导航入口，避免后续页面扩展时结构失衡


### 1. 补齐手工验收清单与验收记录
- 增加一份可执行的 Phase 1 手工验收清单
- 覆盖项目、章节、编辑器、AI、版本恢复、离开提醒
- 为最终 Phase 1 收口提供依据

### 2. 评估是否在 Phase 1 内接入富文本编辑器
- 结合 [`PLAN.md`](PLAN.md) 中 Wangeditor 的原始要求重新评估
- 判断是继续保持纯文本 MVP 收口，还是补做最小富文本替换

### 3. 继续补强 AI 与版本能力
- 评估是否需要服务端取消生成
- 评估是否需要生成失败重试
- 评估是否需要版本恢复确认与恢复来源标记

### 4. 为 Phase 2 做准备
- 在 Phase 1 收口后，再进入角色库、世界观系统与 Prompt 模板的设计与落地
- 先完成首页、项目工作台、编辑器 AI 面板 的信息架构收敛，再扩展更多功能页，确保产品主路径稳定
- 将 AI 工具箱 作为独立入口纳入中短期规划，用于承接续写、润色、改写、拆解等复用型能力

## 本轮交付边界
当前仍只聚焦 MVP 第一阶段，不进入以下内容：
- 角色库
- 世界观系统
- Prompt 模板中心
- 长上下文管理器
- 导出 DOCX
- 权限与多用户协作
- Phase 2 及之后的数据扩展开发

## 建议拆分为[`code`](code)模式任务清单
- 更新 Phase 1 计划文档，校准真实进度
- 补充一份 Phase 1 手工验收清单
- 按清单执行并记录 MVP 验收结果
- 评估是否继续推进 Wangeditor 接入
- 完成 Phase 1 收口结论并准备 Phase 2 入口
