import { createContext, useContext, useEffect, useState } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const token = localStorage.getItem('donz_token')
    if (!token) return setLoading(false)
    api.get('/auth/me').then(({ data }) => setUser(data.data.user)).catch(() => localStorage.removeItem('donz_token')).finally(() => setLoading(false))
  }, [])
  async function login(credentials) {
    const { data } = await api.post('/auth/login', credentials)
    localStorage.setItem('donz_token', data.data.token)
    setUser(data.data.user)
  }
  async function logout() {
    try { await api.post('/auth/logout') } finally { localStorage.removeItem('donz_token'); setUser(null) }
  }
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
