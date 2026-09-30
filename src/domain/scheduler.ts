export type MatchMode = 'doubles' | 'singles'
export type CaptainPolicy = 'optional' | 'required'
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

function projectedLeaderAppearanceGap(
  appearances: Map<string, number>,
  captains: Set<string>,
  addedLeaderAppearances: number,
  addedOtherAppearances: number
): number {
  const leaderCount = captains.size
  const otherCount = appearances.size - leaderCount
  if (!leaderCount || !otherCount) return 0

  let leaderTotal = 0
  let otherTotal = 0
  for (const [id, count] of appearances) {
    if (captains.has(id)) leaderTotal += count
    else otherTotal += count
  }
  return Math.abs((leaderTotal + addedLeaderAppearances) * otherCount -
    (otherTotal + addedOtherAppearances) * leaderCount)
}

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

export function reopenMatch(match: Match): Match {
  if (match.status !== 'completed' && match.status !== 'interrupted') return match
  return { ...match, status: 'scheduled', result: null }
}

interface PartnerEdge {
  players: [string, string]
  repeated: boolean
  previousUses: number
  captainCount: 0 | 1
}

interface DoublesGame {
  teamA: string[]
  teamB: string[]
  repeatedPartnerships: number
  partnershipFrequencyCost: number
  repeatedLeaderEncounters: number
  leaderEncounterFrequencyCost: number
  repeatedEncounters: number
  encounterFrequencyCost: number
  captainAppearances: number
  consecutiveNonCaptains: number
  consecutiveCaptains: number
}

function partnerEdges(
  available: string[],
  captains: Set<string>,
  partnerCounts: Map<string, number>,
  captainPolicy: CaptainPolicy
): PartnerEdge[] {
  const edges: PartnerEdge[] = []
  for (let first = 0; first < available.length; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      const players: [string, string] = [available[first], available[second]]
      const captainCount = Number(captains.has(players[0])) + Number(captains.has(players[1]))
      if (captainCount > 1 || (captainPolicy === 'required' && captainCount !== 1)) continue
      const previousUses = partnerCounts.get(pairKey(players[0], players[1])) ?? 0
      edges.push({ players, repeated: previousUses > 0, previousUses, captainCount: captainCount as 0 | 1 })
    }
  }
  return shuffled(edges)
}

function disjointPartnerEdges(first: PartnerEdge, second: PartnerEdge): boolean {
  return !first.players.some((id) => second.players.includes(id))
}

function firstDisjointPartnerGame(edges: PartnerEdge[]): [PartnerEdge, PartnerEdge] | null {
  const first = edges[0]
  if (!first) return null
  for (const edge of edges.slice(1)) {
    if (disjointPartnerEdges(first, edge)) return [first, edge]
  }

  const [playerA, playerB] = first.players
  const edgesWithA = edges.filter((edge) => edge.players.includes(playerA) && !edge.players.includes(playerB))
  const edgesWithB = edges.filter((edge) => edge.players.includes(playerB) && !edge.players.includes(playerA))
  for (const edgeA of edgesWithA) {
    const otherA = edgeA.players.find((id) => id !== playerA)!
    const edgeB = edgesWithB.find((edge) => edge.players.some((id) => id !== playerB && id !== otherA))
    if (edgeB) return [edgeA, edgeB]
  }
  return null
}

function firstDoublesGame(edges: PartnerEdge[]): [PartnerEdge, PartnerEdge] | null {
  for (const captainCount of [1, 0] as const) {
    const game = firstDisjointPartnerGame(edges.filter((edge) => edge.captainCount === captainCount))
    if (game) return game
  }
  return null
}

function maxDoublesMatchCount(available: string[], captains: Set<string>, captainPolicy: CaptainPolicy): number {
  const captainCount = available.filter((id) => captains.has(id)).length
  const nonCaptainCount = available.length - captainCount
  if (captainPolicy === 'required') return Math.floor(Math.min(captainCount, nonCaptainCount) / 2)
  const captainMatches = Math.min(Math.floor(captainCount / 2), Math.floor(nonCaptainCount / 2))
  const headlessMatches = Math.floor((nonCaptainCount - captainMatches * 2) / 4)
  return captainMatches + headlessMatches
}

