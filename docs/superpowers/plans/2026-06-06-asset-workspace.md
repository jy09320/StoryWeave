# Asset Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor character library and worldbuilding pages from card-stacking layout to a tree + multi-tab workspace pattern.

**Architecture:** A shared `AssetWorkspace` layout component provides a resizable tree panel on the left and a multi-tab editing area on the right. Each page (characters, world settings) supplies its own tree data, grouping logic, and editor components. The app-shell sidebar is hidden on these routes.

**Tech Stack:** React 19, TypeScript, shadcn/ui (Radix primitives), TanStack Query, Tiptap, Framer Motion, Phosphor Icons

**Spec:** `docs/superpowers/specs/2026-06-06-asset-workspace-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/components/ui/tabs.tsx` | shadcn Tabs wrapper around @radix-ui/react-tabs |
| `frontend/src/components/ui/resizable.tsx` | shadcn ResizablePanel wrapper around @radix-ui/react-resizable-panels |
| `frontend/src/components/asset-workspace/AssetWorkspace.tsx` | Main layout: resizable tree + tab area |
| `frontend/src/components/asset-workspace/TreePanel.tsx` | Tree container: search, dimension switcher, node list |
| `frontend/src/components/asset-workspace/TreeSearchBar.tsx` | Search input with filtering |
| `frontend/src/components/asset-workspace/DimensionSwitcher.tsx` | Segmented control for group-by dimension |
| `frontend/src/components/asset-workspace/TreeNode.tsx` | Recursive tree node (group or leaf) |
| `frontend/src/components/asset-workspace/TabBar.tsx` | Multi-tab bar with close/add/drag |
| `frontend/src/components/asset-workspace/TabContent.tsx` | Routes active tab to its editor |
| `frontend/src/components/asset-workspace/EmptyState.tsx` | Empty tree / no-tab-open states |
| `frontend/src/components/asset-workspace/CharacterEditor.tsx` | Character editing with sub-tabs (basic/personality/background/relationships/chat) |
| `frontend/src/components/asset-workspace/CharacterBasicForm.tsx` | Character basic info form (name, alias, tags, description, portrait) |
| `frontend/src/components/asset-workspace/RichTextField.tsx` | Reusable Tiptap field for personality/background/relationship_notes |
| `frontend/src/components/asset-workspace/WorldSettingEditor.tsx` | World setting editing with sub-tabs |
| `frontend/src/components/asset-workspace/WorldSettingField.tsx` | Single world setting field (label + Tiptap editor) |

### Modified Files

| File | Change |
|------|--------|
| `frontend/package.json` | Add `@radix-ui/react-resizable-panels` |
| `frontend/src/pages/characters-page.tsx` | Replace card layout with AssetWorkspace (project-scoped mode) |
| `frontend/src/pages/project-world-page.tsx` | Replace card layout with AssetWorkspace |
| `frontend/src/components/app-shell.tsx` | Hide project sidebar on characters/world routes |

---

## Task 1: Install Resizable Panels Package

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install the package**

```bash
cd E:/Projects/story-weave/frontend
npm install @radix-ui/react-resizable-panels
```

- [ ] **Step 2: Verify installation**

```bash
cd E:/Projects/story-weave/frontend
npm ls @radix-ui/react-resizable-panels
```

Expected: package listed with a version number.

- [ ] **Step 3: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/package.json frontend/package-lock.json
git commit -m "deps: add @radix-ui/react-resizable-panels"
```

---

## Task 2: Create shadcn Tabs Component

**Files:**
- Create: `frontend/src/components/ui/tabs.tsx`

The project has `@radix-ui/react-tabs` installed but no wrapper. Create a shadcn-compatible wrapper following the same patterns as existing UI components.

- [ ] **Step 1: Read an existing shadcn component for style reference**

Read `frontend/src/components/ui/button.tsx` to understand the project's component pattern (cn utility, forwardRef, etc.).

- [ ] **Step 2: Create the Tabs component**

```tsx
// frontend/src/components/ui/tabs.tsx
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `tabs.tsx`.

- [ ] **Step 4: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/ui/tabs.tsx
git commit -m "feat(ui): add shadcn Tabs component wrapper"
```

---

## Task 3: Create shadcn ResizablePanel Component

**Files:**
- Create: `frontend/src/components/ui/resizable.tsx`

- [ ] **Step 1: Create the Resizable component**

```tsx
// frontend/src/components/ui/resizable.tsx
import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "@radix-ui/react-resizable-panels"
import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </ResizablePrimitive.PanelResizeHandle>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors related to `resizable.tsx`.

- [ ] **Step 3: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/ui/resizable.tsx
git commit -m "feat(ui): add shadcn ResizablePanel component wrapper"
```

---

## Task 4: Create AssetWorkspace Layout Skeleton

**Files:**
- Create: `frontend/src/components/asset-workspace/AssetWorkspace.tsx`

This is the main layout container. It provides a resizable split between a tree panel (left) and a tab content area (right).

- [ ] **Step 1: Create the AssetWorkspace component**

```tsx
// frontend/src/components/asset-workspace/AssetWorkspace.tsx
import { useState, useCallback } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { TreePanel } from './TreePanel'
import { TabBar } from './TabBar'
import { TabContent } from './TabContent'
import { EmptyState } from './EmptyState'

