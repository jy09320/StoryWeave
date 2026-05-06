import { Toaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { TooltipProvider } from '@/components/ui/tooltip'

import { AppShell } from '@/components/app-shell'
import { ProtectedRoute } from '@/components/protected-route'
import { AuthProvider } from '@/contexts/auth-context'
import { queryClient } from '@/lib/query-client'
import { AIToolboxPage } from '@/pages/ai-toolbox-page'
import { CharactersPage } from '@/pages/characters-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { HomePage } from '@/pages/home-page'
import { LoginPage } from '@/pages/login-page'
import { ProjectEditorPage } from '@/pages/project-editor-page'
import { ProjectAIWorkspacePage } from '@/pages/project-ai-workspace-page'
import { ProjectWorldPage } from '@/pages/project-world-page'
import { ProjectWorkspacePage } from '@/pages/project-workspace-page'
import { RegisterPage } from '@/pages/register-page'
import { SettingsPage } from '@/pages/settings-page'

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'workspace',
        element: <DashboardPage />,
      },
      {
        path: 'characters',
        element: <CharactersPage />,
      },
      {
        path: 'projects/:projectId',
        element: <ProjectWorkspacePage />,
      },
      {
        path: 'projects/:projectId/characters',
        element: <CharactersPage />,
      },
      {
        path: 'projects/:projectId/editor/:chapterId',
        element: <ProjectEditorPage />,
      },
      {
        path: 'projects/:projectId/world',
        element: <ProjectWorldPage />,
      },
      {
        path: 'projects/:projectId/ai-workspace',
        element: <ProjectAIWorkspacePage />,
      },
      {
        path: 'ai-toolbox',
        element: <AIToolboxPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" theme="dark" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
