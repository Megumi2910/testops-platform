import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { PlatformPermissionRoute, ProtectedRoute, VerifiedRoute } from '../features/projects/RouteGuards'
import { LazyPage } from './LazyPage'

const HomePage = lazy(async () => ({ default: (await import('./pages')).HomePage }))
const NotFoundPage = lazy(async () => ({ default: (await import('./pages')).NotFoundPage }))
const LoginPage = lazy(async () => ({ default: (await import('../features/auth/AuthPages')).LoginPage }))
const OAuthCallbackPage = lazy(async () => ({ default: (await import('../features/auth/AuthPages')).OAuthCallbackPage }))
const RegisterPage = lazy(async () => ({ default: (await import('../features/auth/AuthPages')).RegisterPage }))
const VerifyEmailPage = lazy(async () => ({ default: (await import('../features/auth/AuthPages')).VerifyEmailPage }))
const ProjectsPage = lazy(async () => ({ default: (await import('../features/projects/ProjectPages')).ProjectsPage }))
const NewProjectPage = lazy(async () => ({ default: (await import('../features/projects/ProjectPages')).NewProjectPage }))
const ProjectLayout = lazy(async () => ({ default: (await import('../features/projects/ProjectWorkspace')).ProjectLayout }))
const ProjectOverviewPage = lazy(async () => ({ default: (await import('../features/projects/ProjectWorkspace')).ProjectOverviewPage }))
const SuitesPage = lazy(async () => ({ default: (await import('../features/projects/SuitePages')).SuitesPage }))
const SuitePage = lazy(async () => ({ default: (await import('../features/projects/SuitePages')).SuitePage }))
const GuidedNewCasePage = lazy(async () => ({ default: (await import('../features/projects/GuidedCasePage')).GuidedNewCasePage }))
const CasePage = lazy(async () => ({ default: (await import('../features/projects/CasePage')).CasePage }))
const VariablesPage = lazy(async () => ({ default: (await import('../features/projects/ProjectResourcePages')).VariablesPage }))
const MembersPage = lazy(async () => ({ default: (await import('../features/projects/ProjectResourcePages')).MembersPage }))
const ExecutionsPage = lazy(async () => ({ default: (await import('../features/executions/ExecutionPages')).ExecutionsPage }))
const ExecutionDetailPage = lazy(async () => ({ default: (await import('../features/executions/ExecutionPages')).ExecutionDetailPage }))
const AccountPage = lazy(async () => ({ default: (await import('../features/auth/AccountPages')).AccountPage }))
const AdminUsersPage = lazy(async () => ({ default: (await import('../features/auth/AccountPages')).AdminUsersPage }))
const DashboardPage = lazy(async () => ({ default: (await import('../features/dashboard/DashboardPage')).DashboardPage }))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <LazyPage><HomePage /></LazyPage> },
      { path: 'login', element: <LazyPage><LoginPage /></LazyPage> },
      { path: 'register', element: <LazyPage><RegisterPage /></LazyPage> },
      { path: 'verify-email', element: <LazyPage><VerifyEmailPage /></LazyPage> },
      { path: 'auth/oauth/callback', element: <LazyPage><OAuthCallbackPage /></LazyPage> },
      { element: <ProtectedRoute />, children: [
        { path: 'account', element: <AccountPage /> },
        { element: <VerifiedRoute />, children: [
        { path: 'dashboard', element: <LazyPage><DashboardPage /></LazyPage> },
        { element: <PlatformPermissionRoute permission="USER_ADMINISTER" />, children: [
          { path: 'admin/users', element: <LazyPage><AdminUsersPage /></LazyPage> },
        ] },
        { path: 'projects', element: <LazyPage><ProjectsPage /></LazyPage> },
        { path: 'projects/new', element: <LazyPage><NewProjectPage /></LazyPage> },
        { path: 'projects/:projectId', element: <LazyPage><ProjectLayout /></LazyPage>, children: [
          { index: true, element: <LazyPage><ProjectOverviewPage /></LazyPage> },
          { path: 'suites', element: <LazyPage><SuitesPage /></LazyPage> },
          { path: 'suites/:suiteId', element: <LazyPage><SuitePage /></LazyPage> },
          { path: 'suites/:suiteId/cases/new', element: <LazyPage><GuidedNewCasePage /></LazyPage> },
          { path: 'suites/:suiteId/cases/:caseId', element: <LazyPage><CasePage /></LazyPage> },
          { path: 'variables', element: <LazyPage><VariablesPage /></LazyPage> },
          { path: 'members', element: <LazyPage><MembersPage /></LazyPage> },
          { path: 'executions', element: <LazyPage><ExecutionsPage /></LazyPage> },
          { path: 'executions/:executionId', element: <LazyPage><ExecutionDetailPage /></LazyPage> },
        ] },
        ] },
      ] },
      { path: '*', element: <LazyPage><NotFoundPage /></LazyPage> },
    ],
  },
])