export interface TreeNode {
  id: string
  label: string
  type: 'group' | 'leaf'
  icon?: React.ReactNode
  children?: TreeNode[]
  meta?: string
}

export interface Tab {
  id: string
  label: string
  dirty?: boolean
}

interface AssetWorkspaceProps {
  /** Tree nodes to display */
  treeNodes: TreeNode[]
  /** Currently selected tree node id */
  selectedNodeId: string | null
  /** Called when a tree node is selected */
  onNodeSelect: (nodeId: string) => void
  /** Called when a new item should be created */
  onCreateNew: () => void
  /** Search value for tree filtering */
  searchValue: string
  /** Called when search value changes */
  onSearchChange: (value: string) => void
  /** Dimension switcher value (null to hide) */
  dimension: string | null
  /** Dimension options */
  dimensionOptions?: Array<{ value: string; label: string }>
  /** Called when dimension changes */
  onDimensionChange?: (value: string) => void
  /** Type filter value (null to hide) */
  typeFilter: string | null
  /** Type filter options */
  typeFilterOptions?: Array<{ value: string; label: string }>
  /** Called when type filter changes */
  onTypeFilterChange?: (value: string) => void
  /** Open tabs */
  tabs: Tab[]
  /** Active tab id */
  activeTabId: string | null
  /** Called when a tab is selected */
  onTabSelect: (tabId: string) => void
  /** Called when a tab is closed */
  onTabClose: (tabId: string) => void
  /** Called when tabs are reordered */
  onTabsReorder?: (tabs: Tab[]) => void
  /** Render the editor content for the active tab */
  renderEditor: (tabId: string) => React.ReactNode
}