function findDoublesGame(
  available: string[],
  captains: Set<string>,
  metPairs: Map<string, number>,
  partnerCounts: Map<string, number>,
  appearances: Map<string, number>,
  remainingCourtsAfterCurrent: number,
  previousRoundPlayers: Set<string>,
  captainPolicy: CaptainPolicy,
  headedMatchesThisRound: number,
  headlessMatchesThisRound: number
): DoublesGame | null {
  const searchLimit = available.length <= 14 ? Number.POSITIVE_INFINITY : available.length <= 18 ? 6000 : 18000
  const best: { value?: DoublesGame & { unfilledFutureCourts: number; leaderAppearanceGap: number; captainModeImbalance: number; maxAppearances: number; totalAppearances: number; tieBreaker: number } } = {}
  // Evaluate fresh and repeated partnerships together: fairness may justify a repeat,
  // but repeats remain a lower-priority tie-break when they do not improve the load.
  const edges = partnerEdges(available, captains, partnerCounts, captainPolicy)
  const firstGame = firstDoublesGame(edges)
  if (!firstGame) return null
  let examined = 0
  const inspect = (edgeA: PartnerEdge, edgeB: PartnerEdge) => {
    examined += 1
    const selection = [...edgeA.players, ...edgeB.players]
    const keys = selection.flatMap((id, index) => selection.slice(index + 1).map((other) => pairKey(id, other)))
    const leftover = available.filter((id) => !selection.includes(id))
    const unfilledFutureCourts = Math.max(0, remainingCourtsAfterCurrent - maxDoublesMatchCount(leftover, captains, captainPolicy))
    const repeatedEncounters = keys.filter((key) => metPairs.has(key)).length
    const encounterFrequencyCost = keys.reduce((sum, key) => sum + (metPairs.get(key) ?? 0), 0)
    const projectedCounts = selection.map((id) => appearances.get(id) ?? 0)
    const captainAppearances = edgeA.captainCount + edgeB.captainCount
    const leaderAppearanceGap = projectedLeaderAppearanceGap(appearances, captains, captainAppearances, 4 - captainAppearances)
    const selectedCaptains = selection.filter((id) => captains.has(id))
    const leaderPairKey = selectedCaptains.length === 2 ? pairKey(selectedCaptains[0], selectedCaptains[1]) : null
    const repeatedLeaderEncounters = leaderPairKey && metPairs.has(leaderPairKey) ? 1 : 0
    const leaderEncounterFrequencyCost = leaderPairKey ? metPairs.get(leaderPairKey) ?? 0 : 0
    const captainModeImbalance = captainPolicy === 'optional'
      ? Math.abs((headedMatchesThisRound + Number(captainAppearances > 0)) - (headlessMatchesThisRound + Number(captainAppearances === 0)))
      : 0
    const consecutiveNonCaptains = selection.filter((id) => previousRoundPlayers.has(id) && !captains.has(id)).length
    const consecutiveCaptains = selection.filter((id) => previousRoundPlayers.has(id) && captains.has(id)).length
    const candidate = {
      teamA: edgeA.players,
      teamB: edgeB.players,
      repeatedPartnerships: Number(edgeA.repeated) + Number(edgeB.repeated),
      partnershipFrequencyCost: edgeA.previousUses + edgeB.previousUses,
      repeatedEncounters,
      encounterFrequencyCost,
      captainAppearances,
      leaderAppearanceGap,
      repeatedLeaderEncounters,
      leaderEncounterFrequencyCost,
      captainModeImbalance,
      consecutiveNonCaptains,
      consecutiveCaptains,
      unfilledFutureCourts,
      maxAppearances: Math.max(...projectedCounts),
      totalAppearances: projectedCounts.reduce((total, count) => total + count, 0),
      tieBreaker: Math.random()
    }
    const current = best.value
    const candidateRank = [candidate.unfilledFutureCourts, candidate.maxAppearances, candidate.leaderAppearanceGap, candidate.totalAppearances, candidate.repeatedLeaderEncounters, candidate.leaderEncounterFrequencyCost, candidate.captainModeImbalance, candidate.consecutiveNonCaptains, candidate.consecutiveCaptains, candidate.repeatedPartnerships, candidate.partnershipFrequencyCost, candidate.repeatedEncounters, candidate.encounterFrequencyCost]
    let isBetter = !current
    if (current) {
      const currentRank = [current.unfilledFutureCourts, current.maxAppearances, current.leaderAppearanceGap, current.totalAppearances, current.repeatedLeaderEncounters, current.leaderEncounterFrequencyCost, current.captainModeImbalance, current.consecutiveNonCaptains, current.consecutiveCaptains, current.repeatedPartnerships, current.partnershipFrequencyCost, current.repeatedEncounters, current.encounterFrequencyCost]
      const rankDifference = candidateRank.findIndex((value, index) => value !== currentRank[index])
      isBetter = rankDifference < 0
        ? candidate.tieBreaker < current.tieBreaker
        : candidateRank[rankDifference] < currentRank[rankDifference]
    }
    if (isBetter) best.value = candidate
  }

  inspect(firstGame[0], firstGame[1])
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      if (edges[first].captainCount !== edges[second].captainCount) continue
      if (!disjointPartnerEdges(edges[first], edges[second])) continue
      if (edges[first] === firstGame[0] && edges[second] === firstGame[1]) continue
      inspect(edges[first], edges[second])
      if (examined >= searchLimit) return best.value ?? null
    }
  }
  return best.value ?? null
}

