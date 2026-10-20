import { isBoardData, type BoardData } from '../board/boardApi'
import standardBoardData from './dev-fixtures/standard-board.json' with { type: 'json' }
import type {
  ReplayEvent,
  ReplayRequestOptions,
  ReplayResponse,
  ReplaySnapshotIndexEntry,
} from './replayApi'

const PAGE_SIZE = 4
const RESPONSE_DELAY_MS = 180
const MOCK_CREATED_AT = '2026-10-15T09:00:00.000000Z'

const MOCK_BOARD = readMockBoard()

const MOCK_EVENTS: ReplayEvent[] = [
  replayEvent('1', 'game_initialized.v1'),
  replayEvent('2', 'turn_started.v1'),
  replayEvent('3', 'dice_rolled.v1'),
  replayEvent('4', 'resources_produced.v1'),
  replayEvent('5', 'construction.v1'),
  replayEvent('6', 'turn_ended.v1'),
  replayEvent('7', 'turn_started.v1'),
  replayEvent('8', 'dice_rolled.v1'),
  replayEvent('9', 'construction.v1'),
  replayEvent('10', 'turn_ended.v1'),
  replayEvent('11', 'turn_started.v1'),
  replayEvent('12', 'dice_rolled.v1'),
]

const MOCK_SNAPSHOTS: ReplaySnapshotIndexEntry[] = [
  replaySnapshot('4', '4'),
  replaySnapshot('8', '8'),
  replaySnapshot('12', '12'),
]

type ReplayMockOptions = Pick<
  ReplayRequestOptions,
  'atCommandSequence' | 'afterEventSequence'
> & {
  signal?: AbortSignal
}

export async function getMultiEventReplay(
  gameID: number,
  options: ReplayMockOptions,
): Promise<ReplayResponse> {
  await waitForMockResponse(options.signal)

  const selectedSnapshot = selectSnapshot(options.atCommandSequence)
  const visibleEvents = MOCK_EVENTS.filter((event) =>
    compareDecimalStrings(event.sequence, selectedSnapshot.event_sequence) <= 0)
  const pageStart = pageStartIndex(visibleEvents, options.afterEventSequence)
  const events = visibleEvents.slice(pageStart, pageStart + PAGE_SIZE)
  const returnedThroughSequence = events.at(-1)?.sequence ?? null
  const hasMore = pageStart + PAGE_SIZE < visibleEvents.length

  return {
    schema_version: 'replay-v1',
    context: {
      game: {
        id: gameID,
        mode: 'human_vs_ai',
        lifecycle_status: 'completed',
        ruleset_key: 'base',
        ruleset_version: '1.0.0',
        state_schema_version: 'state-v1',
        seed: MOCK_BOARD.seed,
        seat_count: 3,
        human_seat_number: 1,
        started_at: MOCK_CREATED_AT,
        completed_at: '2026-10-15T09:03:00.000000Z',
        created_at: MOCK_CREATED_AT,
      },
      board: MOCK_BOARD,
      seats: [
        { seat_number: 1, controller_type: 'human', label: 'Ada Player' },
        { seat_number: 2, controller_type: 'ai', label: 'AI 2' },
        { seat_number: 3, controller_type: 'ai', label: 'AI 3' },
      ],
    },
    events,
    event_cursor: {
      requested_after_sequence: options.afterEventSequence ?? '0',
      returned_through_sequence: returnedThroughSequence,
      has_more: hasMore,
      next_after_sequence: hasMore ? returnedThroughSequence : null,
    },
    snapshot_index: MOCK_SNAPSHOTS,
    frame: {
      command_sequence: selectedSnapshot.command_sequence,
      event_sequence: selectedSnapshot.event_sequence,
      state_schema_version: selectedSnapshot.state_schema_version,
      public_projection_schema_version: 'replay-public-v1',
      public_state: publicStateFor(selectedSnapshot.command_sequence),
      viewer_state: null,
    },
  }
}

function readMockBoard(): BoardData {
  if (!isBoardData(standardBoardData)) {
    throw new Error('The replay mock board fixture must match the board API contract.')
  }

  return standardBoardData
}

function replayEvent(sequence: string, eventType: string): ReplayEvent {
  return {
    sequence,
    event_type: eventType,
    payload: {},
    occurred_at: MOCK_CREATED_AT,
  }
}

function replaySnapshot(
  commandSequence: string,
  eventSequence: string,
): ReplaySnapshotIndexEntry {
  return {
    command_sequence: commandSequence,
    event_sequence: eventSequence,
    state_schema_version: 'state-v1',
    created_at: MOCK_CREATED_AT,
  }
}

function selectSnapshot(commandSequence: string | undefined): ReplaySnapshotIndexEntry {
  if (commandSequence === undefined) {
    return MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 1]!
  }

  return MOCK_SNAPSHOTS.reduce((selected, snapshot) => {
    if (compareDecimalStrings(snapshot.command_sequence, commandSequence) > 0) {
      return selected
    }

    return compareDecimalStrings(snapshot.command_sequence, selected.command_sequence) > 0
      ? snapshot
      : selected
  }, MOCK_SNAPSHOTS[0]!)
}

function pageStartIndex(
  events: ReplayEvent[],
  afterEventSequence: string | undefined,
): number {
  if (afterEventSequence === undefined) {
    return 0
  }

  const nextIndex = events.findIndex((event) =>
    compareDecimalStrings(event.sequence, afterEventSequence) > 0)

  return nextIndex === -1 ? events.length : nextIndex
}

function publicStateFor(commandSequence: string): Record<string, unknown> {
  const stateByCommand: Record<string, Record<string, unknown>> = {
    '4': {
      phase: 'playing',
      turn_phase: 'awaiting_roll',
      public_awards: {},
      public_scores: { '1': 1, '2': 0, '3': 0 },
      active_seat_number: 1,
    },
    '8': {
      phase: 'playing',
      turn_phase: 'awaiting_build',
      public_awards: { longest_road: 2 },
      public_scores: { '1': 2, '2': 1, '3': 0 },
      active_seat_number: 2,
    },
    '12': {
      phase: 'finished',
      turn_phase: null,
      public_awards: { longest_road: 2, largest_army: 3 },
      public_scores: { '1': 4, '2': 3, '3': 2 },
      active_seat_number: null,
    },
  }

  return stateByCommand[commandSequence] ?? stateByCommand['12']!
}

async function waitForMockResponse(signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, RESPONSE_DELAY_MS)
  })

  if (signal?.aborted) {
    throw new DOMException('The replay request was aborted.', 'AbortError')
  }
}

function compareDecimalStrings(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length
  }

  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}
