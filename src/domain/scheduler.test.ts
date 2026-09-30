import { describe, expect, it, vi } from 'vitest'
import {
  generateSchedule,
  isAvailableAtRound,
  reopenMatch,
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

function withRandomSeed<T>(seed: number, run: () => T): T {
  const random = vi.spyOn(Math, 'random')
  let state = seed >>> 0
  random.mockImplementation(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  })
  try {
    return run()
  } finally {
    random.mockRestore()
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
  it('reopens completed and interrupted matches as pending without changing their assignments', () => {
    const completed: Match = {
      id: 'completed-match',
      court: 2,
      teamA: ['p1', 'p2'],
      teamB: ['p3', 'p4'],
      result: 'teamA',
      status: 'completed'
    }
    const interrupted: Match = { ...completed, id: 'interrupted-match', result: null, status: 'interrupted' }

    expect(reopenMatch(completed)).toMatchObject({
      id: completed.id,
      court: completed.court,
      teamA: completed.teamA,
      teamB: completed.teamB,
      result: null,
      status: 'scheduled'
    })
    expect(reopenMatch(interrupted)).toMatchObject({
      id: interrupted.id,
      court: interrupted.court,
      teamA: interrupted.teamA,
      teamB: interrupted.teamB,
      result: null,
      status: 'scheduled'
    })
    expect(reopenMatch({ ...completed, status: 'scheduled', result: null })).toMatchObject({ status: 'scheduled', result: null })
    expect(completed).toMatchObject({ status: 'completed', result: 'teamA' })
    const players = makePlayers(4)
    const before = calculateStandings(players, [{ id: 'round-1', matches: [completed] }])
    const after = calculateStandings(players, [{ id: 'round-1', matches: [reopenMatch(completed)] }])
    expect(before.find((row) => row.player.id === 'p1')).toMatchObject({ points: 3, played: 1 })
    expect(after.find((row) => row.player.id === 'p1')).toMatchObject({ points: 0, played: 0 })
  })

  it('allows players from a reopened interrupted match to be scheduled again in that round', () => {
    const players = makePlayers(8)
    const originalRounds = generateSchedule(players, 3, 2, 'doubles').rounds
    const reopened = reopenMatch({ ...originalRounds[0].matches[0], status: 'interrupted', result: null })
    originalRounds[0].matches[0] = reopened

    const result = recalculateSchedule(players, 3, 2, 'doubles', originalRounds, 0)
    const firstRoundMatches = result.rounds[0].matches
    const playingIds = firstRoundMatches.flatMap((match) => [...match.teamA, ...match.teamB])

    expect(firstRoundMatches).toHaveLength(2)
    expect(firstRoundMatches.every((match) => match.status === 'scheduled')).toBe(true)
    expect(new Set(playingIds).size).toBe(players.length)
  })

  it('fills both courts, balances appearances and mixes matches with and without leaders', () => {
    const players = makePlayers(12, 4)
    for (const roundCount of [4, 5]) {
      for (const seed of [13, 404, 2026]) {
        const result = withRandomSeed(seed, () => generateSchedule(players, roundCount, 2, 'doubles'))
        const appearances = new Map(players.map((player) => [player.id, 0]))
        let sawMixedRound = false

        for (const round of result.rounds) {
          expect(round.matches).toHaveLength(2)
          assertNoRepeatedPlayersInRound(round)
          const headedMatches = round.matches.filter((match) => [...match.teamA, ...match.teamB].some((id) => players.find((player) => player.id === id)?.isCaptain)).length
          if (headedMatches > 0 && headedMatches < round.matches.length) sawMixedRound = true
          for (const match of round.matches) {
            const captainsA = match.teamA.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
            const captainsB = match.teamB.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
            expect(captainsA).toBe(captainsB)
            for (const id of [...match.teamA, ...match.teamB]) appearances.set(id, (appearances.get(id) ?? 0) + 1)
          }
        }

        expect(sawMixedRound).toBe(true)
        expect(Math.max(...appearances.values()) - Math.min(...appearances.values())).toBeLessThanOrEqual(1)
        const leaderAverage = players.filter((player) => player.isCaptain).reduce((total, player) => total + appearances.get(player.id)!, 0) / 4
        const otherAverage = players.filter((player) => !player.isCaptain).reduce((total, player) => total + appearances.get(player.id)!, 0) / 8
        expect(Math.abs(leaderAverage - otherAverage)).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('keeps leaders and other players balanced over 16 rounds with 12 participants', () => {
    const players = makePlayers(12, 4)
    for (const seed of [13, 404, 2026]) {
      const result = withRandomSeed(seed, () => generateSchedule(players, 16, 2, 'doubles', 'optional'))
      const appearances = new Map(players.map((player) => [player.id, 0]))
      expect(result.rounds).toHaveLength(16)
      expect(result.rounds.every((round) => round.matches.length === 2)).toBe(true)
      for (const match of result.rounds.flatMap((round) => round.matches)) {
        for (const id of [...match.teamA, ...match.teamB]) appearances.set(id, (appearances.get(id) ?? 0) + 1)
      }
      const counts = Object.fromEntries(appearances)
      const leaderAverage = players.filter((player) => player.isCaptain).reduce((total, player) => total + appearances.get(player.id)!, 0) / 4
      const otherAverage = players.filter((player) => !player.isCaptain).reduce((total, player) => total + appearances.get(player.id)!, 0) / 8
      expect(Math.max(...appearances.values()) - Math.min(...appearances.values()), JSON.stringify(counts)).toBeLessThanOrEqual(1)
      expect(Math.abs(leaderAverage - otherAverage), JSON.stringify(counts)).toBeLessThanOrEqual(0.5)
    }
  })

  it('fills every compatible doubles court even when a round mixes headed and headless matches', () => {
    const players = makePlayers(12, 4)
    const result = generateSchedule(players, 3, 3, 'doubles', 'optional')

    for (const round of result.rounds) {
      expect(round.matches).toHaveLength(3)
      for (const match of round.matches) {
        const captainsA = match.teamA.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
        const captainsB = match.teamB.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
        expect(captainsA).toBe(captainsB)
      }
    }
  })

  it('requires one captain in each team of every doubles match when the strict policy is selected', () => {
    const players = makePlayers(12, 4)
    const result = generateSchedule(players, 4, 3, 'doubles', 'required')

    for (const round of result.rounds) {
      expect(round.matches).toHaveLength(2)
      for (const match of round.matches) {
        expect(match.teamA.filter((id) => players.find((player) => player.id === id)?.isCaptain)).toHaveLength(1)
        expect(match.teamB.filter((id) => players.find((player) => player.id === id)?.isCaptain)).toHaveLength(1)
      }
    }
  })

  it('allows headless doubles matches but never mixes a headed team with a headless team', () => {
    const players = makePlayers(10, 3)
    const result = generateSchedule(players, 3, 2, 'doubles')

    for (const round of result.rounds) {
      expect(round.matches).toHaveLength(2)
      for (const match of round.matches) {
        const captainsA = match.teamA.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
        const captainsB = match.teamB.filter((id) => players.find((player) => player.id === id)?.isCaptain).length
        expect(captainsA).toBe(captainsB)
      }
    }
    expect(result.rounds.flatMap((round) => round.matches).some((match) =>
      [...match.teamA, ...match.teamB].every((id) => !players.find((player) => player.id === id)?.isCaptain)
    )).toBe(true)
  })

  it('requires head-to-head singles matches under the strict policy', () => {
    const players = makePlayers(8, 4)
    const result = generateSchedule(players, 5, 1, 'singles', 'required')

    expect(result.rounds.every((round) => round.matches.length === 1)).toBe(true)
    for (const match of result.rounds.flatMap((round) => round.matches)) {
      expect(match.teamA.every((id) => players.find((player) => player.id === id)?.isCaptain)).toBe(true)
      expect(match.teamB.every((id) => players.find((player) => player.id === id)?.isCaptain)).toBe(true)
    }
  })

  it('chooses singles pairs that leave a valid duel for the second free court', () => {
    const players = makePlayers(4)
    const completedDuel = (id: string, first: string, second: string): Match => ({
      id,
      court: 1,
      teamA: [first],
      teamB: [second],
      result: 'teamA',
      status: 'completed'
    })
    const history: Round[] = [
      { id: 'round-1', matches: [completedDuel('r1', 'p1', 'p4')] },
      { id: 'round-2', matches: [completedDuel('r2', 'p2', 'p3')] },
      { id: 'round-3', matches: [completedDuel('r3', 'p2', 'p4')] }
    ]

    const result = recalculateSchedule(players, 4, 2, 'singles', history, 3)

    expect(result.rounds[3].matches).toHaveLength(2)
    expect(result.rounds[3].matches.every((match) => match.status === 'scheduled')).toBe(true)
    assertNoRepeatedPlayersInRound(result.rounds[3])
  })

  it('covers every possible doubles partnership when five players have enough rounds for full coverage', () => {
    const players = makePlayers(5)
    for (const seed of [1, 7, 42, 2026, 65537]) {
      const result = withRandomSeed(seed, () => generateSchedule(players, 5, 1, 'doubles'))
      const partnerships = new Set(result.rounds.flatMap((round) => round.matches.flatMap(partnershipKeys)))

      expect(result.generatedMatches).toBe(5)
      expect(partnerships.size).toBe(10)
      for (const player of players) {
        const partners = new Set([...partnerships].filter((pair) => pair.split('::').includes(player.id)))
        expect(partners.size).toBe(players.length - 1)
      }
    }
  })

  it('repeats a partnership only after every compatible partnership has been used', () => {
    const result = generateSchedule(makePlayers(4), 4, 1, 'doubles')
    const partnerships = result.rounds.flatMap((round) => round.matches.flatMap(partnershipKeys))

    expect(result.generatedMatches).toBe(4)
    expect(new Set(partnerships).size).toBe(6)
    expect(partnerships).toHaveLength(8)
  })

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