export function AssetWorkspace({
  treeNodes,
  selectedNodeId,
  onNodeSelect,
  onCreateNew,
  searchValue,
  onSearchChange,
  dimension,
  dimensionOptions,
  onDimensionChange,
  typeFilter,
  typeFilterOptions,
  onTypeFilterChange,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabsReorder,
  renderEditor,
}: AssetWorkspaceProps) {
  return (
    <div className="flex h-full">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={35}>
          <TreePanel
            nodes={treeNodes}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
            onCreateNew={onCreateNew}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            dimension={dimension}
            dimensionOptions={dimensionOptions}
            onDimensionChange={onDimensionChange}
            typeFilter={typeFilter}
            typeFilterOptions={typeFilterOptions}
            onTypeFilterChange={onTypeFilterChange}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={50}>
          <div className="flex h-full flex-col">
            {tabs.length > 0 ? (
              <>
                <TabBar
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onTabSelect={onTabSelect}
                  onTabClose={onTabClose}
                  onTabsReorder={onTabsReorder}
                />
                <div className="flex-1 overflow-auto">
                  {activeTabId && renderEditor(activeTabId)}
                </div>
              </>
            ) : (
              <EmptyState onCreateNew={onCreateNew} />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: Errors about missing imports (TreePanel, TabBar, etc.) — that's expected, they'll be created in later tasks.

- [ ] **Step 3: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/AssetWorkspace.tsx
git commit -m "feat(workspace): add AssetWorkspace layout skeleton"
```

---

## Task 5: Create TreePanel Component

**Files:**
- Create: `frontend/src/components/asset-workspace/TreePanel.tsx`
- Create: `frontend/src/components/asset-workspace/TreeSearchBar.tsx`
- Create: `frontend/src/components/asset-workspace/DimensionSwitcher.tsx`
- Create: `frontend/src/components/asset-workspace/TreeNode.tsx`

- [ ] **Step 1: Create TreeSearchBar**

```tsx
// frontend/src/components/asset-workspace/TreeSearchBar.tsx
import { MagnifyingGlass } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'

interface TreeSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TreeSearchBar({ value, onChange, placeholder = '搜索...' }: TreeSearchBarProps) {
  return (
    <div className="relative">
      <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-9 text-sm"
      />
    </div>
  )
}
```

- [ ] **Step 2: Create DimensionSwitcher**

```tsx
// frontend/src/components/asset-workspace/DimensionSwitcher.tsx
interface DimensionSwitcherProps {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

export function DimensionSwitcher({ value, options, onChange }: DimensionSwitcherProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create TreeNode**

```tsx
// frontend/src/components/asset-workspace/TreeNode.tsx
import { useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import type { TreeNode as TreeNodeType } from './AssetWorkspace'

interface TreeNodeProps {
  node: TreeNodeType
  selectedId: string | null
  onSelect: (id: string) => void
  depth?: number
}

export function TreeNode({ node, selectedId, onSelect, depth = 0 }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)

  if (node.type === 'group') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <CaretDown className="size-3 shrink-0" />
          ) : (
            <CaretRight className="size-3 shrink-0" />
          )}
          <span className="truncate">{node.label}</span>
          {node.meta && (
            <span className="ml-auto text-[10px] text-muted-foreground/60">{node.meta}</span>
          )}
        </button>
        {expanded && node.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
        selectedId === node.id
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground/80 hover:bg-muted/50 hover:text-foreground'
      }`}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {node.icon}
      <span className="truncate">{node.label}</span>
      {node.meta && (
        <span className="ml-auto truncate text-[10px] text-muted-foreground/60">{node.meta}</span>
      )}
    </button>
  )
}
```

- [ ] **Step 4: Create TreePanel**

```tsx
// frontend/src/components/asset-workspace/TreePanel.tsx
import { Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TreeSearchBar } from './TreeSearchBar'
import { DimensionSwitcher } from './DimensionSwitcher'
import { TreeNode } from './TreeNode'
import type { TreeNode as TreeNodeType } from './AssetWorkspace'

interface TreePanelProps {
  nodes: TreeNodeType[]
  selectedNodeId: string | null
  onNodeSelect: (nodeId: string) => void
  onCreateNew: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  dimension: string | null
  dimensionOptions?: Array<{ value: string; label: string }>
  onDimensionChange?: (value: string) => void
  typeFilter: string | null
  typeFilterOptions?: Array<{ value: string; label: string }>
  onTypeFilterChange?: (value: string) => void
}

export function TreePanel({
  nodes,
  selectedNodeId,
  onNodeSelect,
  onCreateNew,
  searchValue,
  onSearchChange,
  dimension,
  dimensionOptions,
  onDimensionChange,
  typeFilter,
  typeFilterOptions,
  onTypeFilterChange,
}: TreePanelProps) {
  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <div className="space-y-2 p-3">
        <TreeSearchBar value={searchValue} onChange={onSearchChange} />

        {typeFilterOptions && typeFilter && onTypeFilterChange && (
          <DimensionSwitcher
            value={typeFilter}
            options={typeFilterOptions}
            onChange={onTypeFilterChange}
          />
        )}

        {dimensionOptions && dimension && onDimensionChange && (
          <DimensionSwitcher
            value={dimension}
            options={dimensionOptions}
            onChange={onDimensionChange}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-2 pb-3">
          {nodes.length > 0 ? (
            nodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                selectedId={selectedNodeId}
                onSelect={onNodeSelect}
              />
            ))
          ) : (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              {searchValue ? '没有匹配的结果' : '还没有内容'}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={onCreateNew}
        >
          <Plus className="size-4" />
          新建
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: Only errors about missing TabBar/TabContent/EmptyState from AssetWorkspace — those come later.

- [ ] **Step 6: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/TreeSearchBar.tsx \
        frontend/src/components/asset-workspace/DimensionSwitcher.tsx \
        frontend/src/components/asset-workspace/TreeNode.tsx \
        frontend/src/components/asset-workspace/TreePanel.tsx
git commit -m "feat(workspace): add TreePanel with search, dimension switcher, and tree nodes"
```

---

## Task 6: Create TabBar and TabContent Components

**Files:**
- Create: `frontend/src/components/asset-workspace/TabBar.tsx`
- Create: `frontend/src/components/asset-workspace/TabContent.tsx`
- Create: `frontend/src/components/asset-workspace/EmptyState.tsx`

- [ ] **Step 1: Create TabBar**

```tsx
// frontend/src/components/asset-workspace/TabBar.tsx
import { X } from '@phosphor-icons/react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { Tab } from './AssetWorkspace'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabsReorder?: (tabs: Tab[]) => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: TabBarProps) {
  return (
    <div className="border-b border-border bg-muted/20">
      <ScrollArea className="w-full">
        <div className="flex h-9 items-end gap-0.5 px-2">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              className={`group flex h-8 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-xs transition ${
                tab.id === activeTabId
                  ? 'border-border bg-background text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
              onClick={() => onTabSelect(tab.id)}
            >
              {tab.dirty && (
                <span className="size-1.5 rounded-full bg-amber-500" />
              )}
              <span className="max-w-[120px] truncate">{tab.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onTabClose(tab.id)
                }}
                className="ml-0.5 rounded p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1" />
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 2: Create TabContent**

```tsx
// frontend/src/components/asset-workspace/TabContent.tsx
interface TabContentProps {
  tabId: string
  children: React.ReactNode
}

export function TabContent({ tabId, children }: TabContentProps) {
  return (
    <div className="h-full overflow-auto" role="tabpanel" data-tab={tabId}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create EmptyState**

```tsx
// frontend/src/components/asset-workspace/EmptyState.tsx
import { Plus, TreeStructure } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateNew: () => void
}

export function EmptyState({ onCreateNew }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <TreeStructure className="size-12 opacity-30" />
      <div className="text-center">
        <p className="text-sm font-medium">还没有打开任何内容</p>
        <p className="mt-1 text-xs">从左侧树中选择一个节点，或创建新的</p>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateNew}>
        <Plus className="size-4" />
        新建
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No errors from the asset-workspace components.

- [ ] **Step 5: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/TabBar.tsx \
        frontend/src/components/asset-workspace/TabContent.tsx \
        frontend/src/components/asset-workspace/EmptyState.tsx
git commit -m "feat(workspace): add TabBar, TabContent, and EmptyState components"
```

---

## Task 7: Create CharacterEditor with Sub-Tabs

**Files:**
- Create: `frontend/src/components/asset-workspace/CharacterEditor.tsx`
- Create: `frontend/src/components/asset-workspace/CharacterBasicForm.tsx`
- Create: `frontend/src/components/asset-workspace/RichTextField.tsx`

- [ ] **Step 1: Create RichTextField (reusable Tiptap field)**

Check if Tiptap is already set up in the project by reading an existing usage. Then create a reusable component:

```tsx
// frontend/src/components/asset-workspace/RichTextField.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

interface RichTextFieldProps {
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function RichTextField({ value, onChange, placeholder }: RichTextFieldProps) {
  const isInternalUpdate = useRef(false)

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true
      onChange(editor.getHTML())
    },
  })

  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentContent = editor.getHTML()
      if ((value || '') !== currentContent) {
        editor.commands.setContent(value || '')
      }
    }
    isInternalUpdate.current = false
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="rounded-lg border border-border bg-card">
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  )
}
```

Note: Adjust the Tiptap setup based on how the project already uses Tiptap. Check `frontend/src` for existing Tiptap imports and extensions.

- [ ] **Step 2: Create CharacterBasicForm**

```tsx
// frontend/src/components/asset-workspace/CharacterBasicForm.tsx
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { X } from '@phosphor-icons/react'
import type { Character, CharacterPayload } from '@/types/api'

interface CharacterBasicFormProps {
  character: Character
  onChange: (payload: Partial<CharacterPayload>) => void
}

interface FormState {
  name: string
  alias: string
  description: string
  tags: string[]
  tagInput: string
}

function characterToForm(c: Character): FormState {
  return {
    name: c.name,
    alias: c.alias || '',
    description: c.description || '',
    tags: c.tags ? c.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    tagInput: '',
  }
}

export function CharacterBasicForm({ character, onChange }: CharacterBasicFormProps) {
  const [form, setForm] = useState(() => characterToForm(character))

  useEffect(() => {
    setForm(characterToForm(character))
  }, [character.id])

  const emitChange = useCallback(
    (updates: Partial<FormState>) => {
      const newForm = { ...form, ...updates }
      setForm(newForm)
      onChange({
        name: newForm.name.trim(),
        alias: newForm.alias.trim() || null,
        description: newForm.description.trim() || null,
        tags: newForm.tags.length > 0 ? newForm.tags.join(', ') : null,
      })
    },
    [form, onChange]
  )

  const addTag = () => {
    const tag = form.tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      emitChange({ tags: [...form.tags, tag], tagInput: '' })
    }
  }

  const removeTag = (tag: string) => {
    emitChange({ tags: form.tags.filter((t) => t !== tag) })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">姓名</label>
          <Input
            value={form.name}
            onChange={(e) => emitChange({ name: e.target.value })}
            placeholder="角色姓名"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">别名</label>
          <Input
            value={form.alias}
            onChange={(e) => emitChange({ alias: e.target.value })}
            placeholder="可选"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">描述</label>
        <Textarea
          value={form.description}
          onChange={(e) => emitChange({ description: e.target.value })}
          placeholder="简短描述"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/85">标签</label>
        <div className="flex flex-wrap gap-1.5">
          {form.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="ml-0.5">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={form.tagInput}
            onChange={(e) => setForm({ ...form, tagInput: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="输入标签后回车"
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create CharacterEditor**

```tsx
// frontend/src/components/asset-workspace/CharacterEditor.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { getCharacter, updateCharacter } from '@/services/characters'
import { CharacterBasicForm } from './CharacterBasicForm'
import { RichTextField } from './RichTextField'
import type { Character, CharacterPayload } from '@/types/api'

interface CharacterEditorProps {
  characterId: string
  onDirtyChange?: (dirty: boolean) => void
}

export function CharacterEditor({ characterId, onDirtyChange }: CharacterEditorProps) {
  const queryClient = useQueryClient()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPayloadRef = useRef<Partial<CharacterPayload>>({})

  const { data: character, isLoading } = useQuery<Character>({
    queryKey: ['character', characterId],
    queryFn: () => getCharacter(characterId),
    enabled: Boolean(characterId),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CharacterPayload>) =>
      updateCharacter(characterId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['character', characterId] })
      onDirtyChange?.(false)
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  const scheduleSave = useCallback(
    (payload: Partial<CharacterPayload>) => {
      pendingPayloadRef.current = { ...pendingPayloadRef.current, ...payload }
      onDirtyChange?.(true)

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        if (Object.keys(pendingPayloadRef.current).length > 0) {
          updateMutation.mutate(pendingPayloadRef.current)
          pendingPayloadRef.current = {}
        }
      }, 300)
    },
    [updateMutation, onDirtyChange]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (isLoading || !character) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <Tabs defaultValue="basic" className="h-full">
      <div className="border-b border-border px-4">
        <TabsList className="h-9 bg-transparent">
          <TabsTrigger value="basic">基础信息</TabsTrigger>
          <TabsTrigger value="personality">性格特征</TabsTrigger>
          <TabsTrigger value="background">人物背景</TabsTrigger>
          <TabsTrigger value="relationships">人际关系</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="basic" className="mt-0">
        <CharacterBasicForm character={character} onChange={scheduleSave} />
      </TabsContent>

      <TabsContent value="personality" className="mt-0 p-4">
        <RichTextField
          value={character.personality}
          onChange={(v) => scheduleSave({ personality: v })}
          placeholder="描述角色的性格特征..."
        />
      </TabsContent>

      <TabsContent value="background" className="mt-0 p-4">
        <RichTextField
          value={character.background}
          onChange={(v) => scheduleSave({ background: v })}
          placeholder="描述角色的背景故事..."
        />
      </TabsContent>

      <TabsContent value="relationships" className="mt-0 p-4">
        <RichTextField
          value={character.relationship_notes}
          onChange={(v) => scheduleSave({ relationship_notes: v })}
          placeholder="描述角色的人际关系..."
        />
      </TabsContent>
    </Tabs>
  )
}
```

Note: The `getCharacter` and `updateCharacter` imports need to match the actual service exports. Check `services/characters.ts` for the exact function names.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: May have import errors if `getCharacter` doesn't exist as a named export. Adjust imports to match actual service API.

- [ ] **Step 5: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/RichTextField.tsx \
        frontend/src/components/asset-workspace/CharacterBasicForm.tsx \
        frontend/src/components/asset-workspace/CharacterEditor.tsx
git commit -m "feat(workspace): add CharacterEditor with sub-tabs and auto-save"
```

---

## Task 8: Create WorldSettingEditor with Sub-Tabs

**Files:**
- Create: `frontend/src/components/asset-workspace/WorldSettingEditor.tsx`
- Create: `frontend/src/components/asset-workspace/WorldSettingField.tsx`

- [ ] **Step 1: Create WorldSettingField**

```tsx
// frontend/src/components/asset-workspace/WorldSettingField.tsx
import { RichTextField } from './RichTextField'

interface WorldSettingFieldProps {
  label: string
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function WorldSettingField({ label, value, onChange, placeholder }: WorldSettingFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground/85">{label}</label>
      <RichTextField value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}
```

- [ ] **Step 2: Create WorldSettingEditor**

```tsx
// frontend/src/components/asset-workspace/WorldSettingEditor.tsx
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { getProject, updateProjectWorldSetting } from '@/services/projects'
import { WorldSettingField } from './WorldSettingField'
import type { ProjectDetail, WorldSettingPayload } from '@/types/api'

interface WorldSettingEditorProps {
  projectId: string
  field: 'overview' | 'rules' | 'factions' | 'locations' | 'timeline' | 'extra_notes'
  onDirtyChange?: (dirty: boolean) => void
}

const FIELD_CONFIG: Record<string, { label: string; placeholder: string }> = {
  overview: { label: '总览', placeholder: '描述世界观的整体概况...' },
  rules: { label: '世界规则', placeholder: '描述世界运行的规则...' },
  factions: { label: '势力分布', placeholder: '描述各势力及其关系...' },
  locations: { label: '重要地点', placeholder: '描述重要的地理位置...' },
  timeline: { label: '时间线', placeholder: '描述重要的时间节点...' },
  extra_notes: { label: '备注', placeholder: '其他补充信息...' },
}

export function WorldSettingEditor({ projectId, field, onDirtyChange }: WorldSettingEditorProps) {
  const queryClient = useQueryClient()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: Boolean(projectId),
  })

  const worldSetting = project?.world_setting

  const updateMutation = useMutation({
    mutationFn: (payload: WorldSettingPayload) =>
      updateProjectWorldSetting(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      onDirtyChange?.(false)
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  const scheduleSave = useCallback(
    (value: string) => {
      onDirtyChange?.(true)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        updateMutation.mutate({ [field]: value || null })
      }, 300)
    },
    [field, updateMutation, onDirtyChange]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  const config = FIELD_CONFIG[field]
  const fieldValue = worldSetting?.[field] ?? null

  return (
    <div className="p-4">
      {field === 'overview' && worldSetting && (
        <div className="mb-4 space-y-1.5">
          <label className="text-sm font-medium text-foreground/85">标题</label>
          <Input
            value={worldSetting.title || ''}
            onChange={(e) => scheduleSave(e.target.value)}
            placeholder="世界观标题"
          />
        </div>
      )}
      <WorldSettingField
        label={config.label}
        value={fieldValue}
        onChange={scheduleSave}
        placeholder={config.placeholder}
      />
    </div>
  )
}
```

Note: Adjust imports based on actual service exports. `getProject` may be named differently in `services/projects.ts`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: Adjust any import mismatches.

- [ ] **Step 4: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/WorldSettingField.tsx \
        frontend/src/components/asset-workspace/WorldSettingEditor.tsx
git commit -m "feat(workspace): add WorldSettingEditor with sub-tabs and auto-save"
```

---

## Task 9: Integrate AssetWorkspace into characters-page.tsx

**Files:**
- Modify: `frontend/src/pages/characters-page.tsx`

This is the largest change. Replace the project-scoped card layout with the AssetWorkspace component, while preserving the global layout and all existing mutation logic.

- [ ] **Step 1: Read the current characters-page.tsx to understand the full structure**

Read `frontend/src/pages/characters-page.tsx` completely. Identify:
- The `isProjectScoped` branch (lines ~342-451) — this is what gets replaced
- All mutation hooks (update, delete, attach, create) — these are preserved
- The `CharacterDialog` component — preserved for now, may be removed later
- The `CharacterList` and `CharacterDetail` components — no longer needed for project-scoped

- [ ] **Step 2: Add imports for AssetWorkspace and related components**

At the top of the file, add:

```typescript
import { AssetWorkspace, type TreeNode, type Tab } from '@/components/asset-workspace/AssetWorkspace'
import { CharacterEditor } from '@/components/asset-workspace/CharacterEditor'
```

- [ ] **Step 3: Add state for the workspace in the project-scoped branch**

Inside the main component, add workspace-specific state:

```typescript
// Workspace state for project-scoped view
const [workspaceSearch, setWorkspaceSearch] = useState('')
const [workspaceDimension, setWorkspaceDimension] = useState('tags')
const [openTabs, setOpenTabs] = useState<Tab[]>([])
const [activeTabId, setActiveTabId] = useState<string | null>(null)
```

- [ ] **Step 4: Build tree nodes from characters data**

Derive tree nodes from the characters list based on the selected dimension:

```typescript
const treeNodes = useMemo((): TreeNode[] => {
  if (!characters) return []

  const filtered = workspaceSearch
    ? characters.filter(
        (c) =>
          c.name.toLowerCase().includes(workspaceSearch.toLowerCase()) ||
          (c.alias && c.alias.toLowerCase().includes(workspaceSearch.toLowerCase()))
      )
    : characters

  if (workspaceDimension === 'none') {
    return filtered.map((c) => ({
      id: c.id,
      label: c.name,
      type: 'leaf' as const,
      meta: c.alias || undefined,
    }))
  }

  // Group by the selected dimension
  const groups = new Map<string, Character[]>()
  for (const char of filtered) {
    let groupKey: string
    if (workspaceDimension === 'tags') {
      groupKey = char.tags?.split(',')[0]?.trim() || '未分组'
    } else {
      groupKey = '未分组'
    }
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(char)
  }

  return Array.from(groups.entries()).map(([label, chars]) => ({
    id: `group-${label}`,
    label,
    type: 'group' as const,
    children: chars.map((c) => ({
      id: c.id,
      label: c.name,
      type: 'leaf' as const,
      meta: c.alias || undefined,
    })),
  }))
}, [characters, workspaceSearch, workspaceDimension])
```

- [ ] **Step 5: Implement tab management handlers**

```typescript
const handleNodeSelect = useCallback(
  (nodeId: string) => {
    // Don't open tabs for group nodes
    if (nodeId.startsWith('group-')) return

    // Add tab if not already open
    if (!openTabs.find((t) => t.id === nodeId)) {
      const char = characters?.find((c) => c.id === nodeId)
      if (char) {
        setOpenTabs((prev) => [...prev, { id: char.id, label: char.name }])
      }
    }
    setActiveTabId(nodeId)
  },
  [openTabs, characters]
)

const handleTabClose = useCallback(
  (tabId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  },
  [activeTabId]
)

const handleCreateNew = useCallback(() => {
  setCreateDialogOpen(true)
}, [])

const handleDirtyChange = useCallback(
  (dirty: boolean) => {
    if (activeTabId) {
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, dirty } : t))
      )
    }
  },
  [activeTabId]
)
```

- [ ] **Step 6: Replace the project-scoped layout JSX**

Replace the `isProjectScoped` branch (the stacked card layout) with:

```tsx
{isProjectScoped ? (
  <AssetWorkspace
    treeNodes={treeNodes}
    selectedNodeId={activeTabId}
    onNodeSelect={handleNodeSelect}
    onCreateNew={handleCreateNew}
    searchValue={workspaceSearch}
    onSearchChange={setWorkspaceSearch}
    dimension={workspaceDimension}
    dimensionOptions={[
      { value: 'tags', label: '按标签' },
      { value: 'none', label: '不分组' },
    ]}
    onDimensionChange={setWorkspaceDimension}
    typeFilter={null}
    tabs={openTabs}
    activeTabId={activeTabId}
    onTabSelect={setActiveTabId}
    onTabClose={handleTabClose}
    renderEditor={(tabId) => (
      <CharacterEditor
        key={tabId}
        characterId={tabId}
        onDirtyChange={handleDirtyChange}
      />
    )}
  />
) : (
  // ... keep existing global layout unchanged
)}
```

- [ ] **Step 7: Verify the page loads correctly**

```bash
cd E:/Projects/story-weave/frontend
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/pages/characters-page.tsx
git commit -m "feat(characters): replace card layout with AssetWorkspace for project-scoped view"
```

---

## Task 10: Integrate AssetWorkspace into project-world-page.tsx

**Files:**
- Modify: `frontend/src/pages/project-world-page.tsx`

- [ ] **Step 1: Read the current project-world-page.tsx**

Read `frontend/src/pages/project-world-page.tsx` completely. Understand the world setting data flow and the AI draft generation feature.

- [ ] **Step 2: Add imports**

```typescript
import { AssetWorkspace, type TreeNode, type Tab } from '@/components/asset-workspace/AssetWorkspace'
import { WorldSettingEditor } from '@/components/asset-workspace/WorldSettingEditor'
```

- [ ] **Step 3: Add workspace state**

```typescript
const [activeField, setActiveField] = useState<string>('overview')
const [openTabs, setOpenTabs] = useState<Tab[]>([
  { id: 'overview', label: '总览' },
])
const [activeTabId, setActiveTabId] = useState<string>('overview')
```

- [ ] **Step 4: Define tree nodes for world setting fields**

```typescript
const treeNodes = useMemo((): TreeNode[] => {
  const fields = [
    { id: 'overview', label: '总览' },
    { id: 'rules', label: '世界规则' },
    { id: 'factions', label: '势力分布' },
    { id: 'locations', label: '重要地点' },
    { id: 'timeline', label: '时间线' },
    { id: 'extra_notes', label: '备注' },
  ]
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: 'leaf' as const,
  }))
}, [])
```

- [ ] **Step 5: Implement handlers**

```typescript
const handleNodeSelect = useCallback(
  (nodeId: string) => {
    if (!openTabs.find((t) => t.id === nodeId)) {
      const node = treeNodes.find((n) => n.id === nodeId)
      if (node) {
        setOpenTabs((prev) => [...prev, { id: node.id, label: node.label }])
      }
    }
    setActiveTabId(nodeId)
  },
  [openTabs, treeNodes]
)

const handleTabClose = useCallback(
  (tabId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  },
  [activeTabId]
)

const handleDirtyChange = useCallback(
  (dirty: boolean) => {
    if (activeTabId) {
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, dirty } : t))
      )
    }
  },
  [activeTabId]
)
```

- [ ] **Step 6: Replace the card layout with AssetWorkspace**

Replace the existing stacked cards with:

```tsx
<AssetWorkspace
  treeNodes={treeNodes}
  selectedNodeId={activeTabId}
  onNodeSelect={handleNodeSelect}
  onCreateNew={() => {}}
  searchValue=""
  onSearchChange={() => {}}
  dimension={null}
  typeFilter={null}
  tabs={openTabs}
  activeTabId={activeTabId}
  onTabSelect={setActiveTabId}
  onTabClose={handleTabClose}
  renderEditor={(tabId) => (
    <WorldSettingEditor
      key={tabId}
      projectId={projectId!}
      field={tabId as 'overview' | 'rules' | 'factions' | 'locations' | 'timeline' | 'extra_notes'}
      onDirtyChange={handleDirtyChange}
    />
  )}
