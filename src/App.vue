<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  generateSchedule,
  isAvailableAtRound,
  recalculateSchedule,
  reopenMatch as reopenMatchState,
  withAvailabilityChange,
  type CaptainPolicy,
  type AvailabilityChange,
  type Match,
  type MatchMode,
  type Player,
  type Round,
  type ScheduleResult
} from './domain/scheduler'
import { calculateStandings } from './domain/standings'
import packageMetadata from '../package.json'

interface StoredApp {
  schemaVersion: number
  players: Player[]
  rounds: Round[]
  roundCount: number
  courtCount: number
  mode: MatchMode
  captainPolicy?: CaptainPolicy
}

interface RecalculationProposal {
  title: string
  players: Player[]
  schedule: ScheduleResult
  effectiveRound: number
  targetRoundCount: number
}

interface AvailabilityDialog {
  playerId: string
}

const STORAGE_KEY = 'repartidor-padel-v2'
const TUTORIAL_STORAGE_KEY = 'repartidor-padel-tutorial-v1'
const appVersion = packageMetadata.version
const publicBase = import.meta.env.BASE_URL
const LEGACY_STORAGE_KEY = 'repartidor-padel-v1'
const players = ref<Player[]>([])
const rounds = ref<Round[]>([])
const roundCount = ref(5)
const courtCount = ref(2)
const mode = ref<MatchMode>('doubles')
const captainPolicy = ref<CaptainPolicy>('optional')
const newPlayerName = ref('')
const joiningRound = ref(1)
const activeView = ref<'setup' | 'matches' | 'standings'>('setup')
const notice = ref('')
const storageReady = ref(false)
const availabilityDialog = ref<AvailabilityDialog | null>(null)
const availabilityEffectiveRound = ref(1)
const availabilityTarget = ref<'available' | 'unavailable'>('unavailable')
const recalculationProposal = ref<RecalculationProposal | null>(null)
const tutorialOpen = ref(false)
const tutorialStep = ref(0)
const tutorialTrigger = ref<HTMLButtonElement | null>(null)
const tutorialCloseButton = ref<HTMLButtonElement | null>(null)
const tutorialSteps = [
  {
    icon: '＋',
    eyebrow: 'PRIMERO, EL GRUPO',
    title: 'Prepara quién juega.',
    description: 'Añade a las personas, elige dobles o individual y ajusta las jornadas, pistas y regla de jugadores líderes.',
    tip: 'Puedes permitir jornadas con pistas con y sin líderes, o exigir uno en cada equipo. Nunca jugará un líder contra un equipo sin líderes.'
  },
  {
    icon: '↗',
    eyebrow: 'DESPUÉS, A REPARTIR',
    title: 'Genera las jornadas.',
    description: 'Pulsa «Generar jornadas» y la aplicación intentará ocupar todas las pistas y equilibrar el número de partidos, aunque tengas que jugar jornadas seguidas.',
    tip: 'Busca compañeros nuevos y cruces variados; puede repetir pareja si eso ayuda a igualar los partidos.'
  },
  {
    icon: '3',
    eyebrow: 'AL TERMINAR CADA PARTIDO',
    title: 'Anota el resultado.',
    description: 'Abre «Las jornadas», elige la jornada y marca si gana el equipo A, hay empate o gana el equipo B.',
    tip: 'Cada participante suma 3 puntos por ganar, 2 por empatar y 1 por perder. La clasificación se actualiza sola.'
  },
  {
    icon: '↻',
    eyebrow: 'SI EL GRUPO CAMBIA',
    title: 'Recalcula lo pendiente.',
    description: 'Si alguien se lesiona o se incorpora alguien nuevo, indica desde qué jornada cambia la disponibilidad y revisa la propuesta.',
    tip: 'Los resultados finalizados se conservan. Tus datos se guardan solo en este dispositivo.'
  }
]
let removeViewportListeners = () => {}

function syncVisualViewportHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`)
}

const playerNames = computed(() => new Map(players.value.map((player) => [player.id, player.name])))
const leaderIds = computed(() => new Set(players.value.filter((player) => player.isCaptain).map((player) => player.id)))
const finishedMatches = computed(() => rounds.value.flatMap((round) => round.matches).filter((match) => match.status === 'completed' && match.result !== null).length)
const closedMatches = computed(() => rounds.value.flatMap((round) => round.matches).filter((match) => match.status === 'completed' || match.status === 'interrupted').length)
const totalMatches = computed(() => rounds.value.reduce((total, round) => total + round.matches.length, 0))
const firstEditableRoundIndex = computed(() => findFirstEditableRoundIndex(rounds.value))
const firstEditableRound = computed(() => firstEditableRoundIndex.value + 1)
const maxEditableRound = computed(() => Math.min(60, Math.max(roundCount.value, rounds.value.length + 1, firstEditableRound.value)))
const roundChoices = computed(() => Array.from(
  { length: Math.max(1, maxEditableRound.value - firstEditableRound.value + 1) },
  (_, index) => firstEditableRound.value + index
))
const canGenerateWithPlayers = computed(() => {
  const minimum = mode.value === 'doubles' ? 4 : 2
  const horizon = Math.max(1, Math.min(60, roundCount.value))
  return Array.from({ length: horizon }, (_, index) => index + 1)
    .some((round) => players.value.filter((player) => isAvailableAtRound(player, round)).length >= minimum)
})
const canGenerate = computed(() => {
  const minimum = mode.value === 'doubles' ? 4 : 2
  const horizon = Math.max(1, Math.min(60, roundCount.value))
  return Array.from({ length: horizon }, (_, index) => index + 1).some((round) => {
    const available = players.value.filter((player) => isAvailableAtRound(player, round))
    return available.length >= minimum && (captainPolicy.value === 'optional' || available.filter((player) => player.isCaptain).length >= 2)
  })
})
const standings = computed(() => calculateStandings(players.value, rounds.value))

const activeRoundIndex = ref(0)
const roundsCompleted = computed(() => rounds.value.filter((round) => round.matches.length > 0 && round.matches.every((match) => isTerminal(match))).length)

function isTerminal(match: Match) {
  return match.status === 'completed' || match.status === 'interrupted'
}

function findFirstEditableRoundIndex(schedule: Round[]) {
  const index = schedule.findIndex((round) => round.matches.length === 0 || round.matches.some((match) => !isTerminal(match)))
  return index < 0 ? schedule.length : index
}

function normalizePlayer(player: Player): Player {
  return {
    ...player,
    isCaptain: Boolean(player.isCaptain),
    availabilityChanges: Array.isArray(player.availabilityChanges) ? player.availabilityChanges : []
  }
}

function normalizeRound(round: Round, index: number): Round {
  return {
    id: round.id || `round-${index + 1}`,
    matches: Array.isArray(round.matches) ? round.matches.map((match) => {
      const raw = match as Match & { status?: Match['status'] }
      const status = raw.status === 'scheduled' || raw.status === 'inProgress' || raw.status === 'completed' || raw.status === 'interrupted'
        ? raw.status
        : raw.result ? 'completed' : 'scheduled'
      return { ...raw, status, result: raw.result ?? null, teamA: raw.teamA ?? [], teamB: raw.teamB ?? [] }
    }) : []
  }
}

onMounted(() => {
  syncVisualViewportHeight()
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', syncVisualViewportHeight)
  window.addEventListener('resize', syncVisualViewportHeight)
  window.addEventListener('orientationchange', syncVisualViewportHeight)
  removeViewportListeners = () => {
    viewport?.removeEventListener('resize', syncVisualViewportHeight)
    window.removeEventListener('resize', syncVisualViewportHeight)
    window.removeEventListener('orientationchange', syncVisualViewportHeight)
  }
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const saved = current ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!saved) return
    const data = JSON.parse(saved) as Partial<StoredApp>
    if (Array.isArray(data.players)) players.value = data.players.map(normalizePlayer)
    if (Array.isArray(data.rounds)) rounds.value = data.rounds.map(normalizeRound)
    if (typeof data.roundCount === 'number' && Number.isFinite(data.roundCount)) roundCount.value = data.roundCount
    if (typeof data.courtCount === 'number' && Number.isFinite(data.courtCount)) courtCount.value = data.courtCount
    if (data.mode === 'singles' || data.mode === 'doubles') mode.value = data.mode
    if (data.captainPolicy === 'optional' || data.captainPolicy === 'required') captainPolicy.value = data.captainPolicy
    const currentRound = findFirstEditableRoundIndex(rounds.value)
    activeRoundIndex.value = currentRound >= rounds.value.length ? Math.max(0, rounds.value.length - 1) : currentRound
    if (rounds.value.length) activeView.value = 'matches'
    if (!current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          schemaVersion: 2,
          players: players.value,
          rounds: rounds.value,
          roundCount: roundCount.value,
          courtCount: courtCount.value,
          mode: mode.value,
          captainPolicy: captainPolicy.value
        } satisfies StoredApp))
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        // Keep the v1 copy if storage cannot accept the migrated data yet.
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } finally {
    storageReady.value = true
    try {
      if (localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'completed') tutorialOpen.value = true
    } catch {
      tutorialOpen.value = true
    }
  }
})

onBeforeUnmount(() => removeViewportListeners())

watch([players, rounds, roundCount, courtCount, mode, captainPolicy], () => {
  if (!storageReady.value) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: 2,
    players: players.value,
    rounds: rounds.value,
    roundCount: roundCount.value,
    courtCount: courtCount.value,
    mode: mode.value,
    captainPolicy: captainPolicy.value
  } satisfies StoredApp))
}, { deep: true })

watch(tutorialOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  tutorialCloseButton.value?.focus()
})

const currentTutorialStep = computed(() => tutorialSteps[tutorialStep.value])

function openTutorial() {
  tutorialStep.value = 0
  tutorialOpen.value = true
}

function closeTutorial() {
  tutorialOpen.value = false
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'completed')
  } catch {
    // The tutorial remains available from the help button if storage is unavailable.
  }
  nextTick(() => tutorialTrigger.value?.focus())
}

function advanceTutorial() {
  if (tutorialStep.value === tutorialSteps.length - 1) {
    closeTutorial()
    return
  }
  tutorialStep.value += 1
}

function handleTutorialKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeTutorial()
    return
  }
  if (event.key !== 'Tab') return

  const dialog = event.currentTarget as HTMLElement
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

watch(firstEditableRound, (round) => {
  if (joiningRound.value < round) joiningRound.value = Math.min(round, maxEditableRound.value)
})

function addPlayer() {
  const name = newPlayerName.value.trim()
  if (!name) return
  if (players.value.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    notice.value = 'Ese nombre ya está en la lista.'
    return
  }
  const effectiveRound = rounds.value.length ? Math.max(firstEditableRound.value, joiningRound.value) : 1
  const player: Player = {
    id: crypto.randomUUID(),
    name,
    isCaptain: false,
    availabilityChanges: rounds.value.length
      ? [{ fromRound: effectiveRound, available: true, reason: 'joined' }]
      : []
  }
  if (rounds.value.length) {
    prepareRecalculation([...players.value, player], effectiveRound, `Incorporar a ${name}`)
  } else {
    players.value.push(player)
    newPlayerName.value = ''
  }
  notice.value = ''
}

function removePlayer(id: string) {
  if (rounds.value.length) {
    notice.value = 'Durante un torneo, marca a la persona como no disponible para conservar su historial.'
    return
  }
  players.value = players.value.filter((player) => player.id !== id)
}

function removeAllPlayers() {
  if (!players.value.length) return
  const target = players.value.length === 1 ? 'al único jugador' : 'a todos los jugadores'
  const confirmation = rounds.value.length
    ? `¿Quieres eliminar ${target} del grupo? También se borrarán todas las jornadas y resultados. Esta acción no se puede deshacer.`
    : `¿Quieres eliminar ${target} del grupo?`
  if (!window.confirm(confirmation)) return

  players.value = []
  rounds.value = []
  activeRoundIndex.value = 0
  activeView.value = 'setup'
  newPlayerName.value = ''
  joiningRound.value = 1
  availabilityDialog.value = null
  recalculationProposal.value = null
  notice.value = 'Se eliminó el grupo de jugadores.'
}

function generate() {
  const safeRoundCount = Math.max(1, Math.min(60, Math.floor(Number(roundCount.value) || 1)))
  const safeCourtCount = Math.max(1, Math.min(12, Math.floor(Number(courtCount.value) || 1)))
  roundCount.value = safeRoundCount
  courtCount.value = safeCourtCount

  if (!rounds.value.length && !canGenerate.value) {
    if (captainPolicy.value === 'required' && canGenerateWithPlayers.value) {
      notice.value = 'Has elegido jugadores líderes en todos los partidos. Marca al menos dos líderes disponibles desde la misma jornada.'
    } else {
      notice.value = mode.value === 'doubles' ? 'Añade al menos 4 jugadores para los partidos 2 × 2.' : 'Añade al menos 2 jugadores para los partidos 1 × 1.'
    }
    return
  }
  if (rounds.value.length) {
    prepareRecalculation(players.value, firstEditableRound.value, 'Repartir partidos pendientes')
    return
  }
  rounds.value = generateSchedule(players.value, safeRoundCount, safeCourtCount, mode.value, captainPolicy.value).rounds
  activeRoundIndex.value = Math.min(firstEditableRoundIndex.value, Math.max(0, rounds.value.length - 1))
  activeView.value = 'matches'
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function setResult(match: Match, result: NonNullable<Match['result']>) {
  if (match.status === 'interrupted') return
  match.result = result
  match.status = 'completed'
}

function startMatch(match: Match) {
  if (match.status === 'scheduled') match.status = 'inProgress'
}

function interruptMatch(match: Match) {
  if (match.status !== 'inProgress') return
  match.result = null
  match.status = 'interrupted'
  notice.value = 'Partido marcado como interrumpido. No suma puntos y sus participantes descansan el resto de esta jornada.'
}

function resetMatch(match: Match) {
  if (match.status !== 'completed' && match.status !== 'interrupted') return
  const completed = match.status === 'completed'
  const confirmation = completed
    ? '¿Quieres reabrir este partido? Se borrará el resultado y dejará de sumar puntos hasta que vuelvas a cerrarlo.'
    : '¿Quieres reiniciar este partido interrumpido? Volverá a quedar pendiente para poder jugarlo o registrar su resultado.'
  if (!window.confirm(confirmation)) return
  Object.assign(match, reopenMatchState(match))
  notice.value = 'Partido reabierto; vuelve a estar pendiente.'
}

function openAvailabilityDialog(player: Player) {
  const effectiveRound = Math.min(maxEditableRound.value, Math.max(firstEditableRound.value, 1))
  availabilityDialog.value = { playerId: player.id }
  availabilityEffectiveRound.value = effectiveRound
  availabilityTarget.value = isAvailableAtRound(player, effectiveRound) ? 'unavailable' : 'available'
  notice.value = ''
}

function prepareAvailabilityChange() {
  const dialog = availabilityDialog.value
  if (!dialog) return
  const player = players.value.find((item) => item.id === dialog.playerId)
  if (!player) return
  const available = availabilityTarget.value === 'available'
  const change: AvailabilityChange = {
    fromRound: availabilityEffectiveRound.value,
    available,
    reason: available ? 'return' : 'injury'
  }
  const proposedPlayers = players.value.map((item) => item.id === player.id ? withAvailabilityChange(item, change) : item)
  availabilityDialog.value = null
  if (rounds.value.length) {
    prepareRecalculation(proposedPlayers, change.fromRound, available ? `Reincorporar a ${player.name}` : `Dar de baja a ${player.name}`)
  } else {
    players.value = proposedPlayers
    notice.value = `${player.name}: disponibilidad actualizada desde la jornada ${change.fromRound}.`
  }
}

function prepareRecalculation(proposedPlayers: Player[], effectiveRound: number, title: string) {
  const safeRound = Math.max(1, Math.floor(effectiveRound))
  const targetRoundCount = Math.min(60, Math.max(roundCount.value, rounds.value.length, safeRound))
  const schedule = recalculateSchedule(proposedPlayers, targetRoundCount, courtCount.value, mode.value, rounds.value, safeRound - 1, captainPolicy.value)
  recalculationProposal.value = { title, players: proposedPlayers, schedule, effectiveRound: safeRound, targetRoundCount }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelRecalculation() {
  recalculationProposal.value = null
}

function confirmRecalculation() {
  const proposal = recalculationProposal.value
  if (!proposal || proposal.schedule.inProgressMatches.length) return
  players.value = proposal.players
  rounds.value = proposal.schedule.rounds
  roundCount.value = proposal.targetRoundCount
  if (proposal.title.startsWith('Incorporar a ')) newPlayerName.value = ''
  const nextRound = findFirstEditableRoundIndex(rounds.value)
  activeRoundIndex.value = nextRound >= rounds.value.length ? Math.max(0, rounds.value.length - 1) : nextRound
  recalculationProposal.value = null
  availabilityDialog.value = null
  activeView.value = 'matches'
  notice.value = proposal.schedule.skippedCourts
    ? `Calendario actualizado. ${proposal.schedule.skippedCourts} pista(s) quedarán libre(s) por falta de cruces compatibles.`
    : 'Calendario actualizado; los resultados guardados se han conservado.'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function proposalRows(proposal: RecalculationProposal) {
  return proposal.players.map((player) => {
    const projected = proposal.schedule.rounds.reduce((total, round) => total + round.matches.filter((match) => {
      const isCounted = (match.status === 'completed' && match.result !== null) || match.status === 'scheduled' || match.status === 'inProgress'
      return isCounted && [...match.teamA, ...match.teamB].includes(player.id)
    }).length, 0)
    return { player, projected, available: isAvailableAtRound(player, proposal.effectiveRound) }
  }).sort((a, b) => a.projected - b.projected || a.player.name.localeCompare(b.player.name, 'es'))
}

function availabilityLabel(player: Player) {
  const activeRound = Math.max(1, Math.min(rounds.value.length || roundCount.value, activeRoundIndex.value + 1))
  if (isAvailableAtRound(player, activeRound)) return 'DISPONIBLE'
  const changes = player.availabilityChanges ?? []
  const latestChange = [...changes].filter((change) => change.fromRound <= activeRound).sort((a, b) => b.fromRound - a.fromRound)[0]
  if (!latestChange) {
    const futureJoin = changes.find((change) => change.available && change.reason === 'joined')
    return futureJoin ? `ALTA J${futureJoin.fromRound.toString().padStart(2, '0')}` : 'NO DISPONIBLE'
  }
  return latestChange.reason === 'joined' ? `ALTA J${latestChange.fromRound.toString().padStart(2, '0')}` : `BAJA J${latestChange.fromRound.toString().padStart(2, '0')}`
}

function availabilityAction(player: Player) {
  return isAvailableAtRound(player, Math.max(1, firstEditableRound.value)) ? 'LESIÓN / BAJA' : 'REINCORPORAR'
}

function getResultText(result: Match['result']) {
  if (result === 'teamA') return 'Gana equipo A'
  if (result === 'teamB') return 'Gana equipo B'
  if (result === 'draw') return 'Empate'
  return 'Pendiente'
}

function matchStatusText(match: Match) {
  if (match.status === 'interrupted') return 'Partido interrumpido · sin puntos'
  if (match.status === 'inProgress') return 'Partido en juego'
  if (match.status === 'completed') return getResultText(match.result)
  return 'Pendiente'
}

function playerNamesFor(ids: string[]) {
  return ids.map((id) => playerNames.value.get(id) ?? 'Jugador').join(' · ')
}

function playerNameFor(id: string) {
  return playerNames.value.get(id) ?? 'Jugador'
}

function exportStandings() {
  const canvas = document.createElement('canvas')
  const width = 1200
  const rowHeight = 78
  canvas.width = width
  canvas.height = 310 + Math.max(standings.value.length, 1) * rowHeight
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#f5f3ed'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#153b34'
  context.beginPath()
  context.roundRect(38, 34, width - 76, 210, 28)
  context.fill()
  context.fillStyle = '#f7f5ee'
  context.font = '700 24px Arial, sans-serif'
  context.fillText('REPARTIDOR  ·  PÁDEL EN BUENA COMPAÑÍA', 76, 88)
  context.font = '700 48px Arial, sans-serif'
  context.fillText('Clasificación del grupo', 76, 153)
  context.fillStyle = '#c5d0a6'
  context.font = '20px Arial, sans-serif'
  context.fillText(`${rounds.value.length} jornadas  ·  ${finishedMatches.value} partidos jugados`, 76, 199)

  const top = 282
  context.fillStyle = '#778078'
  context.font = '700 17px Arial, sans-serif'
  context.fillText('#', 78, top)
  context.fillText('JUGADOR', 148, top)
  context.fillText('PJ', 765, top)
  context.fillText('G', 870, top)
  context.fillText('E', 950, top)
  context.fillText('P', 1030, top)
  context.fillText('PTS', 1090, top)

  standings.value.forEach((row, index) => {
    const y = top + 25 + index * rowHeight
    context.fillStyle = index % 2 === 0 ? '#fffefa' : '#ecebe3'
    context.beginPath()
    context.roundRect(58, y, width - 116, rowHeight - 8, 15)
    context.fill()
    context.fillStyle = index === 0 ? '#dd7959' : '#153b34'
    context.font = '700 22px Arial, sans-serif'
    context.fillText(String(index + 1).padStart(2, '0'), 78, y + 37)
    context.fillStyle = '#172b27'
    context.font = '700 23px Arial, sans-serif'
    context.fillText(row.player.name.slice(0, 35), 148, y + 37)
    context.font = '20px Arial, sans-serif'
    context.fillStyle = '#65716b'
    context.fillText(String(row.played), 765, y + 37)
    context.fillText(String(row.wins), 870, y + 37)
    context.fillText(String(row.draws), 950, y + 37)
    context.fillText(String(row.losses), 1030, y + 37)
    context.fillStyle = '#153b34'
    context.font = '700 25px Arial, sans-serif'
    context.fillText(String(row.points), 1090, y + 37)
  })

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'clasificacion-padel.png'
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function resetTournament() {
  if (!window.confirm('¿Quieres borrar las jornadas y los resultados? Se conservarán los jugadores.')) return
  rounds.value = []
  players.value = players.value.map((player) => ({ ...player, availabilityChanges: [] }))
  activeView.value = 'setup'
  notice.value = ''
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#inicio" aria-label="Repartidor, inicio" @click.prevent="activeView = 'setup'">
        <img :src="`${publicBase}padel.svg`" alt="" class="brand-mark" />
        <span class="brand-word">repartidor<span class="brand-period">.</span><small>PADEL EN BUENA COMPAÑÍA</small></span>
      </a>
      <div class="topbar-right">
        <span class="offline-tag"><span></span> GUARDADO EN ESTE DISPOSITIVO</span>
        <span class="version-tag" :aria-label="`Versión ${appVersion}`">v{{ appVersion }}</span>
        <button ref="tutorialTrigger" class="icon-button tutorial-trigger" type="button" aria-label="Abrir tutorial de uso" title="Tutorial y ayuda" @click="openTutorial">?</button>
        <button v-if="rounds.length" class="icon-button" type="button" aria-label="Reiniciar torneo" title="Borrar jornadas y resultados" @click="resetTournament">↻</button>
      </div>
    </header>

    <main class="main-content">
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span>✳</span> MENOS ORGANIZAR, MÁS JUGAR</div>
          <h1>Que las parejas<br />las decida <em>la pista.</em></h1>
          <p>Organiza las jornadas, mezcla el grupo y deja que empiece el partido. El buen rollo ya lo pones tú.</p>
          <div class="hero-details"><span>01 — Reparte</span><i></i><span>02 — Juega</span><i></i><span>03 — Celebra</span></div>
        </div>
        <div class="hero-art" aria-label="Ilustración de una pista de pádel" role="img">
          <div class="sun"></div><div class="art-label">BUEN<br />PARTIDO<span>!</span></div>
          <svg viewBox="0 0 470 280" class="court-art" aria-hidden="true">
            <path d="M42 72h298v158H42z" fill="none" stroke="currentColor" stroke-width="4" />
            <path d="M191 72v158M42 151h298M92 72v79m198-79v79M92 151v79m198-79v79" fill="none" stroke="currentColor" stroke-width="2" opacity=".72" />
            <path d="M0 229h470" fill="none" stroke="currentColor" stroke-width="3" />
            <path d="M213 148h60" fill="none" stroke="#f3bd74" stroke-width="6" stroke-linecap="round" />
            <circle cx="300" cy="114" r="9" fill="#f3bd74" />
            <path d="M305 126l-15 35 25 22m-25-22-31 15m25-50-21 12-18-2m45 47 3 31m-3-31 22 25" fill="none" stroke="#f5eee0" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M267 111l-29 14 13 21 28-14z" fill="#dd7959" stroke="#f5eee0" stroke-width="3" />
            <path d="M0 47l92 25M340 72l130-46" fill="none" stroke="currentColor" stroke-width="2" opacity=".28" />
          </svg>
          <span class="court-stamp">JUEGA<br />A TU<br />MANERA</span>
          <div class="art-bottom"><span>●</span> TODO LISTO PARA EL PRÓXIMO SET</div>
        </div>
      </section>

      <nav class="view-tabs" aria-label="Secciones de la aplicación">
        <button :class="{ selected: activeView === 'setup' }" type="button" @click="activeView = 'setup'"><span class="tab-num">01</span> EL GRUPO</button>
        <button :class="{ selected: activeView === 'matches' }" type="button" :disabled="!rounds.length" @click="activeView = 'matches'"><span class="tab-num">02</span> LAS JORNADAS <span v-if="rounds.length" class="tab-count">{{ rounds.length }}</span></button>
        <button :class="{ selected: activeView === 'standings' }" type="button" :disabled="!rounds.length" @click="activeView = 'standings'"><span class="tab-num">03</span> CLASIFICACIÓN</button>
      </nav>

      <section v-if="activeView === 'setup'" class="workspace setup-view">
        <div class="section-heading"><div><span class="section-kicker">01 / CONFIGURACIÓN</span><h2>Prepara el partido.</h2><p>Primero, el equipo. Después nos ocupamos del resto.</p></div><div class="heading-doodle">✳</div></div>

        <div class="setup-grid">
          <article class="panel players-panel">
            <div class="panel-heading"><div class="panel-number">A</div><div><h3>¿Quién viene a jugar?</h3><p>Añade a toda la cuadrilla.</p></div><span class="player-count">{{ players.length.toString().padStart(2, '0') }} <small>JUG.</small></span></div>
            <form class="add-player" @submit.prevent="addPlayer"><label class="sr-only" for="player-name">Nombre del jugador</label><input id="player-name" v-model="newPlayerName" maxlength="28" placeholder="Escribe un nombre…" autocomplete="off" /><button type="submit" aria-label="Añadir jugador">+</button></form>
            <label v-if="rounds.length" class="join-round-field" for="joining-round">DISPONIBLE DESDE <select id="joining-round" v-model.number="joiningRound"><option v-for="round in roundChoices" :key="round" :value="round">Jornada {{ round.toString().padStart(2, '0') }}</option></select></label>
            <div v-if="players.length" class="player-list" aria-label="Lista de jugadores">
              <div v-for="(player, index) in players" :key="player.id" class="player-row">
                <span class="player-index">{{ (index + 1).toString().padStart(2, '0') }}</span><span class="player-name">{{ player.name }}</span>
                <span v-if="rounds.length" class="availability-pill" :class="{ unavailable: !isAvailableAtRound(player, Math.max(1, activeRoundIndex + 1)) }">{{ availabilityLabel(player) }}</span>
                <button type="button" class="captain-toggle" :class="{ captain: player.isCaptain }" :aria-pressed="player.isCaptain" :disabled="rounds.length > 0" :title="rounds.length ? 'El rol de jugador líder queda fijado durante el torneo' : player.isCaptain ? 'Quitar jugador líder' : 'Marcar como jugador líder'" @click="player.isCaptain = !player.isCaptain"><span>✳</span> {{ player.isCaptain ? 'JUGADOR LÍDER' : 'MARCAR JUGADOR LÍDER' }}</button>
                <button v-if="rounds.length" type="button" class="availability-action" @click="openAvailabilityDialog(player)">{{ availabilityAction(player) }}</button>
                <button v-else type="button" class="remove-player" :aria-label="`Eliminar a ${player.name}`" @click="removePlayer(player.id)">×</button>
              </div>
            </div>
            <div v-else class="empty-players"><span>＋</span><p>Tu lista empieza con un nombre.<br /><small>Los jugadores líderes se reparten entre ambos equipos.</small></p></div>
            <button v-if="players.length" type="button" class="clear-players-button" aria-label="Eliminar todos los jugadores" @click="removeAllPlayers">× ELIMINAR TODOS LOS JUGADORES</button>
            <div class="panel-footnote"><span class="footnote-star">✳</span><span>Marca a los jugadores líderes. En 2 × 2 habrá uno en cada equipo.</span></div>
          </article>

          <div class="settings-column">
            <article class="panel settings-panel">
              <div class="panel-heading"><div class="panel-number">B</div><div><h3>El plan de juego</h3><p>Tú pones los límites.</p></div></div>
              <fieldset class="mode-field"><legend>FORMATO DEL PARTIDO</legend><div class="segmented-control"><button type="button" :disabled="rounds.length > 0" :class="{ chosen: mode === 'doubles' }" @click="mode = 'doubles'"><span>2 × 2</span><small>Dobles</small></button><button type="button" :disabled="rounds.length > 0" :class="{ chosen: mode === 'singles' }" @click="mode = 'singles'"><span>1 × 1</span><small>Individual</small></button></div></fieldset>
              <label class="captain-policy-field" for="captain-policy"><span>REGLA DE JUGADORES LÍDERES</span><select id="captain-policy" v-model="captainPolicy" :disabled="rounds.length > 0"><option value="optional">Permitir jornadas sin líderes</option><option value="required">Líderes en todos los partidos</option></select><small v-if="rounds.length">La regla queda fijada durante el torneo.</small><small v-else-if="captainPolicy === 'optional'">Cada jornada puede mezclar partidos con líderes y sin ellos; si juega un líder, habrá otro en el equipo rival.</small><small v-else>Cada partido requiere al menos dos líderes: uno en cada equipo.</small></label>
              <div class="number-settings"><label><span>JORNADAS</span><span class="number-input"><button type="button" aria-label="Menos jornadas" @click="roundCount = Math.max(rounds.length, 1, roundCount - 1)">−</button><input v-model.number="roundCount" type="number" min="1" max="60" /><button type="button" aria-label="Más jornadas" @click="roundCount = Math.min(60, roundCount + 1)">+</button></span></label><label><span>PISTAS</span><span class="number-input"><button type="button" aria-label="Menos pistas" @click="courtCount = Math.max(1, courtCount - 1)">−</button><input v-model.number="courtCount" type="number" min="1" max="12" /><button type="button" aria-label="Más pistas" @click="courtCount = Math.min(12, courtCount + 1)">+</button></span></label></div>
              <div class="points-note"><span>3</span><span>GANAR</span><span>·</span><span>2</span><span>EMPATAR</span><span>·</span><span>1</span><span>JUGAR Y PERDER</span></div>
            </article>
            <div class="generator-card"><div class="generator-copy"><span>LA SUERTE YA ESTÁ ECHADA</span><strong>¿Listos para<br />salir a pista?</strong><small>{{ rounds.length ? 'Reequilibra las jornadas que faltan.' : 'Nuevas parejas y partidos equilibrados.' }}</small></div><div class="generator-ball">●</div><button type="button" :disabled="!canGenerate && !rounds.length" @click="generate">{{ rounds.length ? 'RECALCULAR PENDIENTES' : 'GENERAR JORNADAS' }} <span>↗</span></button></div>
          </div>
        </div>
        <p v-if="notice" class="notice" role="alert">{{ notice }}</p>
        <footer class="page-footer"><span>REPARTIDOR CLUB © 2026</span><span>HECHO PARA COMPARTIR CANCHA <b>♥</b></span></footer>
      </section>

      <section v-else-if="activeView === 'matches'" class="workspace matches-view">
        <div class="section-heading matches-heading"><div><span class="section-kicker">02 / A LA CANCHA</span><h2>Que ruede la bola.</h2><p>Marca el resultado al terminar cada partido. Ganar 3 puntos · Empatar 2 · Perder 1.</p></div><div class="progress-stamp"><strong>{{ closedMatches.toString().padStart(2, '0') }}<i>/</i>{{ totalMatches.toString().padStart(2, '0') }}</strong><span>PARTIDOS<br />CERRADOS</span></div></div>
        <div class="round-selector" aria-label="Elegir jornada"><button v-for="(round, index) in rounds" :key="round.id" type="button" :class="{ active: activeRoundIndex === index, complete: round.matches.length > 0 && round.matches.every(isTerminal) }" @click="activeRoundIndex = index"><span>JORNADA</span><strong>{{ (index + 1).toString().padStart(2, '0') }}</strong><i v-if="round.matches.length > 0 && round.matches.every(isTerminal)">✓</i></button></div>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <template v-if="rounds[activeRoundIndex]">
          <div class="matches-meta"><span>JORNADA {{ (activeRoundIndex + 1).toString().padStart(2, '0') }} <i>—</i> {{ rounds[activeRoundIndex].matches.length }} {{ rounds[activeRoundIndex].matches.length === 1 ? 'PARTIDO' : 'PARTIDOS' }}</span><span v-if="rounds[activeRoundIndex].matches.length">Toca un resultado para guardarlo <b>↗</b></span></div>
          <p v-if="rounds[activeRoundIndex].matches.length < courtCount" class="court-note">{{ courtCount - rounds[activeRoundIndex].matches.length }} {{ courtCount - rounds[activeRoundIndex].matches.length === 1 ? 'pista libre' : 'pistas libres' }} por disponibilidad, regla de jugadores líderes o falta de cruces compatibles.</p>
          <div v-if="!rounds[activeRoundIndex].matches.length" class="no-matches"><span>✳</span><h3>Esta jornada no tiene partidos.</h3><p>Con la disponibilidad y la regla de jugadores líderes elegida no se puede formar un cruce compatible. Puedes incorporar a alguien o revisar la configuración.</p><button type="button" @click="activeView = 'setup'">GESTIONAR EL GRUPO ↗</button></div>
          <div class="match-grid">
            <article v-for="match in rounds[activeRoundIndex].matches" :key="match.id" class="match-card" :class="{ settled: match.status === 'completed', interrupted: match.status === 'interrupted', inprogress: match.status === 'inProgress' }">
              <div class="match-card-top"><span>PISTA {{ match.court.toString().padStart(2, '0') }}</span><span>{{ mode === 'doubles' ? 'DOBLES · 2 × 2' : 'INDIVIDUAL · 1 × 1' }}</span></div>
              <div class="teams"><div class="team" :class="{ winner: match.result === 'teamA' }"><div class="team-label"><span>EQUIPO A</span><b v-if="match.result === 'teamA'">GANADOR ✳</b></div><strong class="team-player-names"><template v-for="(id, index) in match.teamA" :key="id"><span class="team-player-name" :class="{ 'leader-player': leaderIds.has(id) }">{{ playerNameFor(id) }}<span v-if="leaderIds.has(id)" class="leader-player-mark" aria-hidden="true"> ✳</span><span v-if="leaderIds.has(id)" class="sr-only">, jugador líder</span></span><span v-if="index < match.teamA.length - 1" class="team-player-separator" aria-hidden="true">·</span></template></strong></div><div class="vs-mark">VS</div><div class="team team-b" :class="{ winner: match.result === 'teamB' }"><div class="team-label"><span>EQUIPO B</span><b v-if="match.result === 'teamB'">GANADOR ✳</b></div><strong class="team-player-names"><template v-for="(id, index) in match.teamB" :key="id"><span class="team-player-name" :class="{ 'leader-player': leaderIds.has(id) }">{{ playerNameFor(id) }}<span v-if="leaderIds.has(id)" class="leader-player-mark" aria-hidden="true"> ✳</span><span v-if="leaderIds.has(id)" class="sr-only">, jugador líder</span></span><span v-if="index < match.teamB.length - 1" class="team-player-separator" aria-hidden="true">·</span></template></strong></div></div>
              <div v-if="match.status === 'scheduled'" class="match-controls"><button type="button" @click="startMatch(match)">▶ MARCAR EN JUEGO</button></div>
              <div v-else-if="match.status === 'inProgress'" class="match-controls"><button type="button" class="interrupt-button" @click="interruptMatch(match)">MARCAR INTERRUMPIDO</button></div>
              <div v-else class="match-controls"><button type="button" class="reopen-button" @click="resetMatch(match)">{{ match.status === 'interrupted' ? '↻ REINTENTAR PARTIDO' : '↻ REABRIR PARTIDO' }}</button></div>
               <div v-if="match.status !== 'interrupted'" class="result-actions"><button type="button" :class="{ picked: match.result === 'teamA' }" :aria-pressed="match.result === 'teamA'" @click="setResult(match, 'teamA')"><span>3</span> GANA A</button><button type="button" :class="{ picked: match.result === 'draw' }" :aria-pressed="match.result === 'draw'" @click="setResult(match, 'draw')"><span>2</span> EMPATE</button><button type="button" :class="{ picked: match.result === 'teamB' }" :aria-pressed="match.result === 'teamB'" @click="setResult(match, 'teamB')"><span>3</span> GANA B</button></div>
              <div class="match-status" :class="{ recorded: match.status === 'completed', interrupted: match.status === 'interrupted', playing: match.status === 'inProgress' }"><span>{{ match.status === 'completed' ? '✓' : match.status === 'interrupted' ? '!' : match.status === 'inProgress' ? '●' : '○' }}</span> {{ matchStatusText(match) }}</div>
            </article>
          </div>
        </template>
        <div class="matches-bottom"><button type="button" class="text-link" @click="activeView = 'setup'">← CAMBIAR CONFIGURACIÓN</button><button type="button" class="primary-small" @click="activeView = 'standings'">VER CLASIFICACIÓN <span>↗</span></button></div>
        <footer class="page-footer"><span>REPARTIDOR CLUB © 2026</span><span>HECHO PARA COMPARTIR CANCHA <b>♥</b></span></footer>
      </section>

      <section v-else class="workspace standings-view">
        <div class="section-heading standings-heading"><div><span class="section-kicker">03 / LA TABLA</span><h2>Los puntos<br />sobre la mesa.</h2><p>Cada partido suma. Toda la cuadrilla cuenta.</p></div><div class="winner-seal"><span>✳</span><small>BUEN<br />JUEGO<br />ANTE TODO</small></div></div>
        <div class="standings-toolbar"><div><strong>{{ standings.length.toString().padStart(2, '0') }}</strong><span>JUGADORES</span><i>·</i><strong>{{ roundsCompleted.toString().padStart(2, '0') }}</strong><span>JORNADAS COMPLETADAS</span></div><button type="button" @click="exportStandings"><span>↓</span> DESCARGAR IMAGEN PNG</button></div>
          <div class="standings-table-wrap"><table class="standings-table"><thead><tr><th scope="col">POS.</th><th scope="col">JUGADOR / A</th><th scope="col">PJ</th><th scope="col">G</th><th scope="col">E</th><th scope="col">P</th><th scope="col">PTS</th></tr></thead><tbody><tr v-for="(row, index) in standings" :key="row.player.id" :class="{ podium: index === 0 }"><td data-label="Pos."><span class="rank" :class="{ gold: index === 0 }">{{ (index + 1).toString().padStart(2, '0') }}</span></td><td data-label="Jugador/a"><div class="standing-player"><strong>{{ row.player.name }}</strong><span v-if="row.player.isCaptain">✳ JUGADOR LÍDER</span><span v-if="!isAvailableAtRound(row.player, Math.max(1, activeRoundIndex + 1))" class="standing-unavailable">NO DISPONIBLE</span></div></td><td data-label="PJ">{{ row.played }}</td><td data-label="G">{{ row.wins }}</td><td data-label="E">{{ row.draws }}</td><td data-label="P">{{ row.losses }}</td><td data-label="PTS"><strong class="points-cell">{{ row.points }}</strong></td></tr></tbody></table></div>
        <div class="scoring-legend"><span><b>G</b> GANADOS · 3 PTS</span><i>✳</i><span><b>E</b> EMPATADOS · 2 PTS</span><i>✳</i><span><b>P</b> PERDIDOS · 1 PT</span></div>
        <div class="matches-bottom"><button type="button" class="text-link" @click="activeView = 'matches'">← VOLVER A LAS JORNADAS</button><button type="button" class="primary-small" @click="activeView = 'setup'">REPARTIR DE NUEVO <span>↗</span></button></div>
        <footer class="page-footer"><span>REPARTIDOR CLUB © 2026</span><span>HECHO PARA COMPARTIR CANCHA <b>♥</b></span></footer>
      </section>
    </main>

    <div v-if="tutorialOpen" class="modal-backdrop tutorial-backdrop" @click.self="closeTutorial">
      <section class="modal-card tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-description" @keydown="handleTutorialKeydown">
        <button ref="tutorialCloseButton" type="button" class="modal-close" aria-label="Cerrar tutorial" @click="closeTutorial">×</button>
        <div class="tutorial-progress-head"><span>GUÍA RÁPIDA</span><span>PASO {{ (tutorialStep + 1).toString().padStart(2, '0') }} / {{ tutorialSteps.length.toString().padStart(2, '0') }}</span></div>
        <div class="tutorial-progress-track" role="progressbar" :aria-valuenow="tutorialStep + 1" :aria-valuemin="1" :aria-valuemax="tutorialSteps.length" :aria-label="`Paso ${tutorialStep + 1} de ${tutorialSteps.length}`"><span :style="{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }"></span></div>
        <div class="tutorial-illustration" aria-hidden="true"><span>{{ currentTutorialStep.icon }}</span><small>{{ (tutorialStep + 1).toString().padStart(2, '0') }}</small></div>
        <div class="tutorial-copy" aria-live="polite">
          <span class="section-kicker">{{ currentTutorialStep.eyebrow }}</span>
          <h2 id="tutorial-title">{{ currentTutorialStep.title }}</h2>
          <p id="tutorial-description">{{ currentTutorialStep.description }}</p>
          <div class="tutorial-tip"><span>✳</span><p>{{ currentTutorialStep.tip }}</p></div>
        </div>
        <div class="tutorial-dots" role="group" aria-label="Pasos del tutorial">
          <button v-for="(_, index) in tutorialSteps" :key="index" type="button" :class="{ active: tutorialStep === index }" :aria-label="`Ir al paso ${index + 1}`" :aria-current="tutorialStep === index ? 'step' : undefined" @click="tutorialStep = index"></button>
        </div>
        <div class="tutorial-actions">
          <button type="button" class="text-link" :disabled="tutorialStep === 0" @click="tutorialStep = Math.max(0, tutorialStep - 1)">← ANTERIOR</button>
          <button type="button" class="primary-small" @click="advanceTutorial">{{ tutorialStep === tutorialSteps.length - 1 ? 'EMPEZAR ↗' : 'SIGUIENTE →' }}</button>
        </div>
        <button type="button" class="tutorial-skip" @click="closeTutorial">Omitir tutorial</button>
      </section>
    </div>

    <div v-if="availabilityDialog" class="modal-backdrop" @click.self="availabilityDialog = null">
      <section class="modal-card availability-modal" role="dialog" aria-modal="true" aria-labelledby="availability-title">
        <button type="button" class="modal-close" aria-label="Cerrar" @click="availabilityDialog = null">×</button>
        <span class="section-kicker">GESTIÓN DE DISPONIBILIDAD</span>
        <h2 id="availability-title">{{ players.find((player) => player.id === availabilityDialog?.playerId)?.name }}</h2>
        <p>El cambio se aplicará desde la jornada elegida. El historial y los resultados ya registrados se conservan.</p>
        <label class="modal-field">EFECTO DESDE
          <select v-model.number="availabilityEffectiveRound"><option v-for="round in roundChoices" :key="round" :value="round">Jornada {{ round.toString().padStart(2, '0') }}</option></select>
        </label>
        <label class="modal-field">ESTADO
          <select v-model="availabilityTarget"><option value="unavailable">Lesionada / no disponible</option><option value="available">Disponible / reincorporada</option></select>
        </label>
        <div class="modal-actions"><button type="button" class="text-link" @click="availabilityDialog = null">CANCELAR</button><button type="button" class="primary-small" @click="prepareAvailabilityChange">{{ rounds.length ? 'PREPARAR RECÁLCULO' : 'GUARDAR DISPONIBILIDAD' }} <span>↗</span></button></div>
      </section>
    </div>

    <div v-if="recalculationProposal" class="modal-backdrop" @click.self="cancelRecalculation">
      <section class="modal-card recalculation-modal" role="dialog" aria-modal="true" aria-labelledby="recalculation-title">
        <button type="button" class="modal-close" aria-label="Cerrar" @click="cancelRecalculation">×</button>
        <span class="section-kicker">VISTA PREVIA · DESDE JORNADA {{ recalculationProposal.effectiveRound.toString().padStart(2, '0') }}</span>
        <h2 id="recalculation-title">{{ recalculationProposal.title }}</h2>
        <p>Los partidos finalizados mantienen equipos, resultados y puntos. Solo se redistribuyen los partidos pendientes desde la jornada indicada.</p>
        <div v-if="recalculationProposal.schedule.inProgressMatches.length" class="preview-blocker" role="alert"><strong>Hay partidos en juego.</strong><span>Registra el resultado o vuelve a jornadas y márcalos como interrumpidos antes de recalcular.</span><span v-for="match in recalculationProposal.schedule.inProgressMatches" :key="match.id">Pista {{ match.court }} · {{ playerNamesFor([...match.teamA, ...match.teamB]) }}</span></div>
        <div class="preview-counts"><div><strong>{{ recalculationProposal.schedule.preservedMatches }}</strong><span>PARTIDOS<br />CONSERVADOS</span></div><div><strong>{{ recalculationProposal.schedule.removedMatches }}</strong><span>PENDIENTES<br />A REPARTIR</span></div><div><strong>{{ recalculationProposal.schedule.generatedMatches }}</strong><span>NUEVOS<br />PARTIDOS</span></div></div>
        <p v-if="recalculationProposal.schedule.skippedCourts" class="preview-note">{{ recalculationProposal.schedule.skippedCourts }} pistas quedarán libres por disponibilidad, capacidad, regla de jugadores líderes o falta de cruces compatibles.</p>
        <div class="preview-load"><h3>Partidos jugados + previstos</h3><div v-for="row in proposalRows(recalculationProposal)" :key="row.player.id" class="preview-load-row"><span>{{ row.player.name }} <small v-if="!row.available">NO DISPONIBLE</small></span><strong>{{ row.projected }}</strong></div></div>
        <p class="preview-footnote">Se equilibra la carga de partidos; no se exige descanso entre jornadas. Cada persona jugará como máximo una vez por jornada.</p>
        <div class="modal-actions"><button type="button" class="text-link" @click="cancelRecalculation">CANCELAR</button><button type="button" class="primary-small" :disabled="recalculationProposal.schedule.inProgressMatches.length > 0" @click="confirmRecalculation">CONFIRMAR Y RECALCULAR <span>↗</span></button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.version-tag{border:1px solid #dfded6;border-radius:12px;padding:4px 7px;color:#737b70;font:8px var(--mono);white-space:nowrap}
.tutorial-trigger{min-width:44px;min-height:44px;font-weight:700;color:#637267}
.tutorial-backdrop{z-index:1100}
.tutorial-card{width:min(100%,470px);padding:29px 34px 23px}
.tutorial-progress-head{display:flex;justify-content:space-between;gap:12px;margin:1px 42px 8px 0;color:#80877e;font:8px var(--mono);letter-spacing:.65px}
.tutorial-progress-track{height:4px;overflow:hidden;border-radius:4px;background:#e9e7df}
.tutorial-progress-track span{display:block;height:100%;border-radius:inherit;background:#dd7959;transition:width .2s ease}
.tutorial-illustration{position:relative;display:grid;place-items:center;width:82px;height:82px;margin:24px auto 20px;border:1px solid #e4e4d9;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fffefa,#e9eee3);color:#173d35}
.tutorial-illustration>span{font:600 37px var(--serif)}
.tutorial-illustration small{position:absolute;right:-3px;bottom:-2px;display:grid;place-items:center;width:25px;height:25px;border:2px solid #fffefa;border-radius:50%;background:#dd7959;color:white;font:8px var(--mono)}
.tutorial-copy h2{margin:8px 36px 9px 0;font-size:30px}
.tutorial-copy>p{margin:0 0 14px;color:#727a72;font-size:12px;line-height:1.7}
.tutorial-tip{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-left:2px solid #dd7959;background:#f7f6ef;color:#586559}
.tutorial-tip>span{color:#dd7959;font-size:14px}
.tutorial-tip p{margin:0;font-size:10px;line-height:1.6}
.tutorial-dots{display:flex;justify-content:center;gap:8px;margin:18px 0 15px}
.tutorial-dots button{display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;cursor:pointer}
.tutorial-dots button::before{width:8px;height:8px;border-radius:8px;background:#d7d8ce;content:'';transition:width .15s ease,background-color .15s ease}
.tutorial-dots button.active::before{width:22px;background:#173d35}
.tutorial-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;border-top:1px solid #eeede8}
.tutorial-actions .text-link:disabled{opacity:.35;cursor:default}
.tutorial-skip{display:block;min-height:44px;margin:4px auto 0;padding:8px 16px;border:0;background:transparent;color:#899087;font-size:10px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.court-note{margin:-5px 0 13px;color:#878d82;font-size:9px}
.join-round-field{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-2px 0 9px;color:#81877f;font:8px var(--mono);letter-spacing:.45px}.join-round-field select,.modal-field select{min-width:145px;height:32px;padding:0 9px;border:1px solid #dfded6;background:#faf9f5;color:#173d35;font:10px 'DM Sans',sans-serif}.player-row{flex-wrap:wrap;padding:3px 0}.availability-pill{border-radius:12px;background:#edf0e8;padding:4px 7px;color:#647c58;font:7px var(--mono);white-space:nowrap}.availability-pill.unavailable{background:#f3e6df;color:#ad654a}.availability-action{border:1px solid #dfd4c8;background:#fffaf2;padding:5px 7px;color:#aa684d;font:7px var(--mono);white-space:nowrap;cursor:pointer}.captain-toggle:disabled{opacity:.45;cursor:not-allowed}.match-controls{display:flex;justify-content:flex-end;margin:-5px 0 8px}.match-controls button{border:0;background:transparent;padding:4px 0;color:#87917e;font:7px var(--mono);letter-spacing:.35px;cursor:pointer}.match-controls .interrupt-button{color:#b45e46}.match-status.interrupted{color:#ad654a}.match-status.playing{color:#b4854b}.match-card.interrupted{border-color:#e6c8b9;background:#fffaf7}.match-card.inprogress{border-color:#d3bd91;background:#fffcf5}.standing-player .standing-unavailable{padding:3px 6px;border-radius:9px;background:#f3e6df;color:#ad654a}.modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;overflow-y:auto;padding:24px;background:rgba(16,35,30,.62);backdrop-filter:blur(3px)}.modal-card{position:relative;width:min(100%,540px);max-height:calc(100vh - 48px);overflow-y:auto;border:1px solid #dfded6;border-radius:6px;background:#fffefa;padding:30px 32px;box-shadow:0 24px 80px rgba(0,0,0,.2)}.modal-card h2{margin:9px 35px 8px 0;color:#173d35;font:600 30px/1.1 var(--serif)}.modal-card>p{margin:0 0 17px;color:#727a72;font-size:11px;line-height:1.7}.modal-close{position:absolute;top:15px;right:17px;width:31px;height:31px;border:1px solid #e1dfd8;border-radius:50%;background:transparent;color:#667068;font-size:20px;cursor:pointer}.modal-field{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:13px 0;color:#858b83;font:8px var(--mono);letter-spacing:.55px}.modal-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:21px;padding-top:15px;border-top:1px solid #eeede8}.preview-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:17px 0}.preview-counts>div{display:flex;align-items:center;gap:9px;min-height:57px;padding:10px;border:1px solid #e8e5dc;background:#f8f7f2}.preview-counts strong{color:#173d35;font:23px var(--serif)}.preview-counts span{color:#858b83;font:7px/1.45 var(--mono)}.preview-note{margin:0 0 12px!important;color:#a05e44!important;font-size:9px!important}.preview-blocker{display:grid;gap:6px;margin:14px 0;padding:12px 14px;border-left:3px solid #c36d50;background:#f8ede7;color:#744638;font-size:10px;line-height:1.5}.preview-blocker strong{font-size:11px}.preview-blocker span:last-child{font-family:var(--mono);font-size:8px}.preview-load{margin-top:13px;border:1px solid #e7e5de;background:#fbfaf6}.preview-load h3{margin:0;padding:10px 12px;border-bottom:1px solid #e7e5de;color:#525f55;font:9px var(--mono);letter-spacing:.3px}.preview-load-row{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #eeede8;color:#515c53;font-size:10px}.preview-load-row:last-child{border-bottom:0}.preview-load-row small{margin-left:5px;color:#b46f52;font:7px var(--mono)}.preview-load-row strong{color:#173d35;font:700 13px var(--serif)}.preview-footnote{margin:10px 0 0!important;color:#868c83!important;font-size:9px!important}.modal-actions .primary-small:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:560px){.version-tag{padding:3px 5px;font-size:7px}.tutorial-card{padding:24px 20px 18px}.tutorial-illustration{width:70px;height:70px;margin:20px auto 17px}.tutorial-illustration>span{font-size:32px}.tutorial-copy h2{font-size:25px}.tutorial-copy>p{font-size:11px}.tutorial-tip p{font-size:9px}.tutorial-dots{margin:15px 0 12px}.tutorial-actions .text-link,.tutorial-actions .primary-small{font-size:8px;padding-right:10px;padding-left:10px}.player-row{column-gap:5px}.availability-pill{margin-left:auto}.player-name{min-width:90px}.captain-toggle{font-size:7px}.availability-action{font-size:7px}.modal-backdrop{align-items:end;padding:10px}.modal-card{max-height:calc(100vh - 20px);padding:25px 19px}.modal-card h2{font-size:25px}.preview-counts{gap:5px}.preview-counts>div{gap:5px;padding:7px}.preview-counts strong{font-size:19px}.preview-counts span{font-size:6px}.modal-actions .primary-small{font-size:7px;padding:0 8px}.modal-actions .text-link{font-size:7px}}
.modal-backdrop{min-height:100vh;min-height:100dvh;padding-top:max(12px,env(safe-area-inset-top,0px));padding-right:max(12px,env(safe-area-inset-right,0px));padding-bottom:max(12px,env(safe-area-inset-bottom,0px));padding-left:max(12px,env(safe-area-inset-left,0px))}.modal-card{max-height:calc(var(--visual-viewport-height,100dvh) - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 24px);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.modal-close{width:44px;height:44px}.join-round-field select,.modal-field select{min-height:44px}
@media(max-width:719px){.modal-backdrop{padding-top:max(12px,env(safe-area-inset-top,0px));padding-bottom:max(12px,env(safe-area-inset-bottom,0px))}.modal-card{max-height:calc(var(--visual-viewport-height,100dvh) - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 12px)}.modal-field select,.join-round-field select{width:min(65%,220px);min-width:0;height:44px;font-size:16px}.modal-actions{position:sticky;bottom:0;padding-bottom:max(8px,env(safe-area-inset-bottom,0px));background:#fffefa}}
@media(max-width:420px){.modal-backdrop{align-items:end}.modal-card{width:100%;max-height:calc(var(--visual-viewport-height,100dvh) - env(safe-area-inset-top,0px) - 8px);padding:24px 15px calc(12px + env(safe-area-inset-bottom,0px));border-bottom-right-radius:0;border-bottom-left-radius:0}}
@media(max-height:520px) and (max-width:800px){.modal-backdrop{align-items:center}.modal-card{max-height:calc(var(--visual-viewport-height,100dvh) - 16px);border-radius:6px}}
@media(pointer:coarse){.modal-close{min-width:44px;min-height:44px}}
.tutorial-backdrop{z-index:1100}
.modal-card.tutorial-card{width:min(100%,470px);padding:29px 34px 23px}
.tutorial-card h2{font-size:30px}
.tutorial-card .tutorial-copy>p{margin:0 0 14px;color:#727a72;font-size:12px;line-height:1.7}
@media(max-width:560px){.modal-card.tutorial-card{padding:24px 20px 18px}.tutorial-card h2{font-size:25px}.tutorial-card .tutorial-copy>p{font-size:11px}}
@media(max-width:719px){.tutorial-card .tutorial-actions{position:sticky;bottom:0;padding:8px 0;background:#fffefa}}
.match-controls .reopen-button{color:#667b67;text-decoration:underline;text-underline-offset:2px}
.captain-policy-field{display:grid;gap:6px;margin:14px 0;color:#858b83;font:8px var(--mono);letter-spacing:.55px}
.captain-policy-field select{width:100%;min-height:40px;padding:0 10px;border:1px solid #dfded6;background:#faf9f5;color:#173d35;font:10px 'DM Sans',sans-serif;letter-spacing:0}
.captain-policy-field select:disabled{opacity:.62}
.captain-policy-field small{color:#81877f;font:9px/1.5 'DM Sans',sans-serif;letter-spacing:0}
@media(max-width:719px){.captain-policy-field select{min-height:44px;font-size:16px}}
.captain-toggle{max-width:100%;white-space:normal;line-height:1.35;text-align:left}
.team-player-names{display:flex;min-width:0;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:0 5px}
.team-player-name{overflow-wrap:anywhere}
.team-player-name.leader-player{color:#b85f42;font-weight:800;text-decoration:underline;text-decoration-color:#e2b4a2;text-decoration-thickness:1px;text-underline-offset:2px}
.leader-player-mark{color:#dd7959;font-size:.8em}
.team-player-separator{color:#92998d}
.clear-players-button{display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;gap:6px;margin:8px 0 0;padding:8px 12px;border:1px solid #e8d7cf;background:#fffaf6;color:#ad654a;font:8px var(--mono);letter-spacing:.5px;cursor:pointer}
.clear-players-button:hover{background:#f8eee8}
</style>
