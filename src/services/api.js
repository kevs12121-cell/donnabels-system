import axios from 'axios'

export const TOKEN_KEY = 'donz_token'

// In production the API is served from the same origin under /api.
// During development Vite proxies /api to the Express server (see vite.config.js).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith('/auth/login')
    if (error.response?.status === 401 && !isAuthCall && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('donz:session-expired'))
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.message) return error.response.data.message
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.'
  if (error?.request && !error.response) return 'Cannot reach the server. Check your connection and try again.'
  return fallback
}

export default api
