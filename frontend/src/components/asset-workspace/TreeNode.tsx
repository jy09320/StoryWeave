import { useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { TreeNode as TreeNodeType } from './AssetWorkspace'

interface TreeNodeProps {
  node: TreeNodeType
  selectedId: string | null
  onSelect: (id: string) => void
  depth?: number
  onNodeRename?: (nodeId: string) => void
  onNodeDelete?: (nodeId: string) => void
  onNodeOpenInNewTab?: (nodeId: string) => void
}

export function TreeNode({ node, selectedId, onSelect, depth = 0, onNodeRename, onNodeDelete, onNodeOpenInNewTab }: TreeNodeProps) {
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
            onNodeRename={onNodeRename}
            onNodeDelete={onNodeDelete}
            onNodeOpenInNewTab={onNodeOpenInNewTab}
          />
        ))}
      </div>
    )
  }

  // Leaf node — wrap with DropdownMenu for context menu
  const leafButton = (
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

  // If no context menu handlers, return plain button
  if (!onNodeRename && !onNodeDelete && !onNodeOpenInNewTab) {
    return leafButton
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {leafButton}
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
  )
}
