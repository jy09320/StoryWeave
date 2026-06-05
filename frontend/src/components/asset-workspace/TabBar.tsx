import { X, Plus } from '@phosphor-icons/react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import type { Tab } from './AssetWorkspace'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onTabSelect: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onTabsReorder?: (tabs: Tab[]) => void
  onAddTab?: () => void
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose, onAddTab }: TabBarProps) {
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
          {onAddTab && (
            <button
              type="button"
              onClick={onAddTab}
              className="flex h-8 items-center justify-center rounded-md px-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
        <ScrollBar orientation="horizontal" className="h-1" />
      </ScrollArea>
    </div>
  )
}
