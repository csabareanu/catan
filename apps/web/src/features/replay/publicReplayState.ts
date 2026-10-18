import { isInteger, isRecord, isString } from '../../lib/apiClient'
import type { ReplayFrame } from './replayApi'

export type PublicAward = {
  label: string
  seatNumber: number
}

export type PublicReplayState = {
  phase: string | null
  turnPhase: string | null
  activeSeatNumber: number | null
  scores: ReadonlyMap<number, number>
  awards: PublicAward[]
}

export function readPublicReplayState(frame: ReplayFrame | null): PublicReplayState {
  const state = frame?.public_state

  return {
    phase: readStateLabel(state?.phase),
    turnPhase: readStateLabel(state?.turn_phase),
    activeSeatNumber: readSeatNumber(state?.active_seat_number),
    scores: readPublicScores(state?.public_scores),
    awards: readPublicAwards(state?.public_awards),
  }
}

function readStateLabel(value: unknown): string | null {
  return isString(value) && value.trim() !== '' ? value : null
}

function readSeatNumber(value: unknown): number | null {
  return isInteger(value) && value > 0 ? value : null
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
