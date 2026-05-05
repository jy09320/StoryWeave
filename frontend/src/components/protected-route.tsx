import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
