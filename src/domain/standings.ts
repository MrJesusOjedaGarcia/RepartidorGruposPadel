import type { Player, Round } from './scheduler'

export interface Standing {
  player: Player
  points: number
  played: number
  wins: number
  draws: number
  losses: number
}

export function calculateStandings(players: Player[], rounds: Round[]): Standing[] {
  const table = new Map(players.map((player) => [player.id, { player, points: 0, played: 0, wins: 0, draws: 0, losses: 0 }]))
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.status !== 'completed' || !match.result) continue
      const scores = match.result === 'draw'
        ? [2, 2]
        : match.result === 'teamA' ? [3, 1] : [1, 3]
      ;[match.teamA, match.teamB].forEach((team, teamIndex) => {
        team.forEach((id) => {
          const row = table.get(id)
          if (!row) return
          row.points += scores[teamIndex]
          row.played += 1
          if (match.result === 'draw') row.draws += 1
          else if ((match.result === 'teamA' && teamIndex === 0) || (match.result === 'teamB' && teamIndex === 1)) row.wins += 1
          else row.losses += 1
        })
      })
    }
  }
  return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.player.name.localeCompare(b.player.name, 'es'))
}
