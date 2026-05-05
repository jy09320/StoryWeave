import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/auth-context'
import { registerApi } from '@/services/auth'

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    if (password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }
    setIsSubmitting(true)
    try {
      const { access_token } = await registerApi(email.trim(), password)
      await login(access_token)
      navigate('/workspace', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">创建账号</h1>
          <p className="text-sm text-muted-foreground">开始你的故事创作之旅</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/85">邮箱</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/85">密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? '注册中...' : '注册'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          已有账号？{' '}
          <Link to="/login" className="text-primary hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
