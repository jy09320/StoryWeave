# 偶记 (StoryWeave) 视觉设计系统

> 反模板化规范 — 打破千篇一律的卡片布局，建立有文学质感的多样化组件体系。

---

## 1. 设计哲学

偶记是一个为长篇创作者服务的记忆型 AI 写作工具。视觉语言应当传达：

- **纸张感**：不是数字化的冰冷界面，而是有温度的创作桌面
- **文学性**：衬线字体、墨绿色调、呼吸感排版
- **层次感**：不同页面/场景有不同的视觉密度，不是所有内容都用同一种卡片

### 禁止清单

| 禁止 | 替代方案 |
|------|---------|
| 所有内容都用 `rounded-xl border border-border bg-card shadow-...` | 根据场景选择不同的 Surface 变体 |
| 所有页面都是 `space-y-6 pb-10` | 根据页面类型选择不同布局节奏 |
| 所有标签都是 `text-[11px] uppercase tracking-[0.22em]` | 使用 SectionLabel 组件，有 3 种变体 |
| 所有描述都是 `text-sm leading-7 text-muted-foreground` | 使用 Prose 组件，支持不同密度 |
| 所有表单都是居中单列 | 根据表单复杂度选择布局 |
| Badge 被大量 override | 修改 Badge 默认样式 |

---

## 2. 色彩系统

现有基础色保持不变，扩展以下语义色：

```css
/* 在 :root 中添加 */
--surface-raised: oklch(0.997 0.003 80);      /* 卡片浮起 */
--surface-sunken: oklch(0.968 0.006 82);       /* 凹陷区域，如代码块 */
--surface-overlay: oklch(0.988 0.004 80 / 0.95); /* 浮层，毛玻璃 */
--surface-accent: oklch(0.965 0.012 168);       /* 带主色调的表面 */

--text-primary: oklch(0.20 0.025 240);          /* 正文 */
--text-secondary: oklch(0.42 0.018 230);        /* 次要说明 */
--text-tertiary: oklch(0.60 0.012 230);         /* 辅助信息 */
--text-accent: oklch(0.38 0.095 168);           /* 强调文字 */

--ink-wash: oklch(0.20 0.025 240 / 0.04);       /* 水墨晕染底纹 */
--ink-stroke: oklch(0.20 0.025 240 / 0.08);     /* 线条 */
--ink-heavy: oklch(0.20 0.025 240 / 0.15);      /* 重墨 */
```

### 色彩使用规则

- **正文区域**：`--background` 底色，内容用 `--text-primary`
- **卡片/Surface**：根据场景选择 `raised` / `sunken` / `overlay` / `accent`
- **强调**：主色 `--primary` 只用于关键交互和标签，不要大面积使用
- **状态色**：统一使用语义 token，不硬编码 `amber-200`、`emerald-500` 等

---

## 3. Surface 变体系统（替代单一卡片）

**核心理念**：不是所有内容都适合白色圆角卡片。根据内容类型选择不同 Surface。

### 3.1 Surface — Flat（平面型）

用于：密集信息列表、表格、数据面板

```tsx
<div className="bg-surface-sunken rounded-lg p-4">
  {/* 内容直接在凹陷背景上，无边框无阴影 */}
</div>
```

视觉效果：比背景深一档，形成"刻入纸面"的感觉。适合 dashboard 数据区。

### 3.2 Surface — Raised（浮起型）

用于：独立的可交互内容块、项目卡片

```tsx
<div className="bg-card rounded-xl border border-border shadow-subtle
                transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
                hover:-translate-y-px hover:shadow-[0_4px_16px_oklch(0.20_0.025_240/0.06)]">
  {/* 内容 */}
</div>
```

### 3.3 Surface — Inset（嵌入型）

用于：信息面板、设置组、详情展示

```tsx
<div className="bg-surface-sunken rounded-xl p-5 ring-1 ring-ink-wash">
  <div className="bg-card rounded-[calc(1.25rem-0.375rem)] p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]">
    {/* 双层嵌套，物理质感 */}
  </div>
</div>
```

这是"Double-Bezel"模式：外层凹陷 + 内层浮起，像玻璃板嵌在铝槽里。