function hasSinglesGame(
  available: string[],
  metPairs: Map<string, number>,
  captains: Set<string>,
  captainPolicy: CaptainPolicy
): boolean {
  for (let firstIndex = 0; firstIndex < available.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < available.length; secondIndex += 1) {
      const first = available[firstIndex]
      const second = available[secondIndex]
      const firstCaptain = captains.has(first)
      const secondCaptain = captains.has(second)
      if (firstCaptain !== secondCaptain || (captainPolicy === 'required' && !firstCaptain)) continue
      if (!metPairs.has(pairKey(first, second))) return true
    }
  }
  return false
}

function findSinglesGame(
  available: string[],
  metPairs: Map<string, number>,
  appearances: Map<string, number>,
  captains: Set<string>,
  captainPolicy: CaptainPolicy,
  previousRoundPlayers: Set<string>,
  remainingCourtsAfterCurrent: number,
  headedMatchesThisRound: number,
  headlessMatchesThisRound: number
): { teamA: string[]; teamB: string[] } | null {
  const candidates: { first: string; second: string; captains: number; leaderAppearanceGap: number; captainModeImbalance: number; consecutiveNonCaptains: number; consecutiveCaptains: number; appearances: number; maxAppearances: number }[] = []
  for (let firstIndex = 0; firstIndex < available.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < available.length; secondIndex += 1) {
      const first = available[firstIndex]
      const second = available[secondIndex]
      const firstCaptain = captains.has(first)
      const secondCaptain = captains.has(second)
      if (firstCaptain !== secondCaptain || (captainPolicy === 'required' && !firstCaptain)) continue
      if (metPairs.has(pairKey(first, second))) continue
      candidates.push({
        first,
        second,
        captains: Number(firstCaptain) + Number(secondCaptain),
        leaderAppearanceGap: projectedLeaderAppearanceGap(appearances, captains, Number(firstCaptain) + Number(secondCaptain), Number(!firstCaptain) + Number(!secondCaptain)),
        captainModeImbalance: captainPolicy === 'optional'
          ? Math.abs((headedMatchesThisRound + Number(firstCaptain && secondCaptain)) - (headlessMatchesThisRound + Number(!firstCaptain && !secondCaptain)))
          : 0,
        consecutiveNonCaptains: Number(previousRoundPlayers.has(first) && !firstCaptain) + Number(previousRoundPlayers.has(second) && !secondCaptain),
        consecutiveCaptains: Number(previousRoundPlayers.has(first) && firstCaptain) + Number(previousRoundPlayers.has(second) && secondCaptain),
        appearances: (appearances.get(first) ?? 0) + (appearances.get(second) ?? 0),
        maxAppearances: Math.max(appearances.get(first) ?? 0, appearances.get(second) ?? 0)
      })
    }
  }
  candidates.sort((a, b) => a.maxAppearances - b.maxAppearances ||
    a.leaderAppearanceGap - b.leaderAppearanceGap ||
    a.appearances - b.appearances ||
    a.captainModeImbalance - b.captainModeImbalance ||
    a.consecutiveNonCaptains - b.consecutiveNonCaptains ||
    a.consecutiveCaptains - b.consecutiveCaptains ||
    a.first.localeCompare(b.first) ||
    a.second.localeCompare(b.second))
  let match = shuffled(candidates.slice(0, Math.max(1, Math.min(12, candidates.length))))[0]
  if (remainingCourtsAfterCurrent > 0 && candidates.length) {
    const searchCandidates = available.length <= 24 ? candidates : candidates.slice(0, 128)
    const continuation = searchCandidates.find((candidate) => hasSinglesGame(
      available.filter((id) => id !== candidate.first && id !== candidate.second),
      metPairs,
      captains,
      captainPolicy
    ))
    if (continuation) match = continuation
  }
  return match ? { teamA: [match.first], teamB: [match.second] } : null
}

function getMatchStatus(match: Match): MatchStatus {
  if (match.status) return match.status
  return match.result ? 'completed' : 'scheduled'
}

