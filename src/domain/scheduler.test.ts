import { describe, expect, it } from 'vitest'
import {
  generateSchedule,
  isAvailableAtRound,
  recalculateSchedule,
  withAvailabilityChange,
  type Match,
  type Player,
  type Round
} from './scheduler'
import { calculateStandings } from './standings'

const makePlayers = (count: number, captains = 0): Player[] => Array.from({ length: count }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Jugador ${index + 1}`,
  isCaptain: index < captains
}))

const partnershipKeys = (match: Match) => [match.teamA, match.teamB]
  .map((team) => [...team].sort().join('::'))

function assertNoRepeatedPlayersInRound(round: Round) {
  const playing = new Set<string>()
  for (const match of round.matches) {
    for (const id of [...match.teamA, ...match.teamB]) {
      expect(playing.has(id)).toBe(false)
      playing.add(id)
    }
  }
}

describe('availability timeline', () => {
  it('applies join, injury and return changes from their effective rounds', () => {
    const player: Player = {
      id: 'new-player',
      name: 'Nueva',
      isCaptain: false,
      availabilityChanges: [{ fromRound: 4, available: true, reason: 'joined' }]
    }
    expect(isAvailableAtRound(player, 3)).toBe(false)
    expect(isAvailableAtRound(player, 4)).toBe(true)

    const injured = withAvailabilityChange(player, { fromRound: 6, available: false, reason: 'injury' })
    const returned = withAvailabilityChange(injured, { fromRound: 8, available: true, reason: 'return' })
    expect(isAvailableAtRound(returned, 5)).toBe(true)
    expect(isAvailableAtRound(returned, 6)).toBe(false)
    expect(isAvailableAtRound(returned, 7)).toBe(false)
    expect(isAvailableAtRound(returned, 8)).toBe(true)
  })

  it('replaces a prior change on the same round instead of duplicating it', () => {
    const player = withAvailabilityChange(makePlayers(1)[0], { fromRound: 3, available: false, reason: 'injury' })
    const updated = withAvailabilityChange(player, { fromRound: 3, available: true, reason: 'return' })
    expect(updated.availabilityChanges).toHaveLength(1)
    expect(isAvailableAtRound(updated, 3)).toBe(true)
  })
})

describe('schedule generation and recalculation', () => {
  it('balances consecutive doubles rounds without duplicate partners or same-round assignments', () => {
    const players = makePlayers(8, 2)
    const result = generateSchedule(players, 5, 2, 'doubles')
    const allPartners = new Set<string>()
    const appearances = new Map(players.map((player) => [player.id, 0]))

    expect(result.rounds).toHaveLength(5)
    for (const round of result.rounds) {
      expect(round.matches.length).toBeGreaterThan(0)
      expect(round.matches.length).toBeLessThanOrEqual(2)
      assertNoRepeatedPlayersInRound(round)
      for (const match of round.matches) {
        expect(match.status).toBe('scheduled')
        expect(match.teamA.includes('p1') && match.teamA.includes('p2')).toBe(false)
        expect(match.teamB.includes('p1') && match.teamB.includes('p2')).toBe(false)
        for (const key of partnershipKeys(match)) {
          expect(allPartners.has(key)).toBe(false)
          allPartners.add(key)
        }
        for (const id of [...match.teamA, ...match.teamB]) appearances.set(id, (appearances.get(id) ?? 0) + 1)
      }
    }
    expect(Math.max(...appearances.values()) - Math.min(...appearances.values())).toBeLessThanOrEqual(1)
  })

  it('allows any number of heads globally while never placing two in the same doubles team', () => {
    const players = makePlayers(8, 6)
    const result = generateSchedule(players, 4, 3, 'doubles')

    expect(result.rounds.some((round) => round.matches.length > 0)).toBe(true)
    for (const round of result.rounds) {
      assertNoRepeatedPlayersInRound(round)
      for (const match of round.matches) {
        expect(match.teamA.filter((id) => players.find((player) => player.id === id)?.isCaptain)).toHaveLength(1)
        expect(match.teamB.filter((id) => players.find((player) => player.id === id)?.isCaptain)).toHaveLength(1)
      }
    }
  })

  it('adds late players and excludes an injured player only from the effective round onward', () => {
    const initialPlayers = makePlayers(8)
    const originalRounds = generateSchedule(initialPlayers, 5, 2, 'doubles').rounds
    originalRounds[0].matches[0].status = 'completed'
    originalRounds[0].matches[0].result = 'teamA'
    const completedSnapshot = structuredClone(originalRounds[0].matches[0])
    const injuredId = completedSnapshot.teamA[0]
    const injured = withAvailabilityChange(initialPlayers.find((player) => player.id === injuredId)!, {
      fromRound: 1,
      available: false,
      reason: 'injury'
    })
    const newcomer: Player = {
      id: 'newcomer',
      name: 'Nueva jugadora',
      isCaptain: false,
      availabilityChanges: [{ fromRound: 2, available: true, reason: 'joined' }]
    }
    const changedPlayers = initialPlayers.map((player) => player.id === injured.id ? injured : player).concat(newcomer)

    const result = recalculateSchedule(changedPlayers, 5, 2, 'doubles', originalRounds, 0)

    expect(result.inProgressMatches).toHaveLength(0)
    expect(result.rounds[0].matches.find((match) => match.id === completedSnapshot.id)).toEqual(completedSnapshot)
    expect(result.rounds[0].matches.some((match) => [...match.teamA, ...match.teamB].includes('newcomer'))).toBe(false)
    expect(result.rounds.slice(1).some((round) => round.matches.some((match) => [...match.teamA, ...match.teamB].includes('newcomer')))).toBe(true)
    expect(result.rounds.slice(1).every((round) => round.matches.every((match) => ![...match.teamA, ...match.teamB].includes(injuredId)))).toBe(true)

    const partners = new Set<string>()
    for (const round of result.rounds) {
      assertNoRepeatedPlayersInRound(round)
      for (const match of round.matches) {
        for (const key of partnershipKeys(match)) {
          expect(partners.has(key)).toBe(false)
          partners.add(key)
        }
      }
    }
  })

  it('blocks a recalculation while a match is in progress without changing the old schedule', () => {
    const players = makePlayers(8)
    const originalRounds = generateSchedule(players, 4, 2, 'doubles').rounds
    originalRounds[0].matches[0].status = 'inProgress'
    const snapshot = structuredClone(originalRounds)

    const result = recalculateSchedule(players, 4, 2, 'doubles', originalRounds, 0)

    expect(result.inProgressMatches).toHaveLength(1)
    expect(result.rounds).toEqual(snapshot)
  })

  it('keeps earlier pending rounds unchanged when a change starts later', () => {
    const players = makePlayers(8)
    const originalRounds = generateSchedule(players, 5, 1, 'doubles').rounds
    const prefix = structuredClone(originalRounds.slice(0, 2))
    const newcomer: Player = {
      id: 'joins-later',
      name: 'Nueva',
      isCaptain: false,
      availabilityChanges: [{ fromRound: 3, available: true, reason: 'joined' }]
    }

    const result = recalculateSchedule([...players, newcomer], 5, 1, 'doubles', originalRounds, 2)

    expect(result.rounds.slice(0, 2)).toEqual(prefix)
    expect(result.rounds.slice(0, 2).every((round) => round.matches.every((match) => ![...match.teamA, ...match.teamB].includes(newcomer.id)))).toBe(true)
    expect(result.rounds.slice(2).some((round) => round.matches.some((match) => [...match.teamA, ...match.teamB].includes(newcomer.id)))).toBe(true)
    const allPartners = new Set<string>()
    for (const round of result.rounds) {
      for (const match of round.matches) {
        for (const key of partnershipKeys(match)) {
          expect(allPartners.has(key)).toBe(false)
          allPartners.add(key)
        }
      }
    }
  })

  it('does not allocate new matches beyond the remaining court capacity of a partially completed round', () => {
    const players = makePlayers(8)
    const originalRounds = generateSchedule(players, 3, 2, 'doubles').rounds
    for (const match of originalRounds[0].matches) {
      match.status = 'completed'
      match.result = 'draw'
    }
    const result = recalculateSchedule(players, 3, 1, 'doubles', originalRounds, 0)

    expect(result.rounds[0].matches).toHaveLength(2)
    expect(result.rounds[0].matches.every((match) => match.status === 'completed')).toBe(true)
    expect(result.rounds.slice(1).every((round) => round.matches.length <= 1)).toBe(true)
  })

  it('keeps an interrupted match without a result and blocks its players for that round', () => {
    const players = makePlayers(8)
    const originalRounds = generateSchedule(players, 3, 2, 'doubles').rounds
    const interrupted = originalRounds[0].matches[0]
    interrupted.status = 'interrupted'
    interrupted.result = null
    const snapshot = structuredClone(interrupted)

    const result = recalculateSchedule(players, 3, 2, 'doubles', originalRounds, 0)

    expect(result.rounds[0].matches.find((match) => match.id === interrupted.id)).toEqual(snapshot)
    const lockedIds = new Set([...interrupted.teamA, ...interrupted.teamB])
    for (const match of result.rounds[0].matches.filter((item) => item.id !== interrupted.id)) {
      expect([...match.teamA, ...match.teamB].some((id) => lockedIds.has(id))).toBe(false)
    }
  })

  it('does not repeat singles duels after recalculation', () => {
    const players = makePlayers(6)
    const initial = generateSchedule(players, 5, 2, 'singles').rounds
    const completed = initial[0].matches[0]
    completed.status = 'completed'
    completed.result = 'draw'
    const snapshot = structuredClone(completed)
    const result = recalculateSchedule(players, 5, 2, 'singles', initial, 0)
    const duels = new Set<string>()

    expect(result.rounds[0].matches.find((match) => match.id === completed.id)).toEqual(snapshot)
    for (const round of result.rounds) {
      assertNoRepeatedPlayersInRound(round)
      for (const match of round.matches) {
        const key = [...match.teamA, ...match.teamB].sort().join('::')
        expect(duels.has(key)).toBe(false)
        duels.add(key)
      }
    }
  })

  it('awards points only for completed matches and keeps unavailable/new players in the table', () => {
    const players = makePlayers(5)
    const result = calculateStandings(players, [{
      id: 'round-1',
      matches: [
        { id: 'win', court: 1, teamA: ['p1'], teamB: ['p2'], result: 'teamA', status: 'completed' },
        { id: 'draw', court: 2, teamA: ['p3'], teamB: ['p4'], result: 'draw', status: 'completed' },
        { id: 'injury', court: 3, teamA: ['p1'], teamB: ['p3'], result: null, status: 'interrupted' },
        { id: 'pending', court: 4, teamA: ['p4'], teamB: ['p5'], result: 'teamB', status: 'scheduled' }
      ]
    }])
    const byId = new Map(result.map((row) => [row.player.id, row]))

    expect(byId.get('p1')).toMatchObject({ points: 3, played: 1, wins: 1 })
    expect(byId.get('p2')).toMatchObject({ points: 1, played: 1, losses: 1 })
    expect(byId.get('p3')).toMatchObject({ points: 2, played: 1, draws: 1 })
    expect(byId.get('p4')).toMatchObject({ points: 2, played: 1, draws: 1 })
    expect(byId.get('p5')).toMatchObject({ points: 0, played: 0 })
    expect(result).toHaveLength(players.length)
  })
})
