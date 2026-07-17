import { createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/AppShell'
import { HomePage, NotFoundPage } from './pages'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