function addMatchPairs(match: Match, metPairs: Map<string, number>, partnerCounts: Map<string, number>, mode: MatchMode) {
  const playing = [...match.teamA, ...match.teamB]
  for (let first = 0; first < playing.length; first += 1) {
    for (let second = first + 1; second < playing.length; second += 1) {
      const key = pairKey(playing[first], playing[second])
      metPairs.set(key, (metPairs.get(key) ?? 0) + 1)
    }
  }
  if (mode === 'doubles') {
    for (const team of [match.teamA, match.teamB]) {
      const key = pairKey(team[0], team[1])
      partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1)
    }
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

interface ScheduleAttempt {
  rounds: Round[]
  skippedCourts: number
  generatedMatches: number
  captainModeImbalance: number
  consecutiveNonCaptainAppearances: number
  consecutiveCaptainAppearances: number
  repeatedPartnerships: number
  partnershipFrequencyCost: number
  repeatedLeaderEncounters: number
  leaderEncounterFrequencyCost: number
  repeatedEncounters: number
  encounterFrequencyCost: number
  appearanceSpread: number
  leaderAppearanceGap: number
  uncoveredPartnerships: number
  uncoveredEncounters: number
  uncoveredLeaderPartnerships: number
  uncoveredLeaderEncounters: number
  tieBreaker: number
}

function buildScheduleAttempt(
  players: Player[],
  totalRounds: number,
  safeCourtCount: number,
  mode: MatchMode,
  existingRounds: Round[],
  fromRoundIndex: number,
  captainPolicy: CaptainPolicy,
  captains: Set<string>,
  initialMetPairs: Map<string, number>,
  initialPartnerCounts: Map<string, number>,
  initialAppearances: Map<string, number>
): ScheduleAttempt {
  const fixedStatuses = new Set<MatchStatus>(['completed', 'interrupted'])
  const rounds: Round[] = Array.from({ length: totalRounds }, (_, index) => ({
    id: existingRounds[index]?.id ?? `round-${index + 1}`,
    matches: index < fromRoundIndex ? existingRounds[index]?.matches ?? [] : []
  }))
  const metPairs = new Map(initialMetPairs)
  const partnerCounts = new Map(initialPartnerCounts)
  const appearances = new Map(initialAppearances)
  let skippedCourts = 0
  let generatedMatches = 0
  let captainModeImbalance = 0
  let consecutiveNonCaptainAppearances = 0
  let consecutiveCaptainAppearances = 0
  let repeatedPartnerships = 0
  let partnershipFrequencyCost = 0
  let repeatedLeaderEncounters = 0
  let leaderEncounterFrequencyCost = 0
  let repeatedEncounters = 0
  let encounterFrequencyCost = 0

  for (let roundIndex = Math.max(0, fromRoundIndex); roundIndex < totalRounds; roundIndex += 1) {
    const previousRoundPlayers = new Set((rounds[roundIndex - 1]?.matches ?? []).flatMap((match) => [...match.teamA, ...match.teamB]))
    const existingRound = existingRounds[roundIndex]
    const lockedMatches = (existingRound?.matches ?? []).filter((match) => fixedStatuses.has(getMatchStatus(match)))
    rounds[roundIndex].matches = [...lockedMatches]
    let headedMatchesThisRound = lockedMatches.filter((match) => [...match.teamA, ...match.teamB].some((id) => captains.has(id))).length
    let headlessMatchesThisRound = lockedMatches.length - headedMatchesThisRound
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
      let game: { teamA: string[]; teamB: string[] } | null
      let repeatedPartnershipsForGame = 0
      let partnershipFrequencyCostForGame = 0
      let repeatedEncountersForGame = 0
      let encounterFrequencyCostForGame = 0
      if (mode === 'doubles') {
        const doublesGame = findDoublesGame(
          available,
          captains,
          metPairs,
          partnerCounts,
          appearances,
          freeCourts.length - courtIndex - 1,
          previousRoundPlayers,
          captainPolicy,
          headedMatchesThisRound,
          headlessMatchesThisRound
        )
        game = doublesGame
        repeatedPartnershipsForGame = doublesGame?.repeatedPartnerships ?? 0
        partnershipFrequencyCostForGame = doublesGame?.partnershipFrequencyCost ?? 0
        repeatedEncountersForGame = doublesGame?.repeatedEncounters ?? 0
        encounterFrequencyCostForGame = doublesGame?.encounterFrequencyCost ?? 0
      } else {
        game = findSinglesGame(available, metPairs, appearances, captains, captainPolicy, previousRoundPlayers, freeCourts.length - courtIndex - 1, headedMatchesThisRound, headlessMatchesThisRound)
      }
      if (!game) {
        skippedCourts += 1
        continue
      }

      repeatedPartnerships += repeatedPartnershipsForGame
      partnershipFrequencyCost += partnershipFrequencyCostForGame
      repeatedEncounters += repeatedEncountersForGame
      encounterFrequencyCost += encounterFrequencyCostForGame
      const match: Match = {
        id: `r${roundIndex + 1}-c${court}`,
        court,
        teamA: game.teamA,
        teamB: game.teamB,
        result: null,
        status: 'scheduled'
      }
      rounds[roundIndex].matches.push(match)
      generatedMatches += 1
      const playing = [...game.teamA, ...game.teamB]
      const matchCaptains = playing.filter((id) => captains.has(id))
      if (matchCaptains.length === 2) {
        const leaderKey = pairKey(matchCaptains[0], matchCaptains[1])
        repeatedLeaderEncounters += Number(metPairs.has(leaderKey))
        leaderEncounterFrequencyCost += metPairs.get(leaderKey) ?? 0
      }
      const matchHasLeader = playing.some((id) => captains.has(id))
      if (matchHasLeader) headedMatchesThisRound += 1
      else headlessMatchesThisRound += 1
      playing.forEach((id) => {
        if (captains.has(id)) {
          if (previousRoundPlayers.has(id)) consecutiveCaptainAppearances += 1
        } else if (previousRoundPlayers.has(id)) {
          consecutiveNonCaptainAppearances += 1
        }
        appearances.set(id, (appearances.get(id) ?? 0) + 1)
        available.splice(available.indexOf(id), 1)
      })
      addMatchPairs(match, metPairs, partnerCounts, mode)
    }
    rounds[roundIndex].matches.sort((a, b) => a.court - b.court)
    if (captainPolicy === 'optional') captainModeImbalance += Math.abs(headedMatchesThisRound - headlessMatchesThisRound)
  }

  const activePlayers = players.filter((player) => Array.from(
    { length: Math.max(0, totalRounds - Math.max(0, fromRoundIndex)) },
    (_, index) => isAvailableAtRound(player, Math.max(0, fromRoundIndex) + index + 1)
  ).some(Boolean))
  const activeAppearances = activePlayers.map((player) => appearances.get(player.id) ?? 0)
  const appearanceSpread = activeAppearances.length ? Math.max(...activeAppearances) - Math.min(...activeAppearances) : 0
  const leaderAppearances = activePlayers.filter((player) => captains.has(player.id)).map((player) => appearances.get(player.id) ?? 0)
  const otherAppearances = activePlayers.filter((player) => !captains.has(player.id)).map((player) => appearances.get(player.id) ?? 0)
  const leaderAppearanceGap = leaderAppearances.length && otherAppearances.length
    ? Math.abs(leaderAppearances.reduce((sum, count) => sum + count, 0) * otherAppearances.length -
      otherAppearances.reduce((sum, count) => sum + count, 0) * leaderAppearances.length)
    : 0
  const availableTogether = (first: Player, second: Player) => Array.from(
    { length: Math.max(0, totalRounds - Math.max(0, fromRoundIndex)) },
    (_, index) => Math.max(0, fromRoundIndex) + index + 1
  ).some((roundNumber) => isAvailableAtRound(first, roundNumber) && isAvailableAtRound(second, roundNumber))
  let uncoveredPartnerships = 0
  let uncoveredEncounters = 0
  let uncoveredLeaderPartnerships = 0
  let uncoveredLeaderEncounters = 0
  for (let first = 0; first < activePlayers.length; first += 1) {
    for (let second = first + 1; second < activePlayers.length; second += 1) {
      const playerA = activePlayers[first]
      const playerB = activePlayers[second]
      if (!availableTogether(playerA, playerB)) continue
      const key = pairKey(playerA.id, playerB.id)
      if (!metPairs.has(key)) uncoveredEncounters += 1
      const captainCount = Number(captains.has(playerA.id)) + Number(captains.has(playerB.id))
      const canBePartners = mode === 'doubles' && (captainPolicy === 'optional' ? captainCount <= 1 : captainCount === 1)
      if (canBePartners && !partnerCounts.has(key)) {
        uncoveredPartnerships += 1
        if (captainCount === 1) uncoveredLeaderPartnerships += 1
      }
      if (captainCount === 2 && !metPairs.has(key)) uncoveredLeaderEncounters += 1
    }
  }

  return {
    rounds,
    skippedCourts,
    generatedMatches,
    captainModeImbalance,
    consecutiveNonCaptainAppearances,
    consecutiveCaptainAppearances,
    repeatedPartnerships,
    partnershipFrequencyCost,
    repeatedLeaderEncounters,
    leaderEncounterFrequencyCost,
    repeatedEncounters,
    encounterFrequencyCost,
    appearanceSpread,
    leaderAppearanceGap,
    uncoveredPartnerships,
    uncoveredEncounters,
    uncoveredLeaderPartnerships,
    uncoveredLeaderEncounters,
    tieBreaker: Math.random()
  }
}

