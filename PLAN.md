# AI 同人文写作平台 — 实现规划

## Context

用户想构建一个**个人使用**的 AI 同人文/小说创作 Web 应用，支持 ACG 二创、影视同人、原创小说等多种类型。核心需求：角色设定+剧情生成、章节续写+风格模仿、完整写作工作流（大纲→分章→正文→润色）、一键生成和人机协作两种模式，AI 底层同时支持 Claude 和 OpenAI 且可组合使用。

---

## 技术栈

### 前端

| 层 | 选型 | 理由 |
|---|---|---|
| **框架** | React 19 + Vite | 主流成熟，生态丰富，构建快，教程和社区资源极多 |
| **语言** | TypeScript | 类型安全，复杂数据结构（角色/世界观/模板）受益大 |
| **路由** | React Router v7 | React 生态最主流的路由方案 |
| **富文本编辑器** | Wangeditor v5 | 国产主流富文本编辑器，中文支持极好，文档全中文，开箱即用 |
| **UI 组件库** | Ant Design 5 | 国际主流 React 组件库，企业级品质，中文文档完善 |
| **状态管理** | Redux Toolkit (RTK Query) | 最主流的 React 状态管理，RTK Query 内置数据请求缓存 |
| **HTTP 请求** | Axios | 最主流的 HTTP 客户端 |
| **样式** | Ant Design 内置 + CSS Modules | 无需额外配置样式框架 |

### 后端

| 层 | 选型 | 理由 |
|---|---|---|
| **框架** | Python FastAPI | 高性能异步框架，自带 Swagger 文档，Python AI 生态丰富 |
| **ORM** | SQLAlchemy 2.0 + Alembic | Python 最主流 ORM，Alembic 管理数据库迁移 |
| **数据库** | PostgreSQL 16 | 功能强大，JSON 支持好（存储大纲/角色等结构化数据），国际主流 |
| **AI 集成** | openai SDK + anthropic SDK | 官方 Python SDK，直接调用，无需第三方封装 |
| **流式输出** | SSE (Server-Sent Events) | FastAPI 原生支持，前端用 EventSource 接收，简单可靠 |
| **导出** | python-docx + markdown | Python 生态成熟的文档生成库 |
| **验证** | Pydantic v2 | FastAPI 内置，请求/响应数据校验 |

---

## 系统架构

```
┌──────────────────┐          ┌──────────────────────────┐
│  前端 (React+Vite)│  HTTP/  │  后端 (Python FastAPI)    │
│                   │  SSE    │                           │
│  写作编辑器        │ ◄─────► │  API 路由层               │
│  (Wangeditor)     │         │    ├ /api/projects        │
│  项目仪表盘        │         │    ├ /api/chapters        │
│  角色构建器        │         │    ├ /api/characters      │
│  世界观编辑        │         │    ├ /api/ai/generate     │
│  模板管理器        │         │    └ /api/export          │
│                   │         │                           │
│  (Ant Design UI)  │         │  服务层                    │
│  (Redux Toolkit)  │         │    ├ AI Service (统一封装)  │
│                   │         │    ├ Prompt Engine         │
│                   │         │    ├ Context Manager       │
│                   │         │    └ Export Service        │
│                   │         │                           │
│                   │         │  数据层 (SQLAlchemy)       │
└──────────────────┘         └────────────┬──────────────┘
                                          │
                                  ┌───────▼──────┐
                                  │ PostgreSQL   │
                                  └──────────────┘
```

### AI 生成流水线

```
用户输入 → Prompt Engine (组装模板+角色+世界观+风格+已有文本)
        → Context Manager (处理上下文窗口：摘要化历史章节)
        → AI Provider Router (按任务类型路由到 Claude/OpenAI)
        → SSE Stream (流式输出到前端)
        → 前端编辑器 (用户审阅/编辑/接受/拒绝)
```

---

## 核心数据模型

