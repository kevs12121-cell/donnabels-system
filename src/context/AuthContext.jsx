import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    api.get('/auth/me')
      .then(({ data }) => setUser(data.data.user))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onExpired = () => { setUser(null); setSessionExpired(true) }
    window.addEventListener('donz:session-expired', onExpired)
    return () => window.removeEventListener('donz:session-expired', onExpired)
  }, [])

  const login = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials)
    localStorage.setItem(TOKEN_KEY, data.data.token)
    setSessionExpired(false)
    setUser(data.data.user)
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* signing out locally is enough */ }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, sessionExpired, isOwner: user?.role === 'OWNER' }), [user, loading, login, logout, sessionExpired])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