function isBetterAttempt(candidate: ScheduleAttempt, current: ScheduleAttempt | null): boolean {
  if (!current) return true
  if (candidate.generatedMatches !== current.generatedMatches) return candidate.generatedMatches > current.generatedMatches
  if (candidate.appearanceSpread !== current.appearanceSpread) return candidate.appearanceSpread < current.appearanceSpread
  if (candidate.leaderAppearanceGap !== current.leaderAppearanceGap) return candidate.leaderAppearanceGap < current.leaderAppearanceGap
  const candidateLeaderPairGaps = candidate.uncoveredLeaderPartnerships + candidate.uncoveredLeaderEncounters
  const currentLeaderPairGaps = current.uncoveredLeaderPartnerships + current.uncoveredLeaderEncounters
  if (candidateLeaderPairGaps !== currentLeaderPairGaps) return candidateLeaderPairGaps < currentLeaderPairGaps
  if (candidate.uncoveredLeaderPartnerships !== current.uncoveredLeaderPartnerships) return candidate.uncoveredLeaderPartnerships < current.uncoveredLeaderPartnerships
  if (candidate.uncoveredLeaderEncounters !== current.uncoveredLeaderEncounters) return candidate.uncoveredLeaderEncounters < current.uncoveredLeaderEncounters
  const candidatePairGaps = candidate.uncoveredPartnerships + candidate.uncoveredEncounters
  const currentPairGaps = current.uncoveredPartnerships + current.uncoveredEncounters
  if (candidatePairGaps !== currentPairGaps) return candidatePairGaps < currentPairGaps
  if (candidate.uncoveredPartnerships !== current.uncoveredPartnerships) return candidate.uncoveredPartnerships < current.uncoveredPartnerships
  if (candidate.uncoveredEncounters !== current.uncoveredEncounters) return candidate.uncoveredEncounters < current.uncoveredEncounters
  if (candidate.captainModeImbalance !== current.captainModeImbalance) return candidate.captainModeImbalance < current.captainModeImbalance
  if (candidate.consecutiveNonCaptainAppearances !== current.consecutiveNonCaptainAppearances) return candidate.consecutiveNonCaptainAppearances < current.consecutiveNonCaptainAppearances
  if (candidate.consecutiveCaptainAppearances !== current.consecutiveCaptainAppearances) return candidate.consecutiveCaptainAppearances < current.consecutiveCaptainAppearances
  if (candidate.repeatedLeaderEncounters !== current.repeatedLeaderEncounters) return candidate.repeatedLeaderEncounters < current.repeatedLeaderEncounters
  if (candidate.leaderEncounterFrequencyCost !== current.leaderEncounterFrequencyCost) return candidate.leaderEncounterFrequencyCost < current.leaderEncounterFrequencyCost
  const candidateNewPartnerships = candidate.generatedMatches * 2 - candidate.repeatedPartnerships
  const currentNewPartnerships = current.generatedMatches * 2 - current.repeatedPartnerships
  if (candidateNewPartnerships !== currentNewPartnerships) return candidateNewPartnerships > currentNewPartnerships
  if (candidate.repeatedPartnerships !== current.repeatedPartnerships) return candidate.repeatedPartnerships < current.repeatedPartnerships
  if (candidate.partnershipFrequencyCost !== current.partnershipFrequencyCost) return candidate.partnershipFrequencyCost < current.partnershipFrequencyCost
  if (candidate.repeatedEncounters !== current.repeatedEncounters) return candidate.repeatedEncounters < current.repeatedEncounters
  if (candidate.encounterFrequencyCost !== current.encounterFrequencyCost) return candidate.encounterFrequencyCost < current.encounterFrequencyCost
  return candidate.tieBreaker < current.tieBreaker
}