/>
```

- [ ] **Step 7: Preserve AI draft generation**

The AI draft generation feature needs to remain accessible. Add a button in the tree panel footer or as a toolbar action. Check if the `generateDraftMutation` and related UI can be moved to a toolbar above the editor or into the WorldSettingEditor component.

- [ ] **Step 8: Verify build**

```bash
cd E:/Projects/story-weave/frontend
npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/pages/project-world-page.tsx
git commit -m "feat(world): replace card layout with AssetWorkspace"
```

---

## Task 11: Hide App-Shell Sidebar on Asset Routes

**Files:**
- Modify: `frontend/src/components/app-shell.tsx`

- [ ] **Step 1: Add route detection for characters and world pages**

In the route detection section (around line 483), add:

```typescript
const isAssetWorkspaceRoute =
  isProjectScoped &&
  (location.pathname.endsWith('/characters') || location.pathname.endsWith('/world'))
```

- [ ] **Step 2: Update shouldRenderProjectTree**

Modify the `shouldRenderProjectTree` expression (line 885) to exclude asset workspace routes:

```typescript
const shouldRenderProjectTree = isProjectScoped && isProjectTreeOpen && !isZenMode && !isAssetWorkspaceRoute
```

- [ ] **Step 3: Update keyboard shortcut behavior**

In the `Ctrl+B` shortcut handler (around line 654), prevent toggling the sidebar on asset workspace routes:

```typescript
if (event.key === 'b' && (event.ctrlKey || event.metaKey)) {
  if (!isAssetWorkspaceRoute) {
    setIsProjectTreeOpen((prev) => !prev)
  }
}
```

- [ ] **Step 4: Verify no layout regressions on other pages**

Check that the project tree still shows correctly on:
- `/projects/:id` (dashboard)
- `/projects/:id/editor/:chapterId` (editor)
- `/projects/:id/ai-workspace`
- `/projects/:id/graph`

- [ ] **Step 5: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/app-shell.tsx
git commit -m "fix(app-shell): hide project sidebar on character and world workspace routes"
```

