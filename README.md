

# StoryWeave

AI 同人文写作平台 — 沉浸式创作工作台

## 📖 项目简介

StoryWeave 是一个专为同人创作者设计的 AI 辅助写作平台，致力于提供沉浸、流畅的创作体验。平台将 AI 能力深度整合到写作工作流中，让创作者能够专注于故事创作，同时利用 AI 进行续写、改写和灵感激发。

## ✨ 核心特性

### 🖥️ 工作台架构
- **全局工作台**：一级全局导航 + 二级项目大纲 + 右侧辅助抽屉
- **Dashboard**：最近进展看板 + 高密度项目列表 + 快速创建入口
- **项目工作台**：章节管理器 + 角色绑定 + 创作动态图谱

### ✍️ 智能编辑器
- **Tiptap 编辑器底座**：现代化的富文本编辑体验
- **编辑器内智能交互**：
  - Bubble Menu 快速操作
  - Slash Command 命令面板
  - Mention 提及角色
  - 角色悬停卡片
- **沉浸式正文容器**：专注心流的写作区域

### 🤖 AI 能力
- **AI 改写与 Diff 闭环**：选区改写 → Diff 对比 → 接受/放弃
- **AI 工具箱**：输入与结果对照布局 + 任务类型分层 + 生成历史
- **上下文注入**：项目设定、角色信息、世界观联动

### 📚 资产管理
- **角色库**：结构化角色卡片 + 主从视图
- **世界观**：项目级设定管理
- **章节管理**：版本历史 + 排序 + 状态管理

## 🛠️ 技术栈

### 前端
- React 19 + TypeScript
- Vite (构建工具)
- shadcn/ui 组件库
- Tiptap 编辑器
- React Router (路由)

### 后端
- Python 3.12 + FastAPI
- SQLAlchemy (ORM)
- Alembic (数据库迁移)
- OpenAI/Anthropic API 集成

### 基础设施
- Docker + Docker Compose
- PostgreSQL 数据库
- Nginx (生产反向代理)

## 🚀 快速开始

### 前置要求
- Node.js 18+
- Python 3.12+
- Docker (可选)

### 本地开发

#### 方式一：Docker 一键启动

```bash
# 复制环境变量配置
cp .env.docker.example .env.docker

# 启动所有服务
docker-compose up -d
```

#### 方式二：手动启动

**后端启动**
```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\Activate.ps1  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn app.main:app --reload
```

**前端启动**
```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 环境变量配置

后端 `.env` 配置：
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/storyweave
AI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
```

前端使用 Vite 环境变量：
```env
VITE_API_BASE_URL=http://localhost:8000
```

## 📁 项目结构

```
story-weave/
├── backend/                 # Python FastAPI 后端
│   ├── app/
│   │   ├── api/           # API 路由
│   │   ├── core/          # 核心配置
│   │   ├── models/        # 数据模型
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/     # 业务服务
│   ├── alembic/           # 数据库迁移
│   └── requirements.txt
│
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/   # 组件
│   │   ├── pages/      # 页面
│   │   ├── services/   # API 服务
│   │   ├── lib/        # 工具库
│   │   └── types/      # TypeScript 类型
│   ├── public/          # 静态资源
│   └── package.json
│
├── docker-compose.yml    # Docker 编排
├── DOCKER.md             # Docker 说明
└── PLAN.md               # 项目规划
```

## 🔄 开发规范

### Git 提交规范
使用中文提交信息，格式：`type：描述`

允许的 type：
- `feat`：新功能
- `fix`：问题修复
- `refactor`：代码重构
- `docs`：文档更新
- `style`：格式调整
- `test`：测试相关
- `chore`：构建/工具

### 代码规范
- 前端：ESLint + TypeScript strict mode
- 后端：Python type hints + Pydantic validation

## 📋 当前进度

根据 req-022 实施计划，当前已完成：

- ✅ 工作台壳层成形
- ✅ 编辑器底座迁移到 Tiptap
- ✅ 编辑器内 AI 闭环可用
- ✅ AI 工具箱工作台化

待收口：
- 响应式与主链路实机验收
- 运行时阻塞问题
- 文档最终收口

详见 [](./.agent/requirements/req-022/implementation_plan.md)

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'feat：xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 创建 Pull Request

## 📄 许可证

MIT License

---

*让创作更自由，让故事更精彩*