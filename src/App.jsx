import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute, { OwnerRoute } from './routes/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import { Loader } from './components/ui'
import './styles.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sales = lazy(() => import('./pages/Sales'))
const Products = lazy(() => import('./pages/Products'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Purchases = lazy(() => import('./pages/Purchases'))
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Reports = lazy(() => import('./pages/Reports'))
const Employees = lazy(() => import('./pages/Administration').then((module) => ({ default: module.Employees })))
const Users = lazy(() => import('./pages/Administration').then((module) => ({ default: module.Users })))
const ActivityLogs = lazy(() => import('./pages/AdminSupport').then((module) => ({ default: module.ActivityLogs })))
const Settings = lazy(() => import('./pages/AdminSupport').then((module) => ({ default: module.Settings })))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loader label="Loading page…" />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/products" element={<Products />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/purchases" element={<Purchases />} />
                <Route path="/suppliers" element={<DirectoryPage key="suppliers" resource="suppliers" />} />
                <Route path="/categories" element={<DirectoryPage key="categories" resource="categories" />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/settings" element={<Settings />} />
                <Route element={<OwnerRoute />}>
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/activity-logs" element={<ActivityLogs />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