---

## Task 12: Add Tree Node Context Menu

**Files:**
- Modify: `frontend/src/components/asset-workspace/TreeNode.tsx`
- Modify: `frontend/src/components/asset-workspace/AssetWorkspace.tsx`

The spec requires right-click context menu on tree nodes with: rename, delete, move to group, open in new tab.

- [ ] **Step 1: Add context menu props to AssetWorkspace**

Add to `AssetWorkspaceProps`:

```typescript
/** Called when a node should be renamed */
onNodeRename?: (nodeId: string) => void
/** Called when a node should be deleted */
onNodeDelete?: (nodeId: string) => void
/** Called when a node should open in a new tab */
onNodeOpenInNewTab?: (nodeId: string) => void
```

Pass these through to `TreePanel`, then to `TreeNode`.

- [ ] **Step 2: Add context menu to TreeNode**

Use the existing `DropdownMenu` component from `@/components/ui/dropdown-menu`:

```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// In TreeNode, wrap the leaf button with DropdownMenu:
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button type="button" onClick={() => onSelect(node.id)} ...>
      {/* existing content */}
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" side="right">
    {onNodeOpenInNewTab && (
      <DropdownMenuItem onClick={() => onNodeOpenInNewTab(node.id)}>
        在新标签页打开
      </DropdownMenuItem>
    )}
    {onNodeRename && (
      <DropdownMenuItem onClick={() => onNodeRename(node.id)}>
        重命名
      </DropdownMenuItem>
    )}
    {onNodeDelete && (
      <DropdownMenuItem onClick={() => onNodeDelete(node.id)} className="text-destructive">
        删除
      </DropdownMenuItem>
    )}
  </DropdownMenuContent>
</DropdownMenu>
```

