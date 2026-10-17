import { getObservedGameID } from './navigation'

export type PageMetadata = {
  title: string
  description: string
}

const DEFAULT_PAGE_METADATA: PageMetadata = {
  title: 'Catan · Games and replay',
  description: 'Create seeded Catan games, follow their progress, and review saved history.',
}

const PAGE_METADATA: Record<string, PageMetadata> = {
  '/': {
    title: 'Catan · Welcome',
    description: 'Explore a seeded Catan board, create games, and follow their saved history.',
  },
  '/login': {
    title: 'Catan · Sign in',
    description: 'Sign in to create games, follow their progress, and review saved history.',
  },
  '/register': {
    title: 'Catan · Create account',
    description: 'Create an account to save Catan games and follow their history.',
  },
  '/preview': {
    title: 'Catan · Board preview',
    description: 'Explore a reproducible Catan board generated from a seed.',
  },
  '/games': {
    title: 'Catan · My games',
    description: 'View and manage your saved Catan games and replay history.',
  },
  '/games/new': {
    title: 'Catan · New game',
    description: 'Create a private seeded Catan game to follow and replay.',
  },
}

export function getPageMetadata(pathname: string): PageMetadata {
  const observedGameID = getObservedGameID(pathname)

  if (observedGameID !== null) {
    return {
      title: `Catan · Game ${observedGameID}`,
      description: `Observe the saved board and history for Catan game ${observedGameID}.`,
    }
  }

  return PAGE_METADATA[pathname] ?? DEFAULT_PAGE_METADATA
}
