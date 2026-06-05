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
  onNodeRename?: (nodeId: string) => void
  onNodeDelete?: (nodeId: string) => void
  onNodeOpenInNewTab?: (nodeId: string) => void
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
  onNodeRename,
  onNodeDelete,
  onNodeOpenInNewTab,
}: TreePanelProps) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border bg-sidebar">
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
                onNodeRename={onNodeRename}
                onNodeDelete={onNodeDelete}
                onNodeOpenInNewTab={onNodeOpenInNewTab}
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