interface PairingOpportunity {
  key: string
  captainCount: number
  canPartner: boolean
}

interface RebalanceSlot {
  match: Match
  roundIndex: number
  team: string[]
  playerIndex: number
}

function pairingOpportunities(rounds: Round[], players: Player[], captains: Set<string>, captainPolicy: CaptainPolicy): PairingOpportunity[] {
  const opportunities: PairingOpportunity[] = []
  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      const playerA = players[first]
      const playerB = players[second]
      const canMeet = rounds.some((_, index) => isAvailableAtRound(playerA, index + 1) && isAvailableAtRound(playerB, index + 1))
      if (!canMeet) continue
      const captainCount = Number(captains.has(playerA.id)) + Number(captains.has(playerB.id))
      opportunities.push({
        key: pairKey(playerA.id, playerB.id),
        captainCount,
        canPartner: captainPolicy === 'required' ? captainCount === 1 : captainCount <= 1
      })
    }
  }
  return opportunities
}

function pairingQuality(rounds: Round[], opportunities: PairingOpportunity[]): number[] {
  const partnerCounts = new Map<string, number>()
  const encounterCounts = new Map<string, number>()
  for (const match of rounds.flatMap((round) => round.matches)) {
    for (const team of [match.teamA, match.teamB]) {
      if (team.length !== 2) continue
      const key = pairKey(team[0], team[1])
      partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1)
    }
    const playing = [...match.teamA, ...match.teamB]
    for (let first = 0; first < playing.length; first += 1) {
      for (let second = first + 1; second < playing.length; second += 1) {
        const key = pairKey(playing[first], playing[second])
        encounterCounts.set(key, (encounterCounts.get(key) ?? 0) + 1)
      }
    }
  }

  let uncoveredLeaderPartners = 0
  let uncoveredLeaderEncounters = 0
  let uncoveredPartnerships = 0
  let uncoveredEncounters = 0
  const eligiblePartnerCounts: number[] = []
  const eligibleEncounterCounts: number[] = []
  for (const opportunity of opportunities) {
    const meetingCount = encounterCounts.get(opportunity.key) ?? 0
    eligibleEncounterCounts.push(meetingCount)
    if (!meetingCount) {
      uncoveredEncounters += 1
      if (opportunity.captainCount === 2) uncoveredLeaderEncounters += 1
    }
    if (opportunity.canPartner) {
      const count = partnerCounts.get(opportunity.key) ?? 0
      eligiblePartnerCounts.push(count)
      if (!count) {
        uncoveredPartnerships += 1
        if (opportunity.captainCount === 1) uncoveredLeaderPartners += 1
      }
    }
  }
  const maximumPartnerUse = eligiblePartnerCounts.length ? Math.max(...eligiblePartnerCounts) : 0
  const partnerRepetitionCost = eligiblePartnerCounts.reduce((total, count) => total + count * Math.max(0, count - 1) / 2, 0)
  const maximumEncounterUse = eligibleEncounterCounts.length ? Math.max(...eligibleEncounterCounts) : 0
  const encounterRepetitionCost = eligibleEncounterCounts.reduce((total, count) => total + count * Math.max(0, count - 1) / 2, 0)
  return [
    uncoveredLeaderPartners,
    uncoveredLeaderEncounters,
    uncoveredPartnerships,
    uncoveredEncounters,
    maximumPartnerUse,
    partnerRepetitionCost,
    maximumEncounterUse,
    encounterRepetitionCost
  ]
}

