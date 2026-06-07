
# StoryWeave

AI 辅助长篇小说写作平台 — 从角色设定到章节续写的完整创作闭环

## 项目简介

StoryWeave 是一个面向个人创作者的 AI 写作平台，支持同人文、ACG 二创、影视衍生、原创小说等多种创作场景。平台将 AI 能力深度整合到写作工作流中，提供多阶段续写流水线、结构化记忆系统、剧情图谱、角色扮演对话等能力，帮助创作者在长篇创作中保持叙事一致性。

## 核心特性

### 创作工作台
- **Dashboard**：项目列表、快速创建（支持 AI 起草项目大纲）
- **项目工作台**：章节管理、角色绑定、世界观设定、AI 知识导入
- **资产中心**：全局角色库（跨项目复用）、剧情实体浏览、肖像画廊

### 富文本编辑器
- TipTap 编辑器 + 自动保存 + 版本历史
- `@角色` 提及标记、Bubble Menu、Slash Command
- 编辑器内直接触发 AI 续写

### AI 续写流水线
- **Pipeline 链路**：Planner（结构化规划）→ Writer（生成）→ Checker（连续性校验）
- **直写链路**：SSE 流式续写，适合快速出稿
- 连续性风险报告：时间线冲突、人设冲突、世界观冲突、伏笔错位
- 调试模式：查看规划方案、上下文包、检索结果

### 结构化记忆系统
- **章节记忆**：关键事件、角色状态变化、关系变化、伏笔开启/回收、时间线标记
- **项目记忆**：全局主线摘要、活跃冲突、角色弧线、未解伏笔
- **证据溯源**：每条记忆关联原文片段与置信度
- 正文 chunk 切分 + 向量检索，支持相关历史片段召回

### 剧情图谱
- 自动从章节内容抽取实体（人物/物品/地点/概念）、事件、关系、未解伏笔
- D3.js 力导向图可视化，支持实体类型筛选、章节范围滑块、节点详情面板
- 跨项目实体浏览

### 角色扮演对话
- 与角色进行 SSE 流式 AI 对话
- 系统提示词基于角色档案（性格、背景、关系）动态构建
- 自动加载关联项目的剧情上下文（角色弧线、关系变化、近期状态）

### AI 世界观构建
- LangGraph ReAct 对话式 Agent，支持文件上传导入素材
- 「AI 草拟 → 用户确认」工作流：AI 生成补丁，用户审核后应用
- 固定工具链（编排器）+ 对话式 Agent 双模式

### 角色肖像生成
- 基于角色外貌描述 AI 生成立绘（通义万象 2.7）
- ACG/同人项目支持：AI 自动补充原作形象描述，用户确认后生成

### AI 运行时配置
- 多配置管理：支持创建多组 AI 配置（不同提供商、模型、API Key）
- 支持 OpenAI、Anthropic 及 OpenAI 兼容端点
- 能力探测（文本生成、结构化输出、工具调用）+ 远程模型发现

## 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | React 19 + TypeScript + Vite |
| UI 组件 | shadcn/ui + Radix UI + Tailwind CSS v4 |
| 富文本 | TipTap |
| 路由/状态 | React Router v7 + TanStack Query |
| 后端框架 | Python 3.12 + FastAPI |
| ORM/数据库 | SQLAlchemy 2.0 + Alembic + PostgreSQL 16 |
| AI 集成 | OpenAI SDK / Anthropic SDK / LangGraph |
| 图像生成 | 通义万象 DashScope API |
| 部署 | Docker Compose + Caddy（生产）/ Nginx（开发） |

## 快速开始

### 前置要求
- Node.js 18+
- Python 3.12+
- Docker（可选）

### Docker 一键启动

```bash
cp .env.docker.example .env.docker
docker-compose up -d
```

访问 `http://localhost:3001`

