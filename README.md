
# StoryWeave

AI 辅助长篇小说写作平台 — 沉浸式创作工作台

## 项目简介

StoryWeave 是一个面向个人创作者的 AI 写作平台，支持同人文、原创小说等长篇创作场景。平台将 AI 能力深度整合到写作工作流中，提供从角色设定、世界观管理，到 AI 续写、连续性校验的完整创作闭环。

## 核心特性

### 工作台架构
- Dashboard：最近进展看板、项目列表、快速创建入口
- 项目工作台：章节管理、角色绑定、世界观设定
- 角色库：结构化角色卡片，可跨项目复用
- AI 工具箱：独立于项目的 AI 辅助功能集合

### 智能编辑器
- Tiptap 富文本编辑器 + 自动保存
- Bubble Menu 快速操作、Slash Command 命令面板
- 版本历史查看与恢复

### AI 续写流水线
- **多阶段 Pipeline 链路**：Planner（规划）→ Retriever（上下文装配）→ Writer（生成）→ Checker（连续性校验）
- **旧链路（直写）**：SSE 流式续写，速度更快
- 连续性风险报告：时间线冲突、人设冲突、世界观冲突、伏笔推进错位
- 调试接口：可查看规划计划、上下文包、token budget 报告

### ACG/同人项目支持
- 多项目类型：原创、同人、ACG 二创、影视衍生
- AI 外貌增强：为同人角色自动补充原作形象描述，用户确认后生成肖像
- 角色肖像生成：基于外貌描述 AI 生成角色立绘

### 长期记忆系统
- 章节级结构化记忆（ChapterMemory）：关键事件、角色状态变化、伏笔、时间线标记
- 项目级长期记忆（ProjectStoryMemory）：全局主线摘要、活跃冲突、世界规则约束
- 正文 chunk 切分与向量检索，支持相关历史片段召回

## 技术栈

### 前端
- React 19 + TypeScript + Vite
- shadcn/ui 组件库 + Tailwind CSS v4
- Tiptap 编辑器
- React Router v7 + TanStack Query

### 后端
- Python 3.12 + FastAPI
- SQLAlchemy 2.0 + Alembic + PostgreSQL 16
- OpenAI / Anthropic SDK 集成
- JWT 认证 + 多用户数据隔离

### 基础设施
- Docker + Docker Compose
- Nginx（生产反向代理）

## 快速开始

### 前置要求
- Node.js 18+
- Python 3.12+
- Docker（可选）

### 方式一：Docker 一键启动

```bash
cp .env.docker.example .env.docker
docker-compose up -d
```

### 方式二：手动启动

**后端**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**前端**
```bash
cd frontend
npm install
npm run dev
```

### 环境变量

后端 `.env`：
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/storyweave
AI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
SECRET_KEY=your-jwt-secret
```

前端 `.env`：
```env
VITE_API_BASE_URL=http://localhost:8000
```

## 项目结构

```
story-weave/
├── backend/
│   ├── app/
│   │   ├── api/routes/        # API 路由（ai, chapters, projects, characters...）
│   │   ├── models/            # 数据模型（Project, Chapter, ChapterMemory...）
│   │   ├── schemas/           # Pydantic schemas
│   │   └── services/          # 业务服务
│   │       ├── continuation_pipeline_service.py   # Pipeline 编排器
│   │       ├── continuation_planner_service.py    # Planner
│   │       ├── continuity_checker_service.py      # Checker
│   │       ├── context_retrieval_service.py       # 检索与上下文装配
│   │       ├── chapter_memory_service.py          # 章节记忆抽取
│   │       └── story_memory_service.py            # 项目长期记忆聚合
│   ├── alembic/               # 数据库迁移
│   ├── scripts/               # 工具脚本（种子数据等）
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/        # 组件
│       ├── pages/             # 页面
│       ├── services/          # API 服务层
│       └── types/             # TypeScript 类型
├── docs/
│   └── superpowers/           # 功能设计文档与实现计划
├── scripts/                   # 项目级工具脚本（截图、测试等）
├── plans/                     # 设计文档与规划
├── docker-compose.yml
└── PLAN.md                    # 项目规划总览
```

## AI 续写 API 端点

| 端点 | 说明 |
|---|---|
| `POST /api/ai/generate` | 旧链路 SSE 流式续写 |
| `POST /api/ai/generate-once` | 旧链路一次性生成 |
| `POST /api/ai/continuation/generate` | Pipeline 链路（生产） |
| `POST /api/ai/continuation/debug` | Pipeline 链路（含中间产物） |
| `POST /api/ai/context-preview` | 查看上下文装配结果 |
| `POST /api/ai/retrieval-preview` | 查看检索结果 |

## 开发规范

### Git 提交规范
格式：`type：描述`，允许的 type：`feat` / `fix` / `refactor` / `docs` / `style` / `test` / `chore`

### 代码规范
- 前端：ESLint + TypeScript strict mode
- 后端：Python type hints + Pydantic validation

## 当前进度

**已完成：**
- Phase 1：MVP 基础链路
- Phase 1.5：信息架构升级（Dashboard、工作台、AI 工具箱）
- Phase 2：角色库、世界观、AI 上下文注入
- Phase 3（部分）：多阶段续写流水线、长期记忆系统、多用户认证
- ACG/同人项目支持：角色肖像生成、AI 外貌增强流程

**进行中（Phase 3 待完成）：**
- 剧情图谱系统（`graph_evidence` 预留，尚未实装）
- Benchmark 体系落地
- 生成后记忆回写钩子
- Checker 自动重写闭环

详见 [`PLAN.md`](./PLAN.md) 和 [`plans/phase3-progress.md`](./plans/phase3-progress.md)

## 许可证

MIT License
