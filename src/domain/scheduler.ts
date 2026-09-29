export type MatchMode = 'doubles' | 'singles'
export type MatchResult = 'teamA' | 'draw' | 'teamB' | null
export type MatchStatus = 'scheduled' | 'inProgress' | 'completed' | 'interrupted'
export type AvailabilityReason = 'joined' | 'injury' | 'return' | 'availability'

export interface AvailabilityChange {
  fromRound: number
  available: boolean
  reason: AvailabilityReason
}

export interface Player {
  id: string
  name: string
  isCaptain: boolean
  availabilityChanges?: AvailabilityChange[]
}

export interface Match {
  id: string
  court: number
  teamA: string[]
  teamB: string[]
  result: MatchResult
  status: MatchStatus
}

export interface Round {
  id: string
  matches: Match[]
}

export interface ScheduleResult {
  rounds: Round[]
  skippedCourts: number
  preservedMatches: number
  removedMatches: number
  generatedMatches: number
  inProgressMatches: Match[]
}

const pairKey = (first: string, second: string) => [first, second].sort().join('::')

const shuffled = <T,>(items: T[]): T[] => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

export function isAvailableAtRound(player: Player, roundNumber: number): boolean {
  const changes = [...(player.availabilityChanges ?? [])].sort((a, b) => a.fromRound - b.fromRound)
  let available = changes.length === 0
  for (const change of changes) {
    if (change.fromRound > roundNumber) break
    available = change.available
  }
  return available
}

export function withAvailabilityChange(player: Player, change: AvailabilityChange): Player {
  const changes = [...(player.availabilityChanges ?? [])]
  const existing = changes.findIndex((item) => item.fromRound === change.fromRound)
  if (existing >= 0) changes[existing] = change
  else changes.push(change)
  return { ...player, availabilityChanges: changes.sort((a, b) => a.fromRound - b.fromRound) }
}

function partitionFour(ids: string[], captains: Set<string>, partnerPairs: Set<string>): [string[], string[]] | null {
  const [a, b, c, d] = ids
  const splits: [string[], string[]][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]]
  ]
  const valid = splits.filter(([teamA, teamB]) => {
    return !(teamA.every((id) => captains.has(id)) && captains.size > 1) &&
      !(teamB.every((id) => captains.has(id)) && captains.size > 1) &&
      !partnerPairs.has(pairKey(teamA[0], teamA[1])) &&
      !partnerPairs.has(pairKey(teamB[0], teamB[1]))
  })
  if (valid.length === 0) return null
  return shuffled(valid)[0]
}

function hasDoublesGame(available: string[], captains: Set<string>, partnerPairs: Set<string>): boolean {
  let found = false
  combinations(available, 4, (selection) => {
    if (!partitionFour(selection, captains, partnerPairs)) return false
    found = true
    return true
  })
  return found
}

function combinations<T>(items: T[], size: number, visit: (selection: T[]) => boolean): boolean {
  const selection: T[] = []
  const walk = (start: number): boolean => {
    if (selection.length === size) return visit([...selection])
    const remaining = size - selection.length
    for (let index = start; index <= items.length - remaining; index += 1) {
      selection.push(items[index])
      if (walk(index + 1)) return true
      selection.pop()
    }
    return false
  }
  return walk(0)
}