| 实体 | 关键字段 | 说明 |
|------|---------|------|
| **Project** | title, type(original/fanfiction/acg/tv_movie), sourceWork, defaultModel | 作品项目 |
| **Character** | name, personality, backstory, appearance, speechPattern, sourceWork, tags | 全局角色库，可跨项目复用 |
| **CharacterRelationship** | characterA, characterB, type, description | 角色关系 |
| **WorldSetting** | name, timePeriod, location, rules, lore, atmosphere | 世界观设定 |
| **Outline** | content(树形 JSON), version | 大纲 |
| **Chapter** | title, orderIndex, content(HTML/JSON), plainText, summary, status | 章节 |
| **ChapterVersion** | content, changeNote | 版本历史 |
| **StyleProfile** | name, sampleText, analysisResult, instructions | 风格档案 |
| **PromptTemplate** | name, category, template, variables, modelProvider, temperature | 可复用 prompt 模板 |
| **GenerationLog** | prompt, response, modelProvider, tokensUsed, accepted | 生成记录 |

关键关系：Project 1-* Chapter, Character *-* Project, Project 1-1 WorldSetting

---

## AI 集成设计

### 多模型路由

通过 AI Service 层统一封装 openai 和 anthropic 两个 Python SDK，支持按任务类型自动路由：

| 任务 | 默认模型 | 理由 |
|------|---------|------|
| 大纲生成 | GPT-4o | 结构化输出好 |
| 章节续写 | Claude Sonnet | 创意写作能力强 |
| 风格分析 | Claude Sonnet | 细腻分析 |
| 摘要生成 | GPT-4o-mini | 快速便宜 |
| 润色修改 | Claude Sonnet | 文学性强 |

用户可在项目级或模板级覆盖默认路由。

### 长篇小说上下文管理（核心难点）

采用**分层摘要策略**控制上下文在 12K token 以内：

```
系统提示 (固定)                     ~500 tokens
角色卡片 (仅本章相关角色)            ~1000 tokens
世界观规则 (精简)                   ~500 tokens
风格指令                           ~300 tokens
全局故事摘要                       ~500 tokens
近期章节摘要 (前 2-3 章)            ~1500 tokens
当前章节全文                       ~3000 tokens
大纲上下文 (下一步走向)              ~500 tokens
用户指令                           ~200 tokens
═══ 留给生成 ═══                   ~4000 tokens
```

- 每章完成后自动生成摘要存入 DB
- Context Manager 根据目标模型窗口大小动态调整策略（Claude 200K 可放更多原文）

---

## 关键页面

1. **仪表盘** `/` — 项目卡片列表，快速新建，全局角色库/模板库入口
2. **项目视图** `/projects/[id]` — 左侧章节列表 + 中间编辑器/大纲 + 右侧角色/AI 控制面板
3. **写作编辑器** `/projects/[id]/editor/[chapterId]` — Wangeditor 编辑器 + 浮动 AI 工具栏(续写/改写/扩展/润色) + 模型选择器 + 流式生成区域
4. **角色构建器** `/characters` — 角色表单 + 关系图 + 标签搜索
5. **世界观编辑** `/projects/[id]/world` — 世界观表单
6. **模板管理** `/templates` — Prompt 模板 CRUD，变量系统

---

## 分阶段开发计划

### Phase 1: MVP 基础 (1-3 周)
- 项目脚手架：前端 React+Vite+AntDesign，后端 FastAPI+SQLAlchemy+PostgreSQL
- 数据库模型：projects, chapters, chapter_versions
- RESTful API：项目 CRUD + 章节管理
- 前端：项目列表页 + Wangeditor 编辑器集成
- AI 集成：单接口流式续写 (SSE)，接入 Claude + OpenAI
- 基础模型选择器（下拉切换 provider/model）

### Phase 2: 角色与世界观系统 (4-5 周)
- characters, characterRelationships, projectCharacters 表
- 角色创建表单 + 全局角色库
- worldSettings 表和编辑界面
- 将角色/世界观数据注入 AI prompt

