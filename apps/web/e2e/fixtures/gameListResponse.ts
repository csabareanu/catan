type GameListView = 'all' | 'saved_setups' | 'in_progress' | 'history'

type GameListCounts = {
  all: number
  saved_setups: number
  in_progress: number
  history: number
}

export function gameListResponse<T>(
  data: T[],
  {
    currentPage = 1,
    total = data.length,
    view = 'all',
    counts,
  }: {
    currentPage?: number
    total?: number
    view?: GameListView
    counts?: Partial<GameListCounts>
  } = {},
) {
  const perPage = 20
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const pageURL = (page: number) => `http://127.0.0.1:8000/api/v1/games?page=${page}`
  const inferredCounts = inferCounts(data, total)

  return {
    data,
    links: {
      first: pageURL(1),
      last: pageURL(lastPage),
      prev: currentPage > 1 ? pageURL(currentPage - 1) : null,
      next: currentPage < lastPage ? pageURL(currentPage + 1) : null,
    },
    meta: {
      current_page: currentPage,
      last_page: lastPage,
      per_page: perPage,
      total,
      view,
      counts: { ...inferredCounts, ...counts },
    },
  }
}

function inferCounts<T>(data: T[], total: number): GameListCounts {
  const counts: GameListCounts = {
    all: total,
    saved_setups: 0,
    in_progress: 0,
    history: 0,
  }
  const statuses = data
    .map((item) => (item as { lifecycle_status?: unknown }).lifecycle_status)
    .filter((status): status is string => typeof status === 'string')
  const categories = new Set(statuses.map(statusCategory))

  if (categories.size === 1 && data.length > 0 && data.length !== total) {
    const category = [...categories][0]
    counts[category] = total
    return counts
  }

  for (const category of categories) {
    counts[category] = statuses.filter((status) => statusCategory(status) === category).length
  }

  return counts
}

function statusCategory(status: string): Exclude<keyof GameListCounts, 'all'> {
  if (status === 'created') {
    return 'saved_setups'
  }

  if (status === 'completed') {
    return 'history'
  }

  return 'in_progress'
}