### 3.4 Surface — Wash（水墨型）

用于：文学内容展示、引文、角色独白

```tsx
<div className="relative rounded-2xl bg-ink-wash p-6 overflow-hidden">
  <div className="absolute inset-0 opacity-[0.025]" style={{
    backgroundImage: `url("data:image/svg+xml,...")` /* 纸质纹理 */
  }} />
  <p className="font-serif text-lg leading-relaxed text-foreground/85 italic">
    "银月之下，真相从不沉睡。"
  </p>
</div>
```

无边框，靠背景色和纹理区分层次。适合叙事性内容。

### 3.5 Surface — Panel（面板型）

用于：工具面板、编辑器侧边栏、AI 对话区

```tsx
<div className="bg-card border-l border-ink-stroke pl-6 py-4">
  {/* 左侧细线分隔，无圆角，无阴影 */}
</div>
```

垂直分隔而非四面包围，适合工具型界面。

### 3.6 Surface — Floating（悬浮型）

用于：弹出提示、快捷操作、hover 详情

```tsx
<div className="bg-card/95 backdrop-blur-xl rounded-2xl
                shadow-[0_8px_40px_oklch(0.20_0.025_240/0.08),0_0_0_0.5px_oklch(0.9_0.005_85)]
                p-5">
  {/* 毛玻璃 + 极深阴影 + 发丝边框 */}
</div>
```

---

## 4. 布局系统

### 4.1 页面布局变体

不再所有页面都用 `space-y-6 pb-10`。

| 页面类型 | 布局 | 间距 |
|---------|------|------|
| **Dashboard** | 双栏不对称 `[1fr_420px]` | `gap-6`, `py-8` |
| **编辑器** | 三栏 `[工具_编辑器_侧边]` | `gap-0`, 全高 |
| **设置/表单** | 左标签右输入 `grid-cols-[200px_1fr]` | `gap-8`, `py-12` |
| **列表页** | 瀑布流或分组列表 | `gap-3`, `py-6` |
| **详情页** | 大标题 + 全宽内容区 | `gap-10`, `py-16` |
| **着陆页** | 全宽 section 呼吸感 | `gap-0`, `py-24~py-40` |

### 4.2 内容密度模式

```tsx
// 紧凑型 — Dashboard、列表
<PageLayout density="compact">

// 标准型 — 设置、详情
<PageLayout density="standard">

// 宽松型 — 着陆页、介绍
<PageLayout density="airy">
```

### 4.3 不对称网格

打破对称的双栏/三栏：

```tsx
{/* 故事记忆库 — 不对称 Bento */}
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-8 row-span-2"> {/* 大块 */} </div>
  <div className="col-span-4"> {/* 小块 */} </div>
  <div className="col-span-4"> {/* 小块 */} </div>
</div>

{/* 角色列表 — 瀑布流 */}
<div className="columns-2 lg:columns-3 gap-4 space-y-4">
  {characters.map(c => <CharacterCard key={c.id} className="break-inside-avoid" />)}
</div>
```

---

## 5. 组件变体系统

### 5.1 SectionLabel（章节标签）

替代到处重复的 `text-[11px] uppercase tracking-[0.22em]`。

```tsx
// 变体 A：标准 — 小号大写
<SectionLabel variant="default">核心能力</SectionLabel>

// 变体 B：墨印 — 带左侧竖线
<SectionLabel variant="inked">角色档案</SectionLabel>

// 变体 C：印章 — 带背景色块
<SectionLabel variant="stamp">进行中</SectionLabel>
```

### 5.2 InfoBlock（信息块）

替代所有信息都用圆角边框卡片。

```tsx
// 变体 A：线框型 — 仅左边线
<InfoBlock variant="lined">
  <InfoBlock.Label>世界观</InfoBlock.Label>
  <InfoBlock.Value>北境七城 · 银月教团</InfoBlock.Value>
</InfoBlock>

// 变体 B：墨底型 — 墨绿色背景
<InfoBlock variant="inked">
  <InfoBlock.Label>最近剧情</InfoBlock.Label>
  <InfoBlock.Value>主角发现王室血统的秘密</InfoBlock.Value>
</InfoBlock>

// 变体 C：纸条型 — 微微倾斜的纸片感
<InfoBlock variant="note">
  <InfoBlock.Label>待办</InfoBlock.Label>
  <InfoBlock.Value>完成第三章初稿</InfoBlock.Value>
</InfoBlock>
```

