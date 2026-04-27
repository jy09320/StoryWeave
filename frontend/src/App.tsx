import { Toaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { TooltipProvider } from '@/components/ui/tooltip'

import { AppShell } from '@/components/app-shell'
import { queryClient } from '@/lib/query-client'
import { AIToolboxPage } from '@/pages/ai-toolbox-page'
import { CharactersPage } from '@/pages/characters-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { ProjectEditorPage } from '@/pages/project-editor-page'
import { ProjectWorldPage } from '@/pages/project-world-page'
import { ProjectWorkspacePage } from '@/pages/project-workspace-page'
import { SettingsPage } from '@/pages/settings-page'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: '/characters',
        element: <CharactersPage />,
      },
      {
        path: '/projects/:projectId',
        element: <ProjectWorkspacePage />,
      },
      {
        path: '/projects/:projectId/editor/:chapterId',
        element: <ProjectEditorPage />,
      },
      {
        path: '/projects/:projectId/world',
        element: <ProjectWorldPage />,
      },
      {
        path: '/ai-toolbox',
        element: <AIToolboxPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
])

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" theme="dark" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
