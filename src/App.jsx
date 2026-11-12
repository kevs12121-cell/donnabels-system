import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import DirectoryPage from './pages/DirectoryPage'
import Inventory from './pages/Inventory'
import Purchases from './pages/Purchases'
import Sales from './pages/Sales'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import { Employees, Users } from './pages/Administration'
import { ActivityLogs, Settings } from './pages/AdminSupport'
import './index.css'
import './operations.css'
import './part3.css'
import './theme.css'

export default function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/login" element={<Login />} /><Route element={<ProtectedRoute />}><Route element={<AppLayout />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/sales" element={<Sales />} /><Route path="/products" element={<Products />} /><Route path="/inventory" element={<Inventory />} /><Route path="/purchases" element={<Purchases />} /><Route path="/suppliers" element={<DirectoryPage resource="suppliers" />} /><Route path="/categories" element={<DirectoryPage resource="categories" />} /><Route path="/expenses" element={<Expenses />} /><Route path="/reports" element={<Reports />} /><Route path="/employees" element={<Employees />} /><Route path="/users" element={<Users />} /><Route path="/settings" element={<Settings />} /><Route path="/activity-logs" element={<ActivityLogs />} /></Route></Route><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></AuthProvider></BrowserRouter>
}