### 手动启动

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
│   │   ├── api/routes/              # REST API 路由
│   │   │   ├── ai.py                # AI 续写、检索预览、故事问答
│   │   │   ├── chapters.py          # 章节 CRUD、版本历史、记忆管理
│   │   │   ├── characters.py        # 角色 CRUD、外貌增强、肖像生成
│   │   │   ├── character_chat.py    # 角色扮演对话
│   │   │   ├── projects.py          # 项目 CRUD、AI 起草
│   │   │   ├── project_settings.py  # 项目设置、角色关联、知识导入
│   │   │   ├── project_asset_ai.py  # 资产 AI Agent（LangGraph）
│   │   │   ├── story_graph.py       # 剧情图谱查询
│   │   │   └── runtime_settings.py  # AI 运行时配置
│   │   ├── models/                  # SQLAlchemy 数据模型
│   │   ├── schemas/                 # Pydantic 请求/响应模型
│   │   └── services/                # 业务逻辑层
│   │       ├── ai_service.py                    # AI 核心服务
│   │       ├── continuation_pipeline_service.py  # 续写流水线编排
│   │       ├── continuation_planner_service.py   # 规划器
│   │       ├── continuity_checker_service.py     # 连续性校验器
│   │       ├── context_retrieval_service.py      # 上下文检索
│   │       ├── chapter_memory_service.py         # 章节记忆抽取
│   │       ├── story_memory_service.py           # 项目记忆聚合
│   │       ├── story_graph_service.py            # 剧情图谱构建
│   │       ├── portrait_service.py               # 肖像生成
│   │       └── langchain_agent/                  # LangGraph Agent
│   ├── alembic/                     # 数据库迁移
│   ├── scripts/                     # 工具脚本（种子数据等）
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── app-shell.tsx         # 应用外壳 + 侧边栏 + AI 助手面板
│       │   ├── asset-workspace/      # 资产工作台（树面板 + 标签页编辑器）
│       │   ├── editor/               # TipTap 富文本编辑器
│       │   ├── ai/                   # AI 模型选择、运行时配置面板
│       │   └── ui/                   # shadcn/ui 组件
│       ├── pages/
│       │   ├── home-page.tsx         # 首页（带动画演示）
│       │   ├── dashboard-page.tsx    # 工作台
│       │   ├── assets/               # 资产中心（角色、实体、肖像）
│       │   ├── project-*.tsx         # 项目相关页面
│       │   ├── ai-toolbox-page.tsx   # AI 工具箱
│       │   └── settings-page.tsx     # 全局设置
│       ├── services/                 # API 调用层
│       └── types/                    # TypeScript 类型定义
├── docs/
│   └── superpowers/                  # 功能设计文档与实现计划
├── scripts/                          # 项目级工具脚本
├── deploy/production/                # 生产部署配置
├── docker-compose.yml
└── PLAN.md                           # 项目规划总览
```

## API 端点

| 端点 | 说明 |
|---|---|
| `POST /api/ai/continuation/generate` | Pipeline 续写（生产） |
| `POST /api/ai/continuation/stream` | Pipeline 续写（SSE 流式） |
| `POST /api/ai/continuation/debug` | Pipeline 续写（含中间产物） |
| `POST /api/ai/generate` | 直写续写（SSE 流式） |
| `POST /api/ai/context-preview` | 查看上下文装配结果 |
| `POST /api/ai/retrieval-preview` | 查看检索结果 |
| `POST /api/ai/story-qa` | 故事问答 |
| `POST /api/characters/{id}/portrait` | 角色肖像生成 |
| `POST /api/characters/{id}/enhance-description` | AI 外貌增强 |
| `POST /api/characters/{id}/chat-sessions/{sid}/messages` | 角色扮演对话 |
| `POST /api/projects/{id}/ai-assets/chat` | 资产 AI Agent 对话 |
| `POST /api/projects/{id}/import` | AI 知识导入 |
| `GET /api/projects/{id}/story-graph` | 剧情图谱数据 |

## 开发规范

### Git 提交规范
格式：`type(scope): 描述`

允许的 type：`feat` / `fix` / `refactor` / `docs` / `style` / `test` / `chore`

### 代码规范
- 前端：ESLint + TypeScript strict mode
- 后端：Python type hints + Pydantic validation

## 当前进度

**已完成：**
- Phase 1：MVP 基础链路（项目/章节/编辑器/AI 流式续写/版本历史）
- Phase 1.5：信息架构升级（Dashboard、工作台、AI 工具箱）
- Phase 2：角色库、世界观、AI 上下文注入
- Phase 3（部分）：多阶段续写流水线、长期记忆系统、多用户认证
- 剧情图谱系统（实体/事件/关系/伏笔抽取 + D3.js 可视化）
- 角色扮演对话
- LangGraph 资产 AI Agent
- 角色肖像生成 + ACG 外貌增强

**进行中：**
- Benchmark 体系落地
- 生成后记忆回写钩子
- Checker 自动重写闭环

详见 [`PLAN.md`](./PLAN.md) 和 [`plans/phase3-progress.md`](./plans/phase3-progress.md)

## 许可证

MIT License
