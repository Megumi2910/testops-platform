import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { PlatformPermissionRoute, ProtectedRoute, VerifiedRoute } from '../features/projects/RouteGuards'
import { LazyPage } from './LazyPage'
import { lazyWithRecovery } from './lazyWithRecovery'
import { RouteErrorPage } from './RouteErrorPage'

const HomePage = lazyWithRecovery(async () => ({ default: (await import('./pages')).HomePage }))
const NotFoundPage = lazyWithRecovery(async () => ({ default: (await import('./pages')).NotFoundPage }))
const LoginPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AuthPages')).LoginPage }))
const OAuthCallbackPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AuthPages')).OAuthCallbackPage }))
const RegisterPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AuthPages')).RegisterPage }))
const VerifyEmailPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AuthPages')).VerifyEmailPage }))
const PasswordResetPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AuthPages')).PasswordResetPage }))
const ProjectsPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectPages')).ProjectsPage }))
const NewProjectPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectPages')).NewProjectPage }))
const EditProjectPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectPages')).EditProjectPage }))
const ProjectLayout = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectWorkspace')).ProjectLayout }))
const ProjectOverviewPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectWorkspace')).ProjectOverviewPage }))
const SuitesPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/SuitePages')).SuitesPage }))
const SuitePage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/SuitePages')).SuitePage }))
const GuidedNewCasePage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/GuidedCasePage')).GuidedNewCasePage }))
const CasePage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/CasePage')).CasePage }))
const DefinitionTrashPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/DefinitionTrashPage')).DefinitionTrashPage }))
const VariablesPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectResourcePages')).VariablesPage }))
const MembersPage = lazyWithRecovery(async () => ({ default: (await import('../features/projects/ProjectResourcePages')).MembersPage }))
const ExecutionsPage = lazyWithRecovery(async () => ({ default: (await import('../features/executions/ExecutionPages')).ExecutionsPage }))
const ExecutionDetailPage = lazyWithRecovery(async () => ({ default: (await import('../features/executions/ExecutionPages')).ExecutionDetailPage }))
const AccountPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AccountPages')).AccountPage }))
const AdminUsersPage = lazyWithRecovery(async () => ({ default: (await import('../features/auth/AccountPages')).AdminUsersPage }))
const DashboardPage = lazyWithRecovery(async () => ({ default: (await import('../features/dashboard/DashboardPage')).DashboardPage }))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LazyPage><HomePage /></LazyPage> },
      { path: 'login', element: <LazyPage><LoginPage /></LazyPage> },
      { path: 'register', element: <LazyPage><RegisterPage /></LazyPage> },
      { path: 'verify-email', element: <LazyPage><VerifyEmailPage /></LazyPage> },
      { path: 'password-reset', element: <LazyPage><PasswordResetPage /></LazyPage> },
      { path: 'auth/oauth/callback', element: <LazyPage><OAuthCallbackPage /></LazyPage> },
      { element: <ProtectedRoute />, children: [
        { path: 'account', element: <LazyPage><AccountPage /></LazyPage> },
        { element: <VerifiedRoute />, children: [
        { path: 'dashboard', element: <LazyPage><DashboardPage /></LazyPage> },
        { element: <PlatformPermissionRoute permission="USER_ADMINISTER" />, children: [
          { path: 'admin/users', element: <LazyPage><AdminUsersPage /></LazyPage> },
        ] },
        { path: 'projects', element: <LazyPage><ProjectsPage /></LazyPage> },
        { path: 'projects/new', element: <LazyPage><NewProjectPage /></LazyPage> },
        { path: 'projects/:projectId', element: <LazyPage><ProjectLayout /></LazyPage>, children: [
          { index: true, element: <LazyPage><ProjectOverviewPage /></LazyPage> },
          { path: 'edit', element: <LazyPage><EditProjectPage /></LazyPage> },
          { path: 'suites', element: <LazyPage><SuitesPage /></LazyPage> },
          { path: 'suites/:suiteId', element: <LazyPage><SuitePage /></LazyPage> },
          { path: 'suites/:suiteId/cases/new', element: <LazyPage><GuidedNewCasePage /></LazyPage> },
          { path: 'suites/:suiteId/cases/:caseId', element: <LazyPage><CasePage /></LazyPage> },
          { path: 'trash', element: <LazyPage><DefinitionTrashPage /></LazyPage> },
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
