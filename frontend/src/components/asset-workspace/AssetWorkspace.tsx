import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { TreePanel } from './TreePanel'
import { TabBar } from './TabBar'
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
  treeNodes: TreeNode[]
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
  tabs: Tab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabsReorder?: (tabs: Tab[]) => void
  renderEditor: (tabId: string) => React.ReactNode
  // Context menu handlers (optional, wired up in Task 12)
  onNodeRename?: (nodeId: string) => void
  onNodeDelete?: (nodeId: string) => void
  onNodeOpenInNewTab?: (nodeId: string) => void
  // Tab bar add button (optional, wired up in Task 13)
  onAddTab?: () => void
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
  onNodeRename,
  onNodeDelete,
  onNodeOpenInNewTab,
  onAddTab,
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
                  onAddTab={onAddTab}
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
