# MVP 第一阶段执行计划

## 目标
围绕[`PLAN.md`](PLAN.md)的 Phase 1，优先完成“项目管理 → 章节管理 → 编辑器工作流 → AI 续写接入”的 MVP 闭环，并将当前工作重点从“搭建骨架”切换为“联调验收、体验收口、质量加固”。

## 当前现状

### 已完成能力

#### 后端
- [`backend/app/main.py`](backend/app/main.py) 已完成应用启动、生命周期初始化、CORS、中间件注册与健康检查接口
- [`backend/app/main.py`](backend/app/main.py) 已注册项目、章节、AI 三类核心路由
- [`backend/app/models/project.py`](backend/app/models/project.py) 已包含 `Project`、`Chapter`、`ChapterVersion` 三个核心实体
- [`backend/alembic/versions/0001_initial_schema.py`](backend/alembic/versions/0001_initial_schema.py) 已提供初始数据库迁移
- [`backend/app/api/routes/projects.py`](backend/app/api/routes/projects.py) 已具备项目 CRUD 与项目详情聚合接口
- [`backend/app/api/routes/chapters.py`](backend/app/api/routes/chapters.py) 已具备章节 CRUD、排序调整、删除后重排、版本留档
- [`backend/app/schemas/project.py`](backend/app/schemas/project.py) 已补齐项目/章节请求响应模型与基础字段校验
- [`backend/app/api/routes/ai.py`](backend/app/api/routes/ai.py) 与 [`backend/app/services/ai_service.py`](backend/app/services/ai_service.py) 已支持 OpenAI / Anthropic 基础流式生成

#### 前端
- [`frontend/src/App.tsx`](frontend/src/App.tsx) 已完成 React Router 应用入口配置
- [`frontend/src/lib/api-client.ts`](frontend/src/lib/api-client.ts)、[`frontend/src/lib/query-client.ts`](frontend/src/lib/query-client.ts) 已建立 API 与查询基础设施
- [`frontend/src/pages/dashboard-page.tsx`](frontend/src/pages/dashboard-page.tsx) 已实现项目列表、统计卡片、创建/编辑/删除项目
- [`frontend/src/pages/project-workspace-page.tsx`](frontend/src/pages/project-workspace-page.tsx) 已实现项目概览、章节创建、章节切换、删除、上下移动排序
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已实现章节标题/状态/正文/备注编辑、自动保存、手动保存、字数统计
- [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 已接入 AI 续写面板，支持模型提供商与模型选择、增量结果展示、接受结果回填
- [`frontend/src/services/ai.ts`](frontend/src/services/ai.ts) 已实现 AI 流式读取与事件解析
- [`frontend/src/components/`](frontend/src/components/) 已形成 MVP 界面骨架与基础 UI 组件层

#### 基础设施
- [`docker-compose.yml`](docker-compose.yml) 已完成 PostgreSQL、backend、frontend 三服务编排
- [`backend/Dockerfile`](backend/Dockerfile) 与 [`frontend/Dockerfile`](frontend/Dockerfile) 已具备容器构建能力

## 当前主要缺口
当前缺口已经不再是“前端默认页”“后端无迁移”这类基础问题，而是集中在 MVP 收口阶段：

1. **联调与验收证据不足**
   - 需要按[`PLAN.md`](PLAN.md)的 Phase 1 验收路径实际跑通完整流程
   - 需要确认本地环境与 Docker 环境下均可完成主链路

2. **编辑器仍为过渡方案**
   - [`frontend/src/pages/project-editor-page.tsx`](frontend/src/pages/project-editor-page.tsx) 当前仍使用基础文本编辑
   - [`PLAN.md`](PLAN.md) 目标中的富文本编辑器（Wangeditor）尚未接入

3. **AI 交互仍偏 MVP 初版**
   - 缺少停止生成、生成中更细粒度状态控制、失败恢复等体验增强
   - 缺少更清晰的“接受 / 丢弃”结果处理策略

4. **版本历史仅后端落地，前端尚未可见**
   - [`backend/app/models/project.py`](backend/app/models/project.py) 中已有 `ChapterVersion`
   - 前端尚无最小可用的版本历史查看入口

5. **文档与代码存在阶段性偏差**
   - 原先执行计划中的部分“待做项”已经完成
   - 后续任务拆分需要基于真实代码现状重新校准

## 下一阶段实施顺序

### 1. 更新现状基线与任务拆分
- 以当前代码为准更新 Phase 1 文档与任务边界
- 明确“已完成项 / 待验证项 / 待增强项”
- 避免重复执行已经完成的基础搭建任务

### 2. 执行 MVP 主链路联调验收
按[`PLAN.md`](PLAN.md)中 Phase 1 的目标，验证以下闭环：
- 创建项目
- 编辑项目
- 新建章节
- 调整章节顺序
- 进入编辑器修改标题、正文、状态、备注
- 自动保存与手动保存
- 切换模型提供商与模型
- 发起 AI 续写
- 接受生成结果并再次保存
- 删除章节 / 删除项目

### 3. 修正联调问题与契约细节
- 核查项目与章节接口响应结构是否稳定
- 核查错误提示、空态、加载态是否一致
- 核查自动保存与手动保存是否存在竞态问题
- 核查 AI 生成中页面状态变化是否安全

### 4. 完善编辑器页 MVP 体验
- 补充生成中禁用策略与更明确的状态提示
- 补充停止生成或最小取消方案
- 补充接受 / 丢弃 AI 结果操作
- 评估离开页面未保存提醒是否需要纳入 MVP 收口

### 5. 增补最小版本历史能力
- 复用[`backend/app/models/project.py`](backend/app/models/project.py)中的 `ChapterVersion`
- 优先补一个最近若干版本的只读查看入口
- 暂不扩展为完整版本对比系统

## 交付边界
本轮仍只聚焦 MVP 第一阶段，不进入以下内容：
- 角色库
- 世界观系统
- Prompt 模板中心
- 长上下文管理器
- 导出 DOCX
- 权限与多用户协作
- Phase 2 及之后的数据扩表开发

## 建议拆分为[`code`](code)模式任务清单
- 更新 Phase 1 计划文档，校准真实进度
- 验证本地 / Docker MVP 主链路
- 修正前后端联调问题与接口细节
- 完善编辑器页与 AI 面板交互体验
- 增加最小版本历史查看能力
- 补充 Phase 1 验收记录与后续 Phase 2 准备项
