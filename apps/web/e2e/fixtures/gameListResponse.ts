export function gameListResponse<T>(
  data: T[],
  { currentPage = 1, total = data.length }: { currentPage?: number; total?: number } = {},
) {
  const perPage = 20
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const pageURL = (page: number) => `http://127.0.0.1:8000/api/v1/games?page=${page}`

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
    },
  }
}