function findDoublesGame(
  available: string[],
  captains: Set<string>,
  metPairs: Set<string>,
  partnerPairs: Set<string>,
  appearances: Map<string, number>,
  prioritizeNextCourt: boolean
): { teamA: string[]; teamB: string[] } | null {
  const best: { value?: { teamA: string[]; teamB: string[]; score: number } } = {}
  let examined = 0
  const searchLimit = available.length <= 18 ? Number.POSITIVE_INFINITY : 18000
  const inspect = (selection: string[]) => {
    examined += 1
    const keys: string[] = []
    for (let first = 0; first < selection.length; first += 1) {
      for (let second = first + 1; second < selection.length; second += 1) {
        keys.push(pairKey(selection[first], selection[second]))
      }
    }
    const partition = partitionFour(shuffled(selection), captains, partnerPairs)
    if (!partition) return false
    const leftover = prioritizeNextCourt ? available.filter((id) => !selection.includes(id)) : []
    const wouldBlockNextCourt = prioritizeNextCourt && !hasDoublesGame(leftover, captains, partnerPairs)
    const repeatedEncounters = keys.filter((key) => metPairs.has(key)).length
    const projectedCounts = selection.map((id) => appearances.get(id) ?? 0)
    const score = (wouldBlockNextCourt ? 1_000_000 : 0) + Math.max(...projectedCounts) * 100 + projectedCounts.reduce((total, count) => total + count, 0) * 10 + repeatedEncounters + Math.random()
    if (!best.value || score < best.value.score) best.value = { teamA: partition[0], teamB: partition[1], score }
    return examined >= searchLimit
  }
  combinations(available, 4, inspect)
  if (!best.value) return null
  return { teamA: best.value.teamA, teamB: best.value.teamB }
}

function findSinglesGame(
  available: string[],
  metPairs: Set<string>,
  appearances: Map<string, number>
): { teamA: string[]; teamB: string[] } | null {
  const eligible = available.filter((first, index) => available.slice(index + 1).some((second) => !metPairs.has(pairKey(first, second))))
  if (eligible.length === 0) return null
  const first = shuffled(eligible).sort((a, b) => (appearances.get(a) ?? 0) - (appearances.get(b) ?? 0))[0]
  const opponents = shuffled(available.filter((id) => id !== first && !metPairs.has(pairKey(first, id))))
  opponents.sort((a, b) => (appearances.get(a) ?? 0) - (appearances.get(b) ?? 0))
  return opponents.length ? { teamA: [first], teamB: [opponents[0]] } : null
}

function getMatchStatus(match: Match): MatchStatus {
  if (match.status) return match.status
  return match.result ? 'completed' : 'scheduled'
}

function addMatchPairs(match: Match, metPairs: Set<string>, partnerPairs: Set<string>, mode: MatchMode) {
  const playing = [...match.teamA, ...match.teamB]
  for (let first = 0; first < playing.length; first += 1) {
    for (let second = first + 1; second < playing.length; second += 1) {
      metPairs.add(pairKey(playing[first], playing[second]))
    }
  }
  if (mode === 'doubles') {
    partnerPairs.add(pairKey(match.teamA[0], match.teamA[1]))
    partnerPairs.add(pairKey(match.teamB[0], match.teamB[1]))
  }
}

function emptyScheduleResult(rounds: Round[], inProgressMatches: Match[] = []): ScheduleResult {
  return {
    rounds,
    skippedCourts: 0,
    preservedMatches: rounds.reduce((total, round) => total + round.matches.length, 0),
    removedMatches: 0,
    generatedMatches: 0,
    inProgressMatches
  }
}

