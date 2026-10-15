import { useEffect, useState } from 'react'

export function useBrowserPathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return pathname
}

export function navigateTo(pathname: string): void {
  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function isPrivatePath(pathname: string): boolean {
  return (
    pathname === '/games' ||
    pathname === '/games/new' ||
    /^\/games\/[^/]+\/observe$/.test(pathname)
  )
}

export function isAuthenticationPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register'
}
