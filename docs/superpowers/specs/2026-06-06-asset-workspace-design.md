# Asset Workspace: 角色库与世界观设定重构设计

日期: 2026-06-06
状态: 待审批

## 背景

当前角色库 (`characters-page.tsx`) 和世界观设定 (`project-world-page.tsx`) 页面使用卡片堆叠布局，存在以下问题：
- 信息密度低，需要大量滚动
- 卡片之间层级关系不清
- 编辑操作路径长（展开/收起/跳转）
- 大量相同样式的卡片堆叠导致视觉疲劳

## 目标

将角色库和世界观设定页面重构为「树形导航 + 多标签页」的 IDE 风格交互模式，提升信息密度、编辑效率和视觉层次感。

## 设计方案

### 整体布局

```
┌─────────────────────────────────────────────────────┐
│  App Shell 顶栏（保留现有全局导航）                    │
├──────────┬──────────────────────────────────────────┤
│  树面板    │  标签页栏 [+角色A] [+世界观B] [+]        │
│          ├──────────────────────────────────────────┤
│  🔍 搜索  │  子标签页: [基础] [性格] [背景] [关系]     │
│  ▼ 筛选   │                                          │
│          │                                          │
│  ▼ 分组A  │  编辑内容区                               │
│    角色1  │  (表单/富文本，根据子标签切换)              │
│    角色2  │                                          │
│  ▼ 分组B  │                                          │
│    角色3  │                                          │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│  状态栏（保存状态、字数统计）                           │
└─────────────────────────────────────────────────────┘
```

### 路由

- 角色库: `/projects/:projectId/characters` (保持不变)
- 世界观: `/projects/:projectId/world` (保持不变)
- 两个页面共用 `AssetWorkspace` 布局组件

### App-shell 侧边栏处理

在角色库和世界观页面下，隐藏 app-shell 现有的 280px 导航侧边栏，由树面板取代其位置。通过路由判断实现。

### 树面板

**尺寸**: 默认 260px 宽度，可通过拖拽调整（范围 200px-400px）。

**节点层级（角色库）**:

```
树根
├── 📁 分组维度切换器
├── 📂 分组A
│   ├── 🧑 节点1
│   └── 🧑 节点2
├── 📂 分组B
│   └── 🧑 节点3
└── 📂 未分组
    └── 🧑 节点4
```

**节点层级（世界观）**:

```
树根
├── 📄 总览
├── 📄 世界规则
├── 📄 势力分布
├── 📄 重要地点
├── 📄 时间线
└── 📄 备注
```

**功能**:

1. **搜索框**: 顶部，实时模糊匹配节点名称/别名
2. **维度切换器**: Segmented Control 或下拉（仅角色库显示）
   - 角色维度: 按标签 / 按势力 / 按关系类型 / 不分组
   - 世界观页面不显示维度切换器，直接按字段类别展示节点（总览/规则/势力/地点/时间线/备注）
3. **分组折叠**: 点击分组名展开/收起
4. **节点右键菜单**: 重命名、删除、移动分组、在新标签页打开
5. **类型筛选**: 角色 + 世界观混合树时，顶部增加类型筛选（全部/仅角色/仅世界观）
7. **新建按钮**: 树底部「+ 新建」按钮

### 标签页系统

**标签页栏**:
- 每个打开的节点对应一个标签
- 标签显示节点名称（超长截断 + tooltip）
- 标签可关闭（×），关闭最后一个显示空白引导页
- `+` 按钮打开节点选择器
- 标签支持拖拽排序
- 当前激活标签高亮
- 未保存指示器（标题前圆点）

### 编辑面板

**角色子标签页**:

| 子标签 | 字段 | 编辑方式 |
|--------|------|----------|
| 基础信息 | name, alias, description, tags, portrait_url | 内联表单 |
| 性格特征 | personality | Tiptap 富文本 |
| 人物背景 | background | Tiptap 富文本 |
| 人际关系 | relationship_notes + 关联角色 | 富文本 + 关联列表 |
| AI 对话 | character_chat | 复用现有对话组件 |

**世界观子标签页**:

| 子标签 | 字段 | 编辑方式 |
|--------|------|----------|
| 总览 | title, overview | 内联表单 + 富文本 |
| 世界规则 | rules | Tiptap 富文本 |
| 势力分布 | factions | Tiptap 富文本 |
| 重要地点 | locations | Tiptap 富文本 |
| 时间线 | timeline | Tiptap 富文本 |
| 备注 | extra_notes | Tiptap 富文本 |

**自动保存**: 所有字段使用 debounce (300ms) 自动保存，无需手动保存按钮。

### 空状态

- 树为空: 「还没有角色，点击 + 创建第一个」引导
- 无标签打开: 空白引导页（新建、从树中选择的快捷入口）
- 搜索无结果: 「没有匹配的角色」

### 错误处理

- 加载失败: 树面板显示重试按钮
- 保存失败: 标签标题显示错误指示器，hover 显示详情
- 网络断开: 状态栏显示离线提示

## 组件架构

```
frontend/src/
├── components/
│   └── asset-workspace/
│       ├── AssetWorkspace.tsx          # 主布局容器
│       ├── TreePanel.tsx               # 左侧树面板
│       ├── TreeSearchBar.tsx           # 搜索框
│       ├── DimensionSwitcher.tsx       # 分组维度切换
│       ├── TreeNode.tsx               # 递归树节点
│       ├── TabBar.tsx                  # 标签页栏
│       ├── TabContent.tsx             # 标签页内容路由
│       └── EmptyState.tsx             # 空白引导页
├── pages/
│   ├── characters-page.tsx            # 角色库入口 → AssetWorkspace
│   └── project-world-page.tsx         # 世界观入口 → AssetWorkspace
```

## 数据流

```
CharactersPage
  └─ AssetWorkspace
       ├─ TreePanel
       │    ├─ useCharacters(projectId)  → 角色列表
       │    ├─ useGroups(维度)           → 分组数据
       │    └─ onNodeSelect(nodeId)      → 打开标签页
       │
       └─ TabBar + TabContent
            ├─ openTabs: Tab[]           → 本地 useState
            ├─ activeTab: string         → 本地 useState
            └─ CharacterEditor
                 ├─ useCharacter(id)     → TanStack Query
                 └─ useUpdateCharacter() → useMutation + debounce
```

**状态管理**:
- 树展开/收起: 组件本地 `useState`
- 打开的标签页: 组件本地 `useState`
- 角色/世界观数据: TanStack Query (已有)
- 自动保存: `useMutation` + debounce (已有模式)

## 技术依赖

- React 19 + TypeScript (已有)
- shadcn/ui (已有) - 需新增 Tabs, Resizable 组件
- Tiptap 富文本编辑器 (已有)
- TanStack Query (已有)
- Framer Motion (已有)
- Phosphor Icons (已有)

## 迁移策略

1. 搭建 `AssetWorkspace` 布局骨架
2. 迁移角色库页面（树 + 标签页 + 编辑面板）
3. 迁移世界观页面（复用组件）
4. 处理 app-shell 侧边栏隐藏逻辑
5. 迁移期间路由不变，用户无感知

## 不在范围内

- 全局角色库 (`/assets/characters`) — 独立设计
- 角色形象生成 (portrait) — 保持现有功能
- 树节点拖拽排序 — 可作为后续增强
