import { Toaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { queryClient } from '@/lib/query-client'
import { AIToolboxPage } from '@/pages/ai-toolbox-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { ProjectEditorPage } from '@/pages/project-editor-page'
import { ProjectWorkspacePage } from '@/pages/project-workspace-page'

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
        path: '/projects/:projectId',
        element: <ProjectWorkspacePage />,
      },
      {
        path: '/projects/:projectId/editor/:chapterId',
        element: <ProjectEditorPage />,
      },
      {
        path: '/ai-toolbox',
        element: <AIToolboxPage />,
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
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" theme="dark" />
    </QueryClientProvider>
  )
}

export default App
