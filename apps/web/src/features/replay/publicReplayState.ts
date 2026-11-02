import { isInteger, isRecord, isString } from '../../lib/apiClient'
import type { ResourceType } from '../board/boardApi'
import type { ReplayEvent, ReplayFrame } from './replayApi'

const RESOURCE_FIELDS: ResourceType[] = ['lumber', 'wool', 'grain', 'brick', 'ore']

export type PublicAward = {
  label: string
  seatNumber: number
}

export type SetupPlayerStructures = {
  seatNumber: number
  settlements: string[]
  roads: string[]
}

export type ViewerResources = Record<ResourceType, number>

export type SetupPlaybackEventKind =
  | 'started'
  | 'settlement'
  | 'road'
  | 'resources'
  | 'completed'

export type SetupPlaybackEvent = {
  sequence: string
  kind: SetupPlaybackEventKind
  seatNumber: number | null
  seatOrder: number[]
  settlementVertexID: string | null
  roadEdgeID: string | null
  resources: ViewerResources | null
}

export type SetupReplayState = {
  seatOrder: number[]
  round: number | null
  step: string | null
  players: SetupPlayerStructures[]
}

export type PublicReplayState = {
  phase: string | null
  turnPhase: string | null
  activeSeatNumber: number | null
  scores: ReadonlyMap<number, number>
  awards: PublicAward[]
  setup: SetupReplayState | null
  viewerResources: ViewerResources | null
}

export function readPublicReplayState(
  frame: ReplayFrame | null,
  humanSeatNumber: number | null,
): PublicReplayState {
  const state = frame?.public_state
  const hasSetupProjection = frame?.state_schema_version === 'state-v2' &&
    frame.public_projection_schema_version === 'replay-public-v2'
  const isInitialPlacement = hasSetupProjection && state?.phase === 'initial_placement'

  return {
    phase: readStateLabel(state?.phase),
    turnPhase: readStateLabel(state?.turn_phase),
    activeSeatNumber: readSeatNumber(state?.active_seat_number),
    scores: readPublicScores(state?.public_scores),
    awards: readPublicAwards(state?.public_awards),
    setup: hasSetupProjection
      ? {
          seatOrder: readSeatOrder(state?.seat_order),
          round: readPositiveInteger(state?.round),
          step: readStateLabel(state?.step),
          players: readSetupPlayers(state?.players),
        }
      : null,
    viewerResources: isInitialPlacement
      ? readViewerResources(frame, humanSeatNumber)
      : null,
  }
}

export function readSetupPlaybackEvents(events: ReplayEvent[]): SetupPlaybackEvent[] {
  return events.flatMap((event): SetupPlaybackEvent[] => {
    const eventData = {
      sequence: event.sequence,
      seatNumber: readSeatNumber(event.payload.seat_number),
      seatOrder: readSeatOrder(event.payload.seat_order),
      settlementVertexID: readNonEmptyString(event.payload.settlement_vertex_id),
      roadEdgeID: readNonEmptyString(event.payload.road_edge_id),
      resources: readResourceGrant(event.payload.resources),
    }

    switch (event.event_type) {
      case 'initial_placement_started.v1':
        return [{ ...eventData, kind: 'started' }]
      case 'initial_settlement_placed.v1':
        return [{ ...eventData, kind: 'settlement' }]
      case 'initial_road_placed.v1':
        return [{ ...eventData, kind: 'road' }]
      case 'initial_resources_granted.v1':
        return [{ ...eventData, kind: 'resources' }]
      case 'initial_placement_completed.v1':
        return [{ ...eventData, kind: 'completed' }]
      default:
        return []
    }
  }).sort((left, right) => compareSequence(left.sequence, right.sequence))
}

function readStateLabel(value: unknown): string | null {
  return isString(value) && value.trim() !== '' ? value : null
}

function readNonEmptyString(value: unknown): string | null {
  return isString(value) && value.trim() !== '' ? value.trim() : null
}

function readSeatNumber(value: unknown): number | null {
  return isInteger(value) && value > 0 ? value : null
}

function readPositiveInteger(value: unknown): number | null {
  return isInteger(value) && value > 0 ? value : null
}

function readResourceGrant(value: unknown): ViewerResources | null {
  if (!isRecord(value)) {
    return null
  }

  const resources = {} as ViewerResources

  for (const resource of RESOURCE_FIELDS) {
    const count = value[resource]

    if (!isInteger(count) || count < 0) {
      return null
    }

    resources[resource] = count
  }

  return resources
}

function readSeatOrder(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seatOrder: number[] = []

  for (const seatNumber of value) {
    const validSeatNumber = readSeatNumber(seatNumber)

    if (validSeatNumber === null || seatOrder.includes(validSeatNumber)) {
      return []
    }

    seatOrder.push(validSeatNumber)
  }

  return seatOrder
}

function readSetupPlayers(value: unknown): SetupPlayerStructures[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seenSeats = new Set<number>()

  return value.flatMap((player): SetupPlayerStructures[] => {
    if (!isRecord(player)) {
      return []
    }

    const seatNumber = readSeatNumber(player.seat_number)

    if (seatNumber === null || seenSeats.has(seatNumber)) {
      return []
    }

    seenSeats.add(seatNumber)

    return [{
      seatNumber,
      settlements: readStructureIDs(player.settlements),
      roads: readStructureIDs(player.roads),
    }]
  })
}

function readStructureIDs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.filter((structureID): structureID is string =>
    isString(structureID) && structureID.trim() !== '',
  ))]
}

function readViewerResources(
  frame: ReplayFrame,
  humanSeatNumber: number | null,
): ViewerResources | null {
  if (
    humanSeatNumber === null ||
    humanSeatNumber < 1 ||
    frame.viewer_projection_schema_version !== 'replay-viewer-v1' ||
    !isRecord(frame.viewer_state) ||
    frame.viewer_state.seat_number !== humanSeatNumber ||
    !isRecord(frame.viewer_state.resources)
  ) {
    return null
  }

  const resources = {} as ViewerResources

  for (const resource of RESOURCE_FIELDS) {
    const count = frame.viewer_state.resources[resource]

    if (!isInteger(count) || count < 0) {
      return null
    }

    resources[resource] = count
  }

  return resources
}

function readPublicScores(value: unknown): ReadonlyMap<number, number> {
  if (!isRecord(value)) {
    return new Map()
  }

  const scores = new Map<number, number>()

  for (const [seatKey, score] of Object.entries(value)) {
    const seatNumber = Number(seatKey)

    if (
      Number.isSafeInteger(seatNumber) &&
      seatNumber > 0 &&
      isInteger(score) &&
      score >= 0
    ) {
      scores.set(seatNumber, score)
    }
  }

  return scores
}

function readPublicAwards(value: unknown): PublicAward[] {
  if (!isRecord(value)) {
    return []
  }

  return Object.entries(value).flatMap(([awardKey, seat]) => {
    const seatNumber = readSeatNumber(seat)

    return seatNumber === null
      ? []
      : [{ label: formatStateLabel(awardKey), seatNumber }]
  })
}

function formatStateLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function compareSequence(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length
  }

  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}