export function recalculateSchedule(
  players: Player[],
  roundCount: number,
  courtCount: number,
  mode: MatchMode,
  existingRounds: Round[] = [],
  fromRoundIndex = 0
): ScheduleResult {
  const totalRounds = Math.max(0, Math.floor(roundCount))
  const safeCourtCount = Math.max(1, Math.floor(courtCount))
  const captains = new Set(players.filter((player) => player.isCaptain).map((player) => player.id))
  const baseRounds: Round[] = Array.from({ length: totalRounds }, (_, index) => ({
    id: existingRounds[index]?.id ?? `round-${index + 1}`,
    matches: index < fromRoundIndex ? existingRounds[index]?.matches ?? [] : []
  }))

  const inProgressMatches = existingRounds
    .slice(fromRoundIndex)
    .flatMap((round) => round.matches)
    .filter((match) => getMatchStatus(match) === 'inProgress')
  if (inProgressMatches.length) return emptyScheduleResult(existingRounds, inProgressMatches)

  const fixedStatuses = new Set<MatchStatus>(['completed', 'interrupted'])
  const historyStatuses = new Set<MatchStatus>(['completed', 'interrupted', 'inProgress'])
  const historyMatches = existingRounds.flatMap((round, roundIndex) => round.matches
    .filter((match) => roundIndex < fromRoundIndex || historyStatuses.has(getMatchStatus(match)))
    .map((match) => ({ match, roundIndex })))
  const metPairs = new Set<string>()
  const partnerPairs = new Set<string>()
  const appearances = new Map(players.map((player) => [player.id, 0]))

  historyMatches.forEach(({ match, roundIndex }) => {
    addMatchPairs(match, metPairs, partnerPairs, mode)
    const status = getMatchStatus(match)
    if ((status === 'completed' && match.result) || status === 'inProgress' || (status === 'scheduled' && roundIndex < fromRoundIndex)) {
      ;[...match.teamA, ...match.teamB].forEach((id) => appearances.set(id, (appearances.get(id) ?? 0) + 1))
    }
  })

  let skippedCourts = 0
  let generatedMatches = 0
  for (let roundIndex = Math.max(0, fromRoundIndex); roundIndex < totalRounds; roundIndex += 1) {
    const existingRound = existingRounds[roundIndex]
    const lockedMatches = (existingRound?.matches ?? []).filter((match) => fixedStatuses.has(getMatchStatus(match)))
    baseRounds[roundIndex].matches = [...lockedMatches]
    const occupiedPlayers = new Set(lockedMatches.flatMap((match) => [...match.teamA, ...match.teamB]))
    const occupiedCourts = new Set(lockedMatches.map((match) => match.court))
    const available = shuffled(players
      .filter((player) => isAvailableAtRound(player, roundIndex + 1) && !occupiedPlayers.has(player.id))
      .map((player) => player.id))
    const playersPerMatch = mode === 'doubles' ? 4 : 2
    const remainingSlots = Math.max(0, safeCourtCount - lockedMatches.length)
    const freeCourts = Array.from({ length: safeCourtCount }, (_, index) => index + 1)
      .filter((court) => !occupiedCourts.has(court))
      .slice(0, remainingSlots)

    for (let courtIndex = 0; courtIndex < freeCourts.length; courtIndex += 1) {
      const court = freeCourts[courtIndex]
      if (available.length < playersPerMatch) {
        skippedCourts += 1
        continue
      }
      const game = mode === 'doubles'
        ? findDoublesGame(available, captains, metPairs, partnerPairs, appearances, freeCourts.length - courtIndex > 1 && available.length <= 10)
        : findSinglesGame(available, metPairs, appearances)
      if (!game) {
        skippedCourts += 1
        continue
      }

      const match: Match = {
        id: `r${roundIndex + 1}-c${court}`,
        court,
        teamA: game.teamA,
        teamB: game.teamB,
        result: null,
        status: 'scheduled'
      }
      baseRounds[roundIndex].matches.push(match)
      generatedMatches += 1
      const playing = [...game.teamA, ...game.teamB]
      playing.forEach((id) => {
        appearances.set(id, (appearances.get(id) ?? 0) + 1)
        available.splice(available.indexOf(id), 1)
      })
      addMatchPairs(match, metPairs, partnerPairs, mode)
    }
    baseRounds[roundIndex].matches.sort((a, b) => a.court - b.court)
  }

  const preservedMatches = existingRounds
    .slice(0, fromRoundIndex)
    .reduce((total, round) => total + round.matches.length, 0) +
    baseRounds.slice(Math.max(0, fromRoundIndex)).reduce((total, round) => total + round.matches.filter((match) => fixedStatuses.has(getMatchStatus(match))).length, 0)
  const oldPendingMatches = existingRounds
    .slice(fromRoundIndex)
    .reduce((total, round) => total + round.matches.filter((match) => !fixedStatuses.has(getMatchStatus(match))).length, 0)

  return {
    rounds: baseRounds,
    skippedCourts,
    preservedMatches,
    removedMatches: oldPendingMatches,
    generatedMatches,
    inProgressMatches: []
  }
}

export function generateSchedule(
  players: Player[],
  roundCount: number,
  courtCount: number,
  mode: MatchMode
): ScheduleResult {
  return recalculateSchedule(players, roundCount, courtCount, mode)
}
