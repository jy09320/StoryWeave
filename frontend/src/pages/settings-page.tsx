import { RuntimeSettingsPanel } from '@/components/ai/runtime-settings-panel'

export function SettingsPage() {
  return (
    <div className="space-y-6 pb-8">
      <section className="space-y-2">
        <div className="text-sm uppercase tracking-[0.18em] text-primary/80">Settings</div>
        <h1 className="text-3xl font-semibold text-foreground">设置中心</h1>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
          统一维护 AI 运行时主配置。写作工作台与 AI 工具箱只消费这里的全局设置。
        </p>
      </section>

      <RuntimeSettingsPanel />
    </div>
  )
}
