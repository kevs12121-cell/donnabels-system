import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../services/api'

/**
 * Loads data with `loader` whenever `deps` change. Ignores stale responses so fast
 * typing in a search box never shows results for an older query.
 */
export function useLoader(loader, deps = [], initial = null) {
  const [state, setState] = useState({ data: initial, loading: true, error: '' })
  const loaderRef = useRef(loader)
  const requestRef = useRef(0)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    const request = ++requestRef.current
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const data = await loaderRef.current()
      if (request === requestRef.current) setState({ data, loading: false, error: '' })
    } catch (error) {
      if (request === requestRef.current) setState((current) => ({ ...current, loading: false, error: errorMessage(error, 'Unable to load this information right now.') }))
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, deps)

  return { ...state, reload }
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