### 5.3 DataPanel（数据面板）

Dashboard 数据展示，不用卡片网格。

```tsx
{/* 时间线式 */}
<DataPanel layout="timeline">
  <DataPanel.Item time="3h ago" title="续写了第 12 章" meta="2,340 字" />
  <DataPanel.Item time="昨天" title="更新了角色档案" meta="莱纳 · 艾琳" />
</DataPanel>

{/* 摘要条式 — 横向信息密度 */}
<DataPanel layout="summary">
  <DataPanel.Stat label="总字数" value="128,450" />
  <DataPanel.Stat label="章节数" value="24" />
  <DataPanel.Stat label="角色数" value="8" />
</DataPanel>
```

### 5.4 ChatBubble（对话气泡）

统一 AI 对话样式，不再到处手写。

```tsx
// 用户消息
<ChatBubble role="user">主角什么时候得到戒指的？</ChatBubble>

// AI 回复
<ChatBubble role="assistant" source="第 17 章 · 雪夜">
  莱纳在父亲遗物中发现了一枚刻有银月纹章的戒指。
</ChatBubble>

// AI 回复 — 流式打字中
<ChatBubble role="assistant" streaming />
```

### 5.5 Timeline（时间线）

替代列表展示有时间维度的数据。

```tsx
<Timeline>
  <Timeline.Item marker="chapter" title="第 17 章 · 雪夜" time="3 天前">
    莱纳发现父亲遗物中的银月戒指
  </Timeline.Item>
  <Timeline.Item marker="character" title="角色更新" time="5 天前">
    艾琳的背景故事补充完成
  </Timeline.Item>
</Timeline>
```

### 5.6 InlineEdit（行内编辑）

替代所有设置页的"标签 + 输入框"表单。

```tsx
<InlineEdit label="项目名称" value={title} onSave={handleSave} />
<InlineEdit label="故事简介" value={premise} multiline onSave={handleSave} />
```

点击文字直接编辑，不需要单独的表单页。

---

## 6. 排版系统

### 6.1 字体层级

```css
/* 标题 — Noto Serif Variable */
.heading-1  { font-family: var(--font-serif); font-size: 3rem;    line-height: 1.1;  font-weight: 700; letter-spacing: -0.025em; }
.heading-2  { font-family: var(--font-serif); font-size: 2rem;    line-height: 1.2;  font-weight: 600; letter-spacing: -0.02em; }
.heading-3  { font-family: var(--font-serif); font-size: 1.375rem; line-height: 1.35; font-weight: 600; }

/* 正文 — Geist Variable */
.body-lg    { font-family: var(--font-sans); font-size: 1.0625rem; line-height: 1.7; }
.body       { font-family: var(--font-sans); font-size: 0.9375rem; line-height: 1.7; }
.body-sm    { font-family: var(--font-sans); font-size: 0.8125rem; line-height: 1.6; }

/* 标签 — Geist Variable */
.caption    { font-family: var(--font-sans); font-size: 0.6875rem; line-height: 1.4; letter-spacing: 0.05em; }
.overline   { font-family: var(--font-sans); font-size: 0.6875rem; line-height: 1.4; letter-spacing: 0.22em; text-transform: uppercase; }
```

### 6.2 间距节奏

```css
/* 区域间距 */
.section-airy    { padding: 6rem 0; }    /* 着陆页 section */
.section-normal  { padding: 3rem 0; }    /* 标准页面 section */
.section-compact { padding: 1.5rem 0; }  /* 密集区域 */

/* 内容间距 */
.stack-tight  > * + * { margin-top: 0.5rem; }
.stack-normal > * + * { margin-top: 1rem; }
.stack-loose  > * + * { margin-top: 2rem; }
```

### 6.3 圆角规范

