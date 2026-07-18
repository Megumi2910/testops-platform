import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { HomePage, NotFoundPage } from './pages'
import { LoginPage, OAuthCallbackPage, RegisterPage, VerifyEmailPage } from '../features/auth/AuthPages'

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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
