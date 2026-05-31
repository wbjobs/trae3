import React from 'react'
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/store'
import { MainLayout, AuthLayout } from '@/layouts'

const Login = React.lazy(() => import('@/pages/auth/Login'))
const Register = React.lazy(() => import('@/pages/auth/Register'))

const SpecimenList = React.lazy(() => import('@/pages/specimen/List'))
const SpecimenDetail = React.lazy(() => import('@/pages/specimen/Detail'))
const SpecimenEdit = React.lazy(() => import('@/pages/specimen/Edit'))

const AnnotationPage = React.lazy(() => import('@/pages/annotation/Index'))

const TraceabilityList = React.lazy(() => import('@/pages/traceability/List'))
const TraceabilityChain = React.lazy(() => import('@/pages/traceability/Chain'))

const TeamMembers = React.lazy(() => import('@/pages/team/Members'))
const TeamRoles = React.lazy(() => import('@/pages/team/Roles'))

const AuthGuard: React.FC = () => {
  const { token } = useAppSelector((state) => state.user)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

const GuestGuard: React.FC = () => {
  const { token } = useAppSelector((state) => state.user)

  if (token) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

const router = createBrowserRouter([
  {
    element: <GuestGuard />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: '/login',
            element: <Login />
          },
          {
            path: '/register',
            element: <Register />
          }
        ]
      }
    ]
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: '/',
            element: <Navigate to="/specimen/list" replace />
          },
          {
            path: '/specimen',
            children: [
              {
                path: 'list',
                element: <SpecimenList />
              },
              {
                path: 'create',
                element: <SpecimenEdit />
              },
              {
                path: 'edit/:id',
                element: <SpecimenEdit />
              },
              {
                path: 'detail/:id',
                element: <SpecimenDetail />
              }
            ]
          },
          {
            path: '/annotation',
            element: <AnnotationPage />
          },
          {
            path: '/traceability',
            children: [
              {
                path: 'list',
                element: <TraceabilityList />
              },
              {
                path: 'chain',
                element: <TraceabilityChain />
              }
            ]
          },
          {
            path: '/team',
            children: [
              {
                path: 'members',
                element: <TeamMembers />
              },
              {
                path: 'roles',
                element: <TeamRoles />
              }
            ]
          }
        ]
      }
    ]
  }
])

const AppRouter: React.FC = () => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <RouterProvider router={router} />
    </React.Suspense>
  )
}

export default AppRouter