```css
/* 不是所有东西都用同一个圆角 */
--radius-card: 0.75rem;      /* 卡片 */
--radius-button: 9999px;     /* 按钮 — 全圆角药丸 */
--radius-input: 0.5rem;      /* 输入框 */
--radius-badge: 9999px;      /* 标签 */
--radius-panel: 1.25rem;     /* 大面板 */
--radius-modal: 1.5rem;      /* 弹窗 */
```

---

## 7. 动画规范

### 7.1 缓动曲线

```css
/* 禁止使用 linear 和 ease-in-out */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);      /* 出场 */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);   /* 弹出 */
--ease-in-out-quint: cubic-bezier(0.83, 0, 0.17, 1);  /* 平滑过渡 */
--ease-spring: cubic-bezier(0.32, 0.72, 0, 1);        /* 通用弹性 */
```

### 7.2 动画时长

| 场景 | 时长 | 缓动 |
|------|------|------|
| Hover 微交互 | 150ms | `ease-spring` |
| 状态切换 | 250ms | `ease-out-expo` |
| 页面入场 | 400~600ms | `ease-out-expo` |
| 弹窗/浮层 | 300ms | `ease-out-back` |
| 滚动触发动画 | 600~800ms | `ease-out-expo` |

### 7.3 滚动入场

```tsx
// Framer Motion 标准入场
<motion.div
  initial={{ opacity: 0, y: 24, filter: 'blur(4px)' }}
  whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
  viewport={{ once: true, amount: 0.3 }}
  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
>
```

### 7.4 禁止的动画

- `transition-all` 不加时长和缓动
- `ease-linear` 或 `ease-in-out`
- 直接动画 `width`、`height`、`top`、`left`（用 `transform` 和 `opacity`）
- 大面积 `backdrop-blur`（只用于固定/粘性元素）

---

## 8. 页面类型模板

### 8.1 Dashboard

```
┌─────────────────────────────────────────────┐
│  SectionLabel: 最近动态                       │
│  ┌─────────────────────┐ ┌──────────────┐   │
│  │  DataPanel (timeline)│ │  Summary 条   │   │
│  │  时间线式活动记录     │ │  字数/章/角色  │   │
│  └─────────────────────┘ └──────────────┘   │
│                                              │
│  SectionLabel: 我的项目                       │
│  ┌───┐ ┌───┐ ┌───┐                          │
│  │   │ │   │ │   │  ← 不等高瀑布流           │
│  │   │ │   │ └───┘    而不是等高 grid         │
│  │   │ └───┘                                 │
│  └───┘                                       │
└─────────────────────────────────────────────┘
```

### 8.2 项目工作台

```
┌─────────────────────────────────────────────┐
│  大标题（衬线）                                │
│  InlineEdit: 项目简介                         │
│                                              │
│  ┌─────────────────┐ ┌─────────────────┐    │
│  │  Surface: Inset  │ │  Surface: Panel  │   │
│  │  章节列表         │ │  角色档案         │   │
│  │  (Timeline 组件) │ │  (InfoBlock)     │   │
│  └─────────────────┘ └─────────────────┘    │
└─────────────────────────────────────────────┘
```

### 8.3 AI 工具箱

```
┌─────────────────────────────────────────────┐
│  ┌─────────────────┐ ┌─────────────────┐    │
│  │  Surface: Panel  │ │  Surface: Wash   │   │
│  │  输入区           │ │  AI 输出区        │   │
│  │  (InlineEdit)   │ │  (ChatBubble)    │   │
│  │                  │ │  流式打字效果     │   │
│  └─────────────────┘ └─────────────────┘    │
│                                              │
│  Surface: Flat                               │
│  历史记录 (DataPanel)                         │
└─────────────────────────────────────────────┘
```

---

## 9. 实施优先级

1. **立即修复**：Badge 默认样式（消除大量 override）
2. **第一步**：提取 SectionLabel、InfoBlock、ChatBubble 组件
3. **第二步**：为 Dashboard 和工作台页面引入 Surface 变体
4. **第三步**：为设置页引入 InlineEdit，为列表页引入 Timeline
5. **第四步**：统一动画缓动曲线和入场模式
