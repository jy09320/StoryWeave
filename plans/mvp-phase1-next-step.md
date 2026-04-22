# MVP 第一阶段执行计划

## 目标
围绕[`PLAN.md`](PLAN.md)的 Phase 1，优先打通 项目管理 → 章节管理 → 编辑器工作流 的可运行骨架，并为后续 AI 流式续写留出稳定接口。

## 当前现状

### 后端已具备
- [`backend/app/main.py`](backend/app/main.py) 已注册健康检查、项目、章节、AI 路由
- [`backend/app/models/project.py`](backend/app/models/project.py) 已包含 `Project`、`Chapter`、`ChapterVersion` 三个核心实体
- [`backend/app/api/routes/projects.py`](backend/app/api/routes/projects.py) 已具备项目 CRUD
- [`backend/app/api/routes/chapters.py`](backend/app/api/routes/chapters.py) 已具备章节 CRUD 与基础版本留档
- [`backend/app/api/routes/ai.py`](backend/app/api/routes/ai.py) 与 [`backend/app/services/ai_service.py`](backend/app/services/ai_service.py) 已具备基础流式生成能力

### 当前主要缺口
- 前端仍是 Vite 默认首页，[`frontend/src/App.tsx`](frontend/src/App.tsx) 尚未进入业务态
- [`frontend/package.json`](frontend/package.json) 尚未安装路由、UI 组件库、HTTP 层、状态管理、富文本编辑器
- 后端缺少数据库迁移、项目详情聚合返回、章节排序调整等 MVP 体验所需能力
- AI 仅有原始流接口，尚未接入到编辑器页的交互面板

## 下一阶段实施顺序

### 1. 前端基础骨架初始化
- 安装并配置 React Router、Ant Design、Axios
- 重构[`frontend/src/App.tsx`](frontend/src/App.tsx)为应用路由入口
- 建立页面目录、通用布局、API 基础封装

### 2. 后端补足 MVP 必需接口能力
- 保持现有项目/章节模型不扩表，先确保 CRUD 稳定
- 增加项目详情聚合接口，返回项目基础信息与章节列表
- 明确章节保存、更新、删除、排序的响应结构
- 为后续前端接入统一错误格式与基础校验

### 3. 项目列表页
- 构建首页仪表盘
- 支持项目列表展示、新建项目、编辑项目、删除项目
- 支持按状态与类型展示关键信息

### 4. 项目详情页与章节工作流
- 构建项目详情页
- 左侧章节列表，支持新建章节、切换章节、删除章节
- 中间区域展示项目信息摘要与章节入口

### 5. 编辑器页 MVP
- 先采用可快速落地的基础文本编辑方案作为过渡
- 支持章节标题、正文编辑、自动保存或手动保存
- 展示字数、状态、最近更新时间
- 为后续替换为正式富文本编辑器预留组件边界

### 6. AI 续写面板接线
- 在编辑器页加入模型提供商与模型选择
- 对接[`backend/app/api/routes/ai.py`](backend/app/api/routes/ai.py)流式接口
- 支持将当前正文与指令发送到后端并实时展示增量结果
- 支持接受生成结果并追加回编辑区

## 交付边界
本轮只聚焦 MVP 第一阶段，不进入以下内容：
- 角色库
- 世界观系统
- Prompt 模板中心
- 长上下文管理器
- 导出 DOCX
- 权限与多用户协作

## 建议拆分为[`code`](code)模式任务清单
- 初始化前端依赖与应用目录结构
- 实现前端路由、布局与 API 客户端
- 实现项目列表页与项目 CRUD 交互
- 实现项目详情页与章节列表管理
- 实现编辑器页与章节保存流程
- 对接 AI 流式续写面板
- 联调前后端并修正接口细节
