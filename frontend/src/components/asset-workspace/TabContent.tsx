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