### Phase 3: 写作流水线与大纲 (6-7 周)
- 大纲编辑器（树形结构）
- AI 大纲生成 + 章节拆分
- 章节状态工作流：大纲 → 草稿 → 修订 → 定稿
- 章节自动摘要 + Context Manager 分层管理

### Phase 4: 风格系统 (8-9 周)
- styleProfiles 表
- 风格分析：粘贴样本文本 → AI 提取风格特征
- 风格应用到生成 prompt
- 风格一致性检查

### Phase 5: Prompt 模板与高级 AI (10-11 周)
- promptTemplates 完整 CRUD
- 内置模板库（大纲/续写/角色/对话/场景/润色）
- 模板变量系统 `{{placeholder}}`
- 按模板配置模型路由
- 生成日志记录

### Phase 6: 协作模式与一键生成 (12-13 周)
- 一键生成流水线：设定 → 大纲 → 分章 → 正文 → 润色（带人工审核门）
- 协作写作模式：光标续写、行内 AI 建议
- 人机交替模式
- 选中文本改写 + 接受/拒绝机制

### Phase 7: 打磨与导出 (14-15 周)
- 导出 Markdown/TXT/DOCX（DOCX 中文排版）
- 版本历史 UI
- 全文搜索
- 快捷键系统
- 暗色模式
- 自动保存 + 数据库备份恢复

---

## 关键技术挑战与方案

| 挑战 | 方案 |
|------|------|
| **长篇上下文溢出** | 分层摘要策略，每章存摘要，Context Manager 按模型窗口动态分配 |
| **跨章节风格一致** | StyleProfile + 前一章尾段锚定 + 生成后风格一致性检查 |
| **中文处理** | CJK 字体(Noto/思源)、字符计数代替词计数、tiktoken 中文 token 估算 |
| **流式长文生成** | FastAPI SSE + 前端 EventSource 实时追加 + 生成区域视觉区分 + 停止按钮 |
| **同人角色准确性** | 显式角色卡片注入 prompt，指令 AI 以用户定义为准而非训练知识 |

---

## 关键文件清单

### 后端 (Python FastAPI)

| 文件 | 职责 |
|------|------|
| `backend/app/models/` | SQLAlchemy 模型定义 (projects, chapters, characters 等) |
| `backend/app/services/ai_service.py` | AI Provider 统一封装与任务路由 |
| `backend/app/services/context_manager.py` | 上下文窗口管理与分层摘要 |
| `backend/app/services/prompt_engine.py` | Prompt 模板引擎 |
| `backend/app/api/routes/` | FastAPI 路由 (RESTful API) |
| `backend/alembic/` | 数据库迁移 |

### 前端 (React + Vite)

| 文件 | 职责 |
|------|------|
| `frontend/src/pages/` | 页面组件 (仪表盘、项目、编辑器、角色库) |
| `frontend/src/components/Editor/` | Wangeditor 编辑器封装 + AI 工具栏 |
| `frontend/src/store/` | Redux Toolkit slices + RTK Query API |
| `frontend/src/services/` | API 调用封装 |

---

## 验证方案

1. **Phase 1 完成后**：能创建项目 → 新建章节 → 在编辑器写文字 → 选择 Claude/OpenAI → 点击续写 → 看到流式输出
2. **Phase 2 完成后**：创建角色(含性格/语气) → 关联到项目 → 续写时 AI 输出符合角色设定
3. **Phase 3 完成后**：从零生成大纲 → 拆分为章节计划 → 逐章生成 → 前后文连贯
4. **Phase 4 完成后**：粘贴金庸段落 → 分析出风格 → 用该风格续写 → 风格相似度可感知
5. **全流程测试**：一键模式生成 3 章短篇 → 协作模式写 1 章 → 导出 DOCX → 打开查看排版正确
