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
    getObservedGameID(pathname) !== null
  )
}

export function isBoardPreviewPath(pathname: string): boolean {
  return pathname === '/preview'
}

export function isLandingPath(pathname: string): boolean {
  return pathname === '/'
}

export function getObservedGameID(pathname: string): number | null {
  const match = pathname.match(/^\/games\/(\d+)\/observe$/)

  if (match === null) {
    return null
  }

  const gameID = Number(match[1])

  return Number.isSafeInteger(gameID) && gameID > 0 ? gameID : null
}

export function isAuthenticationPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/register'
}