function comparePairingQuality(candidate: number[], current: number[]): number {
  const difference = candidate.findIndex((value, index) => value !== current[index])
  if (difference < 0) return 0
  return candidate[difference] < current[difference] ? -1 : 1
}

function rebalanceDoublesPartnerships(
  rounds: Round[],
  players: Player[],
  captains: Set<string>,
  fromRoundIndex: number,
  captainPolicy: CaptainPolicy
): void {
  const slots: RebalanceSlot[] = []
  rounds.forEach((round, roundIndex) => {
    if (roundIndex < Math.max(0, fromRoundIndex)) return
    for (const match of round.matches) {
      if (getMatchStatus(match) !== 'scheduled' || match.teamA.length !== 2 || match.teamB.length !== 2) continue
      for (const team of [match.teamA, match.teamB]) {
        team.forEach((_, playerIndex) => slots.push({ match, roundIndex, team, playerIndex }))
      }
    }
  })
  if (slots.length < 2) return

  const playersById = new Map(players.map((player) => [player.id, player]))
  const opportunities = pairingOpportunities(rounds, players, captains, captainPolicy)
  const quality = () => pairingQuality(rounds, opportunities)
  const snapshot = () => rounds.map((round) => round.matches.map((match) => ({ teamA: [...match.teamA], teamB: [...match.teamB] })))
  const restore = (saved: ReturnType<typeof snapshot>) => {
    rounds.forEach((round, roundIndex) => round.matches.forEach((match, matchIndex) => {
      match.teamA.splice(0, match.teamA.length, ...saved[roundIndex][matchIndex].teamA)
      match.teamB.splice(0, match.teamB.length, ...saved[roundIndex][matchIndex].teamB)
    }))
  }
  const roundHasUniquePlayers = (roundIndex: number) => {
    const playing = rounds[roundIndex].matches.flatMap((match) => [...match.teamA, ...match.teamB])
    return new Set(playing).size === playing.length
  }

  let currentQuality = quality()
  let bestQuality = [...currentQuality]
  let bestSchedule = snapshot()
  const iterations = Math.min(4000, slots.length * 32)
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const first = slots[Math.floor(Math.random() * slots.length)]
    const second = slots[Math.floor(Math.random() * slots.length)]
    if (first === second || first.team === second.team) continue
    const firstId = first.team[first.playerIndex]
    const secondId = second.team[second.playerIndex]
    if (captains.has(firstId) !== captains.has(secondId)) continue
    const firstPlayer = playersById.get(firstId)
    const secondPlayer = playersById.get(secondId)
    if (!firstPlayer || !secondPlayer ||
      !isAvailableAtRound(secondPlayer, first.roundIndex + 1) ||
      !isAvailableAtRound(firstPlayer, second.roundIndex + 1)) continue

    first.team[first.playerIndex] = secondId
    second.team[second.playerIndex] = firstId
    const roundsToCheck = first.roundIndex === second.roundIndex ? [first.roundIndex] : [first.roundIndex, second.roundIndex]
    const valid = roundsToCheck.every(roundHasUniquePlayers)
    const candidateQuality = valid ? quality() : currentQuality
    const comparison = valid ? comparePairingQuality(candidateQuality, currentQuality) : 1
    const progress = iteration / iterations
    const accept = valid && (comparison < 0 || (comparison === 0 && Math.random() < 0.08) ||
      (comparison > 0 && Math.random() < (0.025 * (1 - progress))))
    if (accept) currentQuality = candidateQuality
    else {
      first.team[first.playerIndex] = firstId
      second.team[second.playerIndex] = secondId
    }

    if (comparePairingQuality(currentQuality, bestQuality) < 0) {
      bestQuality = [...currentQuality]
      bestSchedule = snapshot()
    }
  }
  restore(bestSchedule)
}

