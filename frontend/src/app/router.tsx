import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { HomePage, NotFoundPage } from './pages'
import { LoginPage, OAuthCallbackPage, RegisterPage, VerifyEmailPage } from '../features/auth/AuthPages'
import { CasePage, MembersPage, NewCasePage, NewProjectPage, ProjectLayout, ProjectOverviewPage, ProjectsPage, ProtectedRoute, SuitePage, SuitesPage, VariablesPage } from '../features/projects/ProjectPages'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'auth/oauth/callback', element: <OAuthCallbackPage /> },
      { element: <ProtectedRoute />, children: [
        { path: 'projects', element: <ProjectsPage /> },
        { path: 'projects/new', element: <NewProjectPage /> },
        { path: 'projects/:projectId', element: <ProjectLayout />, children: [
          { index: true, element: <ProjectOverviewPage /> },
          { path: 'suites', element: <ProjectOverviewPage />, children: [{ index: true, element: <SuitesPage /> }] },
          { path: 'suites/:suiteId', element: <SuitePage /> },
          { path: 'suites/:suiteId/cases/new', element: <NewCasePage /> },
          { path: 'suites/:suiteId/cases/:caseId', element: <CasePage /> },
          { path: 'variables', element: <ProjectOverviewPage />, children: [{ index: true, element: <VariablesPage /> }] },
          { path: 'members', element: <ProjectOverviewPage />, children: [{ index: true, element: <MembersPage /> }] },
        ] },
      ] },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
