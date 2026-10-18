import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import {
  listGames,
  type GameLifecycleStatus,
  type GameLibraryView,
  type GameListCounts,
  type GameListMeta,
  type GameSummary,
} from './gameApi'

type LibraryLoadState = 'loading' | 'success' | 'error'
type LibraryCategory = Exclude<GameLibraryView, 'all'>

type UseGameLibraryOptions = {
  token: string
  onUnauthorized: () => void
  isLoadingDisabled: boolean
}

type UseGameLibraryResult = {
  games: GameSummary[]
  loadState: LibraryLoadState
  errorMessage: string | null
  activeView: GameLibraryView
  counts: GameListCounts | null
  totalGames: number
  hasMore: boolean
  isLoadingMore: boolean
  loadMoreError: string | null
  retry: () => void
  selectView: (view: GameLibraryView) => void
  loadMore: () => Promise<void>
  updateLifecycleStatus: (gameId: number, status: GameLifecycleStatus) => void
  removeGameFromLibrary: (game: GameSummary) => void
}

export function useGameLibrary({
  token,
  onUnauthorized,
  isLoadingDisabled,
}: UseGameLibraryOptions): UseGameLibraryResult {
  const [games, setGames] = useState<GameSummary[]>([])
  const [loadState, setLoadState] = useState<LibraryLoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeView, setActiveView] = useState<GameLibraryView>('all')
  const [counts, setCounts] = useState<GameListCounts | null>(null)
  const [pagination, setPagination] = useState<GameListMeta | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [pagesNeedRefresh, setPagesNeedRefresh] = useState(false)
  const moreRequest = useRef<AbortController | null>(null)
  const gamesRef = useRef<GameSummary[]>([])
  const totalGames = pagination?.total ?? 0
  const hasMore = pagination !== null && games.length < totalGames && (
    pagination.current_page < pagination.last_page || pagesNeedRefresh
  )

  useEffect(() => {
    gamesRef.current = games
  }, [games])

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()

    listGames(token, onUnauthorized, activeView, 1, controller.signal)
      .then((response) => {
        if (!isActive) {
          return
        }

        setGames(response.data)
        setPagination(response.meta)
        setCounts(response.meta.counts)
        setPagesNeedRefresh(false)
        setLoadMoreError(null)
        setIsLoadingMore(false)
        setLoadState('success')
        setErrorMessage(null)
      })
      .catch((caught: unknown) => {
        if (!isActive || controller.signal.aborted) {
          return
        }

        setLoadState('error')
        setErrorMessage(toLibraryErrorMessage(caught))
      })

    return () => {
      isActive = false
      controller.abort()
      moreRequest.current?.abort()
    }
  }, [activeView, onUnauthorized, reloadKey, token])

  const retry = useCallback(() => {
    setErrorMessage(null)
    setLoadState('loading')
    setReloadKey((currentKey) => currentKey + 1)
  }, [])

  const selectView = useCallback((view: GameLibraryView) => {
    if (view === activeView) {
      return
    }

    moreRequest.current?.abort()
    setActiveView(view)
    setGames([])
    setPagination(null)
    setLoadState('loading')
    setErrorMessage(null)
    setLoadMoreError(null)
    setPagesNeedRefresh(false)
    setIsLoadingMore(false)
  }, [activeView])

  const loadMore = useCallback(async () => {
    if (
      !hasMore || pagination === null || moreRequest.current !== null || isLoadingDisabled
    ) {
      return
    }

    const controller = new AbortController()
    moreRequest.current = controller
    setIsLoadingMore(true)
    setLoadMoreError(null)

    try {
      const targetPage = pagination.current_page + 1
      const refreshPages = pagesNeedRefresh
      let response = await listGames(
        token,
        onUnauthorized,
        activeView,
        refreshPages ? 1 : targetPage,
        controller.signal,
      )
      const incomingGames = [...response.data]

      // Deletion shifts offset pages, so rebuild the loaded range before extending it.
      while (refreshPages && response.meta.current_page < Math.min(targetPage, response.meta.last_page)) {
        response = await listGames(
          token,
          onUnauthorized,
          activeView,
          response.meta.current_page + 1,
          controller.signal,
        )
        incomingGames.push(...response.data)
      }

      if (controller.signal.aborted) {
        return
      }

      setGames((currentGames) => {
        const gamesById = new Map((refreshPages ? [] : currentGames).map((game) => [game.id, game]))
        for (const game of incomingGames) {
          if (!gamesById.has(game.id)) {
            gamesById.set(game.id, game)
          }
        }
        return [...gamesById.values()]
      })
      setPagination(response.meta)
      setPagesNeedRefresh(false)
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setLoadMoreError(toLibraryErrorMessage(caught))
      }
    } finally {
      if (moreRequest.current === controller) {
        moreRequest.current = null
      }
      if (!controller.signal.aborted) {
        setIsLoadingMore(false)
      }
    }
  }, [
    activeView,
    hasMore,
    isLoadingDisabled,
    onUnauthorized,
    pagination,
    pagesNeedRefresh,
    token,
  ])

  const updateLifecycleStatus = useCallback((gameId: number, status: GameLifecycleStatus) => {
    const currentGame = gamesRef.current.find((game) => game.id === gameId)

    if (currentGame === undefined) {
      return
    }

    const previousStatus = currentGame.lifecycle_status

    setGames((currentGames) => viewIncludesStatus(activeView, status)
      ? currentGames.map((game) =>
        game.id === gameId ? { ...game, lifecycle_status: status } : game,
      )
      : currentGames.filter((game) => game.id !== gameId))

    if (previousStatus === null || previousStatus === status) {
      return
    }

    const previousCategory = lifecycleCategory(previousStatus)
    const nextCategory = lifecycleCategory(status)

    if (previousCategory !== nextCategory) {
      setCounts((currentCounts) => currentCounts === null
        ? null
        : shiftLibraryCounts(currentCounts, previousCategory, nextCategory))
    }

    if (!viewIncludesStatus(activeView, status)) {
      setPagination((currentPagination) => currentPagination === null
        ? null
        : {
          ...currentPagination,
          total: Math.max(0, currentPagination.total - 1),
        })
    }
  }, [activeView])

  const removeGameFromLibrary = useCallback((game: GameSummary) => {
    setPagesNeedRefresh(true)
    setGames((currentGames) => currentGames.filter(({ id }) => id !== game.id))
    setCounts((currentCounts) => currentCounts === null
      ? null
      : decrementLibraryCount(currentCounts, lifecycleCategory(game.lifecycle_status)))
    setPagination((current) => current === null
      ? null
      : { ...current, total: Math.max(0, current.total - 1) },
    )
  }, [])

  return {
    games,
    loadState,
    errorMessage,
    activeView,
    counts,
    totalGames,
    hasMore,
    isLoadingMore,
    loadMoreError,
    retry,
    selectView,
    loadMore,
    updateLifecycleStatus,
    removeGameFromLibrary,
  }
}

function toLibraryErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The game library could not be loaded. Please try again.'
  }

  if (caught.status === 404) {
    return 'The game library could not be found. Please try again.'
  }

  if (caught.status === 422) {
    return caught.message
  }

  if (caught.status === 503) {
    return 'The game service is unavailable right now. Please try again.'
  }

  if (caught.status === 0) {
    return 'The game library could not be reached. Check the connection and try again.'
  }

  return caught.message
}

function lifecycleCategory(status: GameLifecycleStatus): LibraryCategory {
  if (status === 'created') {
    return 'saved_setups'
  }

  if (status === 'completed') {
    return 'history'
  }

  return 'in_progress'
}

function viewIncludesStatus(view: GameLibraryView, status: GameLifecycleStatus): boolean {
  return view === 'all' || lifecycleCategory(status) === view
}

function decrementLibraryCount(counts: GameListCounts, category: LibraryCategory): GameListCounts {
  return {
    ...counts,
    all: Math.max(0, counts.all - 1),
    [category]: Math.max(0, counts[category] - 1),
  }
}

function shiftLibraryCounts(
  counts: GameListCounts,
  from: LibraryCategory,
  to: LibraryCategory,
): GameListCounts {
  return {
    ...counts,
    [from]: Math.max(0, counts[from] - 1),
    [to]: counts[to] + 1,
  }
}