export function recalculateSchedule(
  players: Player[],
  roundCount: number,
  courtCount: number,
  mode: MatchMode,
  existingRounds: Round[] = [],
  fromRoundIndex = 0,
  captainPolicy: CaptainPolicy = 'optional'
): ScheduleResult {
  const totalRounds = Math.max(0, Math.floor(roundCount))
  const safeCourtCount = Math.max(1, Math.floor(courtCount))
  const captains = new Set(players.filter((player) => player.isCaptain).map((player) => player.id))

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
  const metPairs = new Map<string, number>()
  const partnerCounts = new Map<string, number>()
  const appearances = new Map(players.map((player) => [player.id, 0]))

  historyMatches.forEach(({ match, roundIndex }) => {
    addMatchPairs(match, metPairs, partnerCounts, mode)
    const status = getMatchStatus(match)
    if ((status === 'completed' && match.result) || status === 'inProgress' || (status === 'scheduled' && roundIndex < fromRoundIndex)) {
      ;[...match.teamA, ...match.teamB].forEach((id) => appearances.set(id, (appearances.get(id) ?? 0) + 1))
    }
  })

  // Re-run the bounded greedy planner for small groups to avoid avoidable dead ends in partner coverage.
  const attemptCount = mode !== 'doubles' ? 1
    : players.length <= 8 ? 16
      : players.length <= 14 ? 8
        : players.length <= 18 ? 2 : 1
  let bestAttempt: ScheduleAttempt | null = null
  for (let attemptIndex = 0; attemptIndex < attemptCount; attemptIndex += 1) {
    const candidate = buildScheduleAttempt(
      players,
      totalRounds,
      safeCourtCount,
      mode,
      existingRounds,
      fromRoundIndex,
      captainPolicy,
      captains,
      metPairs,
      partnerCounts,
      appearances
    )
    if (isBetterAttempt(candidate, bestAttempt)) bestAttempt = candidate
  }
  if (!bestAttempt) return emptyScheduleResult(existingRounds)
  if (mode === 'doubles') {
    rebalanceDoublesPartnerships(bestAttempt.rounds, players, captains, fromRoundIndex, captainPolicy)
  }

  const preservedMatches = existingRounds
    .slice(0, fromRoundIndex)
    .reduce((total, round) => total + round.matches.length, 0) +
    bestAttempt.rounds.slice(Math.max(0, fromRoundIndex)).reduce((total, round) => round.matches.filter((match) => fixedStatuses.has(getMatchStatus(match))).length + total, 0)
  const oldPendingMatches = existingRounds
    .slice(fromRoundIndex)
    .reduce((total, round) => total + round.matches.filter((match) => !fixedStatuses.has(getMatchStatus(match))).length, 0)

  return {
    rounds: bestAttempt.rounds,
    skippedCourts: bestAttempt.skippedCourts,
    preservedMatches,
    removedMatches: oldPendingMatches,
    generatedMatches: bestAttempt.generatedMatches,
    inProgressMatches: []
  }
}

export function generateSchedule(
  players: Player[],
  roundCount: number,
  courtCount: number,
  mode: MatchMode,
  captainPolicy: CaptainPolicy = 'optional'
): ScheduleResult {
  return recalculateSchedule(players, roundCount, courtCount, mode, [], 0, captainPolicy)
}