- [ ] **Step 3: Wire up handlers in characters-page.tsx**

Add handlers for rename (inline edit or dialog), delete (existing `deleteCharacterMutation`), and open-in-new-tab (add to `openTabs`).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/TreeNode.tsx \
        frontend/src/components/asset-workspace/AssetWorkspace.tsx \
        frontend/src/pages/characters-page.tsx
git commit -m "feat(workspace): add tree node context menu with rename, delete, open-in-new-tab"
```

---

## Task 13: Add Tab Bar `+` Button

**Files:**
- Modify: `frontend/src/components/asset-workspace/TabBar.tsx`
- Modify: `frontend/src/components/asset-workspace/AssetWorkspace.tsx`

The spec requires a `+` button in the tab bar that opens a node selector to add a new tab.

- [ ] **Step 1: Add `onAddTab` prop to TabBar**

```typescript
interface TabBarProps {
  // ... existing props
  onAddTab?: () => void
}
```

Add a `+` button at the end of the tabs list:

```tsx
<button
  type="button"
  onClick={onAddTab}
  className="flex h-8 items-center justify-center rounded-md px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
>
  <Plus className="size-3.5" />
</button>
```

- [ ] **Step 2: Implement node selector in characters-page.tsx**

When `+` is clicked, show a `Popover` or `Command` dialog listing all characters not yet open as tabs. Selecting one adds it to `openTabs` and activates it.

```typescript
const handleAddTab = useCallback(() => {
  // Show a popover/dialog with available characters
  // On select: add to openTabs and set active
}, [characters, openTabs])
```

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty 2>&1 | head -20
```

```bash
cd E:/Projects/story-weave
git add frontend/src/components/asset-workspace/TabBar.tsx \
        frontend/src/components/asset-workspace/AssetWorkspace.tsx \
        frontend/src/pages/characters-page.tsx
git commit -m "feat(workspace): add tab bar + button with node selector"
```

---

## Task 14: Final Verification and Cleanup

- [ ] **Step 1: Run full TypeScript check**

```bash
cd E:/Projects/story-weave/frontend
npx tsc --noEmit --pretty
```

Expected: No errors.

- [ ] **Step 2: Run full build**

```bash
cd E:/Projects/story-weave/frontend
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Verify all imports are correct**

Check that all `@/services/*` imports match actual exports. Check that all `@/types/api` imports match actual type names.

- [ ] **Step 4: Remove unused code from characters-page.tsx**

If `CharacterList`, `CharacterDetail`, and `CharacterDialog` are no longer used in the project-scoped branch, they can be kept for the global branch. Do not delete them unless confirmed unused.

- [ ] **Step 5: Final commit**

```bash
cd E:/Projects/story-weave
git add -A
git commit -m "feat(workspace): complete asset workspace refactor for characters and world settings"
```
