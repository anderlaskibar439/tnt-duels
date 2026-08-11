// Minecraft TNT Duels 1v1
// Ruta relativa a la carpeta api/ (ver README para cómo servir el juego junto a la API PHP)
const API_BASE_URL = 'api';
const DEFAULT_AVATAR = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#444"/><circle cx="20" cy="15" r="8" fill="#999"/><rect x="6" y="26" width="28" height="12" rx="6" fill="#999"/></svg>'
);
let currentUser = null; // Perfil de la cuenta logueada en este dispositivo (null = invitado)
const STARTING_LIVES = 3;
const PHASES = {
  READY: 'READY',
  PLACEMENT_P1: 'PLACEMENT_P1',
  PLACEMENT_P2: 'PLACEMENT_P2',
  TURNS: 'TURNS',
  RESOLUTION: 'RESOLUTION',
  GAME_OVER: 'GAME_OVER',
  FREE: 'FREE'
};
const PHASE_SECONDS = 15;
const FREE_SIZES = [3, 4, 5, 6, 7, 8, 9];

let currentSelectedMode = 'online';
let currentSelectedDifficulty = 'easy';
let gameState = createInitialState();
let audioCtx = null;
let musicInterval = null;
let isMusicPlaying = false;
let isSoundEnabled = true;
let currentChordIndex = 0;
let musicTickCounter = 0;
let nextRoundId = null;
let timerId = null;
let timeLeft = 0;

const tensionChords = [
  { bass: 110.00, treble: [220.00, 261.63, 329.63, 440.00, 523.25] },
  { bass: 87.31, treble: [174.61, 220.00, 261.63, 349.23, 440.00] },
  { bass: 73.42, treble: [146.83, 196.00, 293.66, 349.23, 587.33] },
  { bass: 82.41, treble: [164.81, 207.65, 246.94, 293.66, 329.63] }
];

function createInitialState() {
  return {
    round: 1,
    gridSize: 3,
    tntPerPlayer: 2,
    p1Lives: STARTING_LIVES,
    p2Lives: STARTING_LIVES,
    p1Tnts: new Set(),
    p2Tnts: new Set(),
    clickedCells: new Set(),
    rocks: new Set(),
    freeTnts: new Set(),
    activePlayer: 1,
    phase: PHASES.READY,
    placedCount: 0,
    gameMode: currentSelectedMode,
    difficulty: currentSelectedDifficulty,
    p1PlacementHistory: [],
    p1ClickHistory: []
  };
}

function beginDuel() {
  clearPendingRound();
  stopPhaseTimer();
  gameState = createInitialState();
  gameState.round = 1;
  gameState.gridSize = 3;
  gameState.tntPerPlayer = getTntsForRound(gameState.round);
  gameState.rocks = generateRocksForRound(gameState.round, gameState.gridSize);
  gameState.phase = PHASES.PLACEMENT_P1; // P1 always starts round 1 placement
  gameState.placedCount = 0;

  setControls();
  renderHearts();
  updateDashboard();
  renderBoard();
  startPhaseTimer();
  playClickSound();
  checkBotAction();
}

// Etiqueta a mostrar para un asiento (1 o 2): nombre de cuenta online, "(BOT)" en
// solitario, o el genérico "JUGADOR N" en cualquier otro caso.
function getPlayerLabel(seatNum) {
  if (gameState.gameMode === 'online') {
    const names = gameState.onlineUsernames || [];
    const label = (names[seatNum - 1] || `JUGADOR ${seatNum}`).toUpperCase();
    return label + (gameState.mySeat === seatNum ? ' (TÚ)' : '');
  }
  if (seatNum === 2 && gameState.gameMode === 'solo') return 'JUGADOR 2 (BOT)';
  return `JUGADOR ${seatNum}`;
}

// Línea secundaria bajo el estado del panel: nombre de la cuenta conectada en
// online, "(BOT)" en solitario para J2, o vacío en el resto de casos.
function getPlayerAccountLabel(seatNum) {
  if (gameState.gameMode === 'online') {
    const names = gameState.onlineUsernames || [];
    const label = names[seatNum - 1];
    if (!label) return '';
    return label + (gameState.mySeat === seatNum ? ' (TÚ)' : '');
  }
  if (seatNum === 2 && gameState.gameMode === 'solo') return '(BOT)';
  return '';
}

function updateDashboard() {
  document.getElementById('roundDisplay').innerText = gameState.phase === PHASES.FREE
    ? `MODO LIBRE (Tablero: ${gameState.gridSize}x${gameState.gridSize})`
    : `RONDA ${gameState.round} (Tablero: ${gameState.gridSize}x${gameState.gridSize})`;

  const p1Status = document.getElementById('p1TntStatus');
  const p2Status = document.getElementById('p2TntStatus');
  const phaseDisplay = document.getElementById('phaseDisplay');
  const rulesTip = document.getElementById('rulesTip');
  const p1Panel = document.getElementById('p1Panel');
  const p2Panel = document.getElementById('p2Panel');

  const startPlayer = (gameState.round % 2 === 1) ? 1 : 2;

  p1Panel.classList.toggle('active', gameState.phase === PHASES.PLACEMENT_P1 || (gameState.phase === PHASES.TURNS && gameState.activePlayer === 1));
  p2Panel.classList.toggle('active', gameState.phase === PHASES.PLACEMENT_P2 || (gameState.phase === PHASES.TURNS && gameState.activePlayer === 2));

  // El rótulo "JUGADOR 1/2" del panel se mantiene fijo; debajo se muestra el
  // nombre de la cuenta conectada (online) o "(BOT)" en solitario, si aplica.
  const p1AccountEl = document.getElementById('p1AccountName');
  const p2AccountEl = document.getElementById('p2AccountName');
  if (p1AccountEl) p1AccountEl.innerText = getPlayerAccountLabel(1);
  if (p2AccountEl) p2AccountEl.innerText = getPlayerAccountLabel(2);

  if (gameState.phase === PHASES.READY) {
    phaseDisplay.innerText = 'Pulsa START DUEL';
    p1Status.innerText = 'Listo';
    p2Status.innerText = 'Listo';
    rulesTip.innerText = 'Coloca minas en secreto y cava casillas seguras por turnos.';
  } else if (gameState.phase === PHASES.PLACEMENT_P1) {
    phaseDisplay.innerHTML = '<span style="color: var(--text-red);">J1</span>: COLOCA TUS TNTs';
    p1Status.innerText = `TNTs restantes: ${gameState.tntPerPlayer - gameState.placedCount}`;
    p2Status.innerText = startPlayer === 1 ? 'En espera...' : 'Listo';
    rulesTip.innerText = `J1 coloca ${gameState.tntPerPlayer} TNT(s). Las rocas bloquean esa casilla.`;
  } else if (gameState.phase === PHASES.PLACEMENT_P2) {
    if (gameState.gameMode === 'solo') {
      phaseDisplay.innerHTML = '<span style="color: var(--text-blue);">J2 (BOT)</span>: COLOCANDO TNTs...';
      p1Status.innerText = 'En espera...';
      p2Status.innerText = 'Colocando...';
      rulesTip.innerText = 'El Bot está decidiendo dónde colocar sus TNTs.';
    } else {
      phaseDisplay.innerHTML = '<span style="color: var(--text-blue);">J2</span>: COLOCA TUS TNTs';
      p1Status.innerText = startPlayer === 2 ? 'En espera...' : 'Listo';
      p2Status.innerText = `TNTs restantes: ${gameState.tntPerPlayer - gameState.placedCount}`;
      rulesTip.innerText = `J2 coloca ${gameState.tntPerPlayer} TNT(s). Las rocas bloquean esa casilla.`;
    }
  } else if (gameState.phase === PHASES.TURNS) {
    if (gameState.activePlayer === 2 && gameState.gameMode === 'solo') {
      phaseDisplay.innerHTML = 'TURNO: <span style="color: var(--text-blue);">J2 (BOT) [PENSANDO...]</span>';
      p1Status.innerText = 'TNTs ocultos';
      p2Status.innerText = 'TNTs ocultos';
      rulesTip.innerText = 'El Bot está evaluando el tablero...';
    } else {
      const color = gameState.activePlayer === 1 ? 'var(--text-red)' : 'var(--text-blue)';
      const pName = getPlayerLabel(gameState.activePlayer);
      phaseDisplay.innerHTML = `TURNO: <span style="color: ${color};">${pName}</span>`;
      p1Status.innerText = 'TNTs ocultos';
      p2Status.innerText = 'TNTs ocultos';
      rulesTip.innerText = 'Cava una casilla. Si explota, pierdes vida. Si crees que no quedan TNTs, finaliza la ronda.';
    }
  } else if (gameState.phase === PHASES.RESOLUTION) {
    phaseDisplay.innerHTML = '<span style="color: var(--text-yellow);">RESOLVIENDO RONDA...</span>';
    p1Status.innerText = `${gameState.p1Lives} vidas`;
    p2Status.innerText = `${gameState.p2Lives} vidas`;
    rulesTip.innerText = 'Mostrando las minas antes de preparar el siguiente tablero.';
  } else if (gameState.phase === PHASES.GAME_OVER) {
    let winnerText = '';
    if (gameState.p1Lives === gameState.p2Lives) {
      winnerText = `<span style="color: var(--text-yellow);">EMPATE!</span>`;
    } else {
      const winner = gameState.p1Lives > gameState.p2Lives ? 1 : 2;
      const winnerColor = winner === 1 ? 'var(--text-red)' : 'var(--text-blue)';
      const winnerName = getPlayerLabel(winner);
      winnerText = `GANADOR: <span style="color: ${winnerColor};">${winnerName}</span>`;
    }
    phaseDisplay.innerHTML = winnerText;
    p1Status.innerText = `${gameState.p1Lives} vidas`;
    p2Status.innerText = `${gameState.p2Lives} vidas`;
    rulesTip.innerText = 'Fin de la partida. Pulsa Nueva Partida para reiniciar.';
  } else if (gameState.phase === PHASES.FREE) {
    phaseDisplay.innerHTML = '<span style="color: var(--text-yellow);">MODO LIBRE</span>';
    p1Panel.classList.remove('active');
    p2Panel.classList.remove('active');
    p1Status.innerText = '1 clic: TNT';
    p2Status.innerText = '2 clics: roca';
    rulesTip.innerText = 'Edita el tablero: TNT, roca, tierra. Cambia entre 3x3, 4x4, 5x5, 6x6, 7x7, 8x8 y 9x9 cuando quieras.';
  }
}

function renderHearts() {
  // El color de corazón equipado (cosmético comprado en la tienda) solo se
  // aplica a los corazones de J1, ya que la cuenta logueada en este
  // dispositivo se trata siempre como J1 a efectos de perfil/cosméticos.
  const equippedColor = currentUser && currentUser.equipped_heart_hex ? currentUser.equipped_heart_hex : null;
  renderPlayerHearts('p1Hearts', gameState.p1Lives, equippedColor);
  renderPlayerHearts('p2Hearts', gameState.p2Lives, null);
}

function renderPlayerHearts(containerId, lives, colorHex) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (let i = 1; i <= STARTING_LIVES; i++) {
    const heart = document.createElement('span');
    const isFull = i <= lives;
    heart.className = isFull ? 'heart full' : 'heart empty';
    if (isFull && colorHex) {
      heart.classList.add('heart-custom-color');
      heart.style.setProperty('--heart-color', colorHex);
    }
    container.appendChild(heart);
  }
}

function renderBoard() {
  const board = document.getElementById('staticBoard');
  board.innerHTML = '';
  board.style.setProperty('--grid-size', gameState.gridSize);
  const cellSizes = { 3: 64, 4: 60, 5: 54, 6: 48, 7: 42, 8: 38, 9: 34 };
  const cellSize = cellSizes[gameState.gridSize] || 40;
  board.style.setProperty('--cell-size', `${cellSize}px`);

  for (let y = 0; y < gameState.gridSize; y++) {
    for (let x = 0; x < gameState.gridSize; x++) {
      const key = `${x},${y}`;
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.type = 'button';
      cell.dataset.x = x;
      cell.dataset.y = y;

      applyCellState(cell, key);
      cell.addEventListener('click', () => handleCellClick(key, cell));
      board.appendChild(cell);
    }
  }
}

function applyCellState(cell, key) {
  if (gameState.gameMode === 'online') {
    applyOnlineCellState(cell, key);
    return;
  }

  const hasTnt = gameState.phase === PHASES.FREE
    ? gameState.freeTnts.has(key)
    : gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key);
  const wasClicked = gameState.clickedCells.has(key);
  const hasRock = gameState.rocks.has(key);

  if (hasRock) {
    cell.classList.add('rock');
    if (gameState.phase !== PHASES.FREE) {
      cell.classList.add('disabled');
    }
  }

  if (gameState.phase === PHASES.FREE && gameState.freeTnts.has(key)) {
    cell.classList.add('has-tnt');
  }

  if (gameState.phase === PHASES.PLACEMENT_P1 && gameState.p1Tnts.has(key)) {
    cell.classList.add('has-tnt', 'tnt-fade');
  }

  if (gameState.phase === PHASES.PLACEMENT_P2 && gameState.p2Tnts.has(key)) {
    cell.classList.add('has-tnt', 'tnt-fade');
  }

  if (gameState.phase === PHASES.TURNS && wasClicked) {
    cell.classList.add(hasTnt ? 'exploded' : 'safe', 'disabled');
  }

  if (gameState.phase === PHASES.RESOLUTION || gameState.phase === PHASES.GAME_OVER) {
    if (wasClicked) {
      cell.classList.add(hasTnt ? 'exploded' : 'safe');
    } else if (hasTnt) {
      cell.classList.add('has-tnt');
    }
    cell.classList.add('disabled');
  }

  if (gameState.phase === PHASES.READY) {
    cell.classList.add('disabled');
  }
}

// Cuánto tiempo se ve una TNT recién colocada en online antes de desvanecerse
// (mismo tiempo que el local usa entre "última TNT colocada" y el cambio de fase).
const ONLINE_TNT_FADE_MS = 2200;

// En online, cada TNT se ve brevemente justo al colocarse (para que ambos
// jugadores confirmen dónde la pusieron) y luego se desvanece igual que
// siempre se ha hecho en el modo local, en vez de quedarse visible el resto
// de la fase de colocación: el reto es recordar dónde estaban, no leerlas en
// pantalla. Al terminar la ronda (RESOLUTION/GAME_OVER) se revelan otra vez
// las que quedaron sin cavar, igual que en el modo local.
function applyOnlineCellState(cell, key) {
  const hasTnt = gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key);
  const wasClicked = gameState.clickedCells.has(key);
  const hasRock = gameState.rocks.has(key);
  const isRevealPhase = gameState.phase === PHASES.RESOLUTION || gameState.phase === PHASES.GAME_OVER;
  const placedAt = gameState.tntPlacedAt ? gameState.tntPlacedAt[key] : null;
  const justPlaced = placedAt != null && (Date.now() - placedAt) < ONLINE_TNT_FADE_MS;

  if (hasRock) {
    cell.classList.add('rock', 'disabled');
  }

  if (wasClicked) {
    cell.classList.add(hasTnt ? 'exploded' : 'safe', 'disabled');
  } else if (hasTnt && isRevealPhase) {
    cell.classList.add('has-tnt');
  } else if (hasTnt && justPlaced) {
    cell.classList.add('has-tnt', 'tnt-fade');
  }

  if (isRevealPhase || gameState.phase === PHASES.READY) {
    cell.classList.add('disabled');
  }
}

function handleCellClick(key, cellElement, isProgrammatic = false) {
  initAudio();

  if (gameState.gameMode === 'online') {
    handleOnlineCellClick(key);
    return;
  }

  if (gameState.phase === PHASES.FREE) {
    cycleFreeCell(key);
    return;
  }

  // Block clicks during Bot's placement and digging turns
  if (gameState.gameMode === 'solo' && !isProgrammatic) {
    if (gameState.phase === PHASES.PLACEMENT_P2) return;
    if (gameState.phase === PHASES.TURNS && gameState.activePlayer === 2) return;
  }

  if (gameState.rocks.has(key)) return;

  if (gameState.phase === PHASES.PLACEMENT_P1 || gameState.phase === PHASES.PLACEMENT_P2) {
    toggleTntPlacement(key, cellElement);
    return;
  }

  if (gameState.phase !== PHASES.TURNS || gameState.clickedCells.has(key)) return;

  // Record Player 1 click history for Bot pattern recognition
  if (gameState.gameMode === 'solo' && gameState.activePlayer === 1) {
    const [x, y] = key.split(',').map(Number);
    gameState.p1ClickHistory.push({
      x,
      y,
      category: getGridCategory(x, y, gameState.gridSize)
    });
  }

  gameState.clickedCells.add(key);
  const hasTnt = gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key);

  if (hasTnt) {
    cellElement.classList.add('exploded');
    damagePlayer(gameState.activePlayer);
    playExplosionSound();
    spawnParticles(cellElement, 'explosion');

    if (isGameOver()) {
      endGame();
      return;
    }

    resolveRound();
    return;
  }

  cellElement.classList.add('safe');
  playSafeClickSound();
  spawnParticles(cellElement, 'safe');
  gameState.activePlayer = gameState.activePlayer === 1 ? 2 : 1;
  updateDashboard();
  renderBoard();
  startPhaseTimer();
  checkRoundAutoResolve();
  checkBotAction();
}

function toggleTntPlacement(key, cellElement) {
  const activeSet = gameState.phase === PHASES.PLACEMENT_P1 ? gameState.p1Tnts : gameState.p2Tnts;

  // Once all TNTs are placed, ignore any further clicks to prevent transition bugs
  if (gameState.placedCount >= gameState.tntPerPlayer) return;

  // Once a TNT is placed, it cannot be removed
  if (activeSet.has(key)) return;

  if (gameState.placedCount < gameState.tntPerPlayer) {
    if (gameState.rocks.has(key) || isAnyTntAt(key)) return;
    activeSet.add(key);
    gameState.placedCount++;
    cellElement.classList.add('has-tnt', 'tnt-fade');
    spawnParticles(cellElement, 'tnt-place');
  }

  playPlaceSound();
  setControls();
  updateDashboard();

  // Automatic transition when player places all their TNTs (delayed to allow 2s fade animation to complete)
  if (gameState.placedCount === gameState.tntPerPlayer) {
    stopPhaseTimer(); // Freeze the placement countdown timer immediately
    setTimeout(() => {
      advancePlacementPhase();
    }, 2200);
  }
}

function cycleFreeCell(key) {
  if (!gameState.freeTnts.has(key) && !gameState.rocks.has(key)) {
    gameState.freeTnts.add(key);
    playPlaceSound();
  } else if (gameState.freeTnts.has(key)) {
    gameState.freeTnts.delete(key);
    gameState.rocks.add(key);
    playPlaceSound();
  } else {
    gameState.rocks.delete(key);
    playSafeClickSound();
  }

  updateDashboard();
  renderBoard();
}

// Helper: check if there's any TNT at coordinate
function isAnyTntAt(key) {
  return gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key);
}

function advancePlacementPhase() {
  const startPlayer = (gameState.round % 2 === 1) ? 1 : 2;

  if (gameState.phase === PHASES.PLACEMENT_P1) {
    if (startPlayer === 1) {
      gameState.phase = PHASES.PLACEMENT_P2;
      gameState.placedCount = 0;
    } else {
      gameState.phase = PHASES.TURNS;
      gameState.activePlayer = 2; // J2 starts selection
    }
  } else if (gameState.phase === PHASES.PLACEMENT_P2) {
    if (startPlayer === 2) {
      gameState.phase = PHASES.PLACEMENT_P1;
      gameState.placedCount = 0;
    } else {
      gameState.phase = PHASES.TURNS;
      gameState.activePlayer = 1; // J1 starts selection
    }
  }

  setControls();
  updateDashboard();
  renderBoard();
  startPhaseTimer();
  checkBotAction();
}

function finishRoundAttempt() {
  if (gameState.phase !== PHASES.TURNS) return;
  playClickSound();

  if (countRemainingSafeCells() > 0) {
    damagePlayer(gameState.activePlayer);
    if (isGameOver()) {
      endGame();
      return;
    }
  }

  resolveRound();
}

function countRemainingSafeCells() {
  let count = 0;
  for (let y = 0; y < gameState.gridSize; y++) {
    for (let x = 0; x < gameState.gridSize; x++) {
      const key = `${x},${y}`;
      if (!gameState.rocks.has(key) && 
          !gameState.p1Tnts.has(key) && 
          !gameState.p2Tnts.has(key) && 
          !gameState.clickedCells.has(key)) {
        count++;
      }
    }
  }
  return count;
}

function checkRoundAutoResolve() {
  const playableCells = gameState.gridSize * gameState.gridSize - gameState.rocks.size;
  if (gameState.clickedCells.size === playableCells) {
    resolveRound();
  }
}

function resolveRound() {
  clearPendingRound();
  stopPhaseTimer();
  gameState.phase = PHASES.RESOLUTION;
  setControls();
  updateDashboard();
  renderBoard();
  nextRoundId = setTimeout(startNextRound, 2200);
}

function startNextRound() {
  clearPendingRound();
  
  // Record history for AI Bot pattern recognition before clearing
  if (gameState.gameMode === 'solo') {
    const placements = Array.from(gameState.p1Tnts).map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, category: getGridCategory(x, y, gameState.gridSize) };
    });
    gameState.p1PlacementHistory.push(placements);
  }

  gameState.round++;
  gameState.gridSize = Math.min(3 + (gameState.round - 1) * 2, 9); // Round 1: 3x3, Round 2: 5x5, Round 3: 7x7, Round 4+: 9x9
  gameState.tntPerPlayer = getTntsForRound(gameState.round);
  gameState.p1Tnts.clear();
  gameState.p2Tnts.clear();
  gameState.clickedCells.clear();
  gameState.rocks = generateRocksForRound(gameState.round, gameState.gridSize);
  gameState.placedCount = 0;

  // Alternate starting player
  const startPlayer = (gameState.round % 2 === 1) ? 1 : 2;
  gameState.phase = startPlayer === 1 ? PHASES.PLACEMENT_P1 : PHASES.PLACEMENT_P2;

  setControls();
  updateDashboard();
  renderBoard();
  startPhaseTimer();
  checkBotAction();
}

function getTntsForRound(round) {
  return round + 1; // Round 1: 2 TNTs, Round 2: 3 TNTs, etc.
}

function getRockCountForRound(round) {
  if (round === 1) return 1;
  if (round === 2) return 4;
  if (round === 3) return 6;
  if (round === 4) return 8;
  return 10; // Round 5 onwards
}

function generateRocksForRound(round, gridSize) {
  const rocks = new Set();
  const maxRocks = Math.max(0, gridSize * gridSize - getTntsForRound(round) * 2 - 2);
  const targetCount = Math.min(getRockCountForRound(round), maxRocks);
  let attempts = 0;

  while (rocks.size < targetCount && attempts < 500) {
    attempts++;
    const x = Math.floor(Math.random() * gridSize);
    const y = Math.floor(Math.random() * gridSize);
    const key = `${x},${y}`;
    if (!hasOrthogonalNeighbor(key, rocks)) {
      rocks.add(key);
    }
  }

  return rocks;
}

function hasOrthogonalNeighbor(key, keys) {
  const [x, y] = key.split(',').map(Number);
  return keys.has(`${x - 1},${y}`) ||
    keys.has(`${x + 1},${y}`) ||
    keys.has(`${x},${y - 1}`) ||
    keys.has(`${x},${y + 1}`);
}

function forEachBoardKey(callback) {
  for (let y = 0; y < gameState.gridSize; y++) {
    for (let x = 0; x < gameState.gridSize; x++) {
      callback(`${x},${y}`);
    }
  }
}

function restartGame() {
  beginDuel();
}

function returnToMenu() {
  exitFreeMode();
}

function enterFreeMode(size = 3) {
  clearPendingRound();
  stopPhaseTimer();
  gameState = createInitialState();
  gameState.phase = PHASES.FREE;
  gameState.gridSize = size;
  gameState.p1Tnts.clear();
  gameState.p2Tnts.clear();
  gameState.freeTnts.clear();
  gameState.rocks.clear();
  gameState.clickedCells.clear();
  setControls();
  renderHearts();
  updateDashboard();
  renderBoard();
  playClickSound();
}

function exitFreeMode() {
  clearPendingRound();
  stopPhaseTimer();
  gameState = createInitialState();
  setControls();
  renderHearts();
  updateDashboard();
  renderBoard();
  playClickSound();
}

// Abandona una partida en curso (solitario/duelo local u online) y vuelve al
// menú principal. En online, además avisa al servidor para liberar la sala.
function leaveCurrentMatch() {
  if (!confirm('¿Seguro que quieres abandonar la partida? Se perderá el progreso.')) return;
  if (gameState.gameMode === 'online') {
    leaveOnlineRoom();
  } else {
    returnToMenu();
  }
}

function damagePlayer(player) {
  if (player === 1) {
    gameState.p1Lives--;
  } else {
    gameState.p2Lives--;
  }
  renderHearts();
}

function isGameOver() {
  return gameState.p1Lives <= 0 || gameState.p2Lives <= 0;
}

function endGame() {
  clearPendingRound();
  stopPhaseTimer();
  gameState.phase = PHASES.GAME_OVER;
  setControls();
  updateDashboard();
  renderBoard();
  saveMatchResult();
}

// Envía el resultado de la partida terminada a la API PHP/MySQL.
// Si la API no está disponible (p.ej. XAMPP apagado), falla en silencio:
// el juego local no debe romperse por un problema de red o de base de datos.
async function saveMatchResult() {
  const isOnline = gameState.gameMode === 'online';
  const myUsername = currentUser ? currentUser.username : 'Jugador 1';

  // save_match.php siempre atribuye p1Lives/p2Lives a la cuenta que llama (como
  // si fuera J1), así que aquí se traduce "mis vidas / vidas del rival" según
  // mi asiento real en la sala, sea cual sea (1 o 2).
  let p2Name, myLives, opponentLives;
  if (isOnline) {
    const names = gameState.onlineUsernames || [];
    p2Name = (gameState.mySeat === 1 ? names[1] : names[0]) || 'Rival';
    myLives = gameState.mySeat === 1 ? gameState.p1Lives : gameState.p2Lives;
    opponentLives = gameState.mySeat === 1 ? gameState.p2Lives : gameState.p1Lives;
  } else {
    p2Name = 'Bot';
    myLives = gameState.p1Lives;
    opponentLives = gameState.p2Lives;
  }

  const winner = myLives === opponentLives ? 0 : (myLives > opponentLives ? 1 : 2);

  const payload = {
    p1Name: myUsername,
    p2Name,
    gameMode: isOnline ? 'online' : gameState.gameMode,
    difficulty: gameState.gameMode === 'solo' ? gameState.difficulty : null,
    winner,
    p1Lives: myLives,
    p2Lives: opponentLives,
    roundsPlayed: gameState.round
  };

  try {
    const data = await apiFetch('save_match.php', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    // Si hay sesión, la API devuelve el perfil actualizado (monedas/victorias/derrotas).
    if (data.user) {
      applyCurrentUser(data.user);
    }
  } catch (err) {
    console.warn('No se pudo guardar el resultado de la partida en la API:', err.message);
  }
}

// Carga el historial de partidas desde la API y lo pinta en el modal de historial.
async function loadMatchHistory() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;
  listEl.innerHTML = '<li class="history-status">Cargando...</li>';

  try {
    const res = await fetch(`${API_BASE_URL}/get_matches.php?limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderMatchHistory(data.matches || []);
  } catch (err) {
    listEl.innerHTML = '<li class="history-status">No se pudo cargar el historial. ¿Está XAMPP encendido?</li>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function renderMatchHistory(matches) {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  if (matches.length === 0) {
    listEl.innerHTML = '<li class="history-status">Aún no hay partidas guardadas.</li>';
    return;
  }

  listEl.innerHTML = matches.map(m => {
    const p1Name = escapeHtml(m.p1_name);
    const p2Name = escapeHtml(m.p2_name);
    const winnerLabel = m.winner == 0 ? 'Empate' : (m.winner == 1 ? p1Name : p2Name);
    const modeLabel = m.game_mode === 'solo'
      ? `Solitario (${escapeHtml(m.difficulty)})`
      : (m.game_mode === 'online' ? 'Online 1vs1' : '1 vs 1');
    const date = new Date(m.played_at.replace(' ', 'T')).toLocaleString();
    return `<li class="history-row">
      <span class="history-players">${p1Name} vs ${p2Name}</span>
      <span class="history-mode">${modeLabel}</span>
      <span class="history-winner">Ganador: ${winnerLabel}</span>
      <span class="history-date">${date}</span>
    </li>`;
  }).join('');
}

// ================= AUTH / PERFIL / TIENDA =================

// Envoltorio de fetch: añade credentials (cookie de sesión), Content-Type JSON
// por defecto (salvo cuando el body es FormData, p.ej. subida de avatar) y
// convierte respuestas no-OK en un error con el mensaje que manda la API.
async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? options.headers
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const res = await fetch(`${API_BASE_URL}/${path}`, {
    credentials: 'include',
    ...options,
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Aplica el perfil recibido de la API como usuario actual y refresca la UI que depende de él.
function applyCurrentUser(user) {
  currentUser = user;
  updateAuthUI();
  renderHearts();
}

function updateAuthUI() {
  const profileChip = document.getElementById('profileChip');
  const authForms = document.getElementById('authForms');
  if (!profileChip || !authForms) return;

  if (!currentUser) {
    profileChip.style.display = 'none';
    authForms.style.display = 'flex';
    return;
  }

  authForms.style.display = 'none';
  profileChip.style.display = 'flex';
  document.getElementById('profileChipName').innerText = currentUser.username;
  document.getElementById('profileChipCoins').innerHTML = `${currentUser.coins} <img class="coin-icon" src="coin.png" alt="monedas">`;
  document.getElementById('profileChipAvatar').src = currentUser.avatar_path
    ? `${API_BASE_URL}/${currentUser.avatar_path}`
    : DEFAULT_AVATAR;
}

async function registerUser(username, password) {
  const data = await apiFetch('auth/register.php', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return data.user;
}

async function loginUser(username, password) {
  const data = await apiFetch('auth/login.php', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return data.user;
}

async function logoutUser() {
  await apiFetch('auth/logout.php', { method: 'POST' });
}

async function fetchMe() {
  try {
    const data = await apiFetch('auth/me.php');
    return data.user;
  } catch (err) {
    return null;
  }
}

function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profileModalAvatar').src = currentUser.avatar_path
    ? `${API_BASE_URL}/${currentUser.avatar_path}`
    : DEFAULT_AVATAR;
  document.getElementById('profileUsernameInput').value = currentUser.username;
  document.getElementById('profileBioInput').value = currentUser.bio || '';
  document.getElementById('profileStatWins').innerText = `Victorias: ${currentUser.wins}`;
  document.getElementById('profileStatLosses').innerText = `Derrotas: ${currentUser.losses}`;
  document.getElementById('profileStatPlayed').innerText = `Partidas jugadas: ${currentUser.games_played}`;
  document.getElementById('profileStatCoins').innerHTML = `${currentUser.coins} <img class="coin-icon" src="coin.png" alt="monedas">`;
  document.getElementById('profileStatusMsg').innerText = '';
  document.getElementById('profileModal').classList.remove('hide');
}

async function saveProfileChanges() {
  const statusMsg = document.getElementById('profileStatusMsg');
  const username = document.getElementById('profileUsernameInput').value.trim();
  const bio = document.getElementById('profileBioInput').value.trim();

  try {
    const data = await apiFetch('profile/update.php', {
      method: 'POST',
      body: JSON.stringify({ username, bio })
    });
    applyCurrentUser(data.user);
    statusMsg.style.color = '';
    statusMsg.innerText = 'Perfil actualizado.';
  } catch (err) {
    statusMsg.style.color = 'var(--text-red)';
    statusMsg.innerText = err.message;
  }
}

async function uploadAvatar(file) {
  const statusMsg = document.getElementById('profileStatusMsg');
  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const data = await apiFetch('profile/avatar.php', {
      method: 'POST',
      body: formData
    });
    applyCurrentUser(data.user);
    document.getElementById('profileModalAvatar').src = `${API_BASE_URL}/${data.user.avatar_path}`;
    statusMsg.style.color = '';
    statusMsg.innerText = 'Foto de perfil actualizada.';
  } catch (err) {
    statusMsg.style.color = 'var(--text-red)';
    statusMsg.innerText = err.message;
  }
}

async function loadShop() {
  const listEl = document.getElementById('shopList');
  if (!listEl) return;
  listEl.innerHTML = '<li class="history-status">Cargando...</li>';

  try {
    const data = await apiFetch('shop/list.php');
    renderShop(data.items || []);
  } catch (err) {
    listEl.innerHTML = '<li class="history-status">No se pudo cargar la tienda.</li>';
  }
}

function renderShop(items) {
  const listEl = document.getElementById('shopList');
  if (!listEl) return;

  if (!currentUser) {
    listEl.innerHTML = '<li class="history-status">Inicia sesión para comprar y equipar cosméticos.</li>';
    return;
  }

  if (items.length === 0) {
    listEl.innerHTML = '<li class="history-status">No hay cosméticos disponibles.</li>';
    return;
  }

  listEl.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'shop-item';

    const swatch = document.createElement('span');
    swatch.className = 'shop-swatch';
    swatch.style.backgroundColor = item.hex_color;

    const label = document.createElement('span');
    label.className = 'shop-label';
    label.innerText = item.label;

    const price = document.createElement('span');
    price.className = 'shop-price';
    price.innerHTML = item.owned ? '' : `${item.price} <img class="coin-icon" src="coin.png" alt="monedas">`;

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'mc-button mini-btn';

    const isEquipped = currentUser.equipped_heart_color === item.key_name;

    if (!item.owned) {
      actionBtn.innerHTML = '<span>COMPRAR</span>';
      actionBtn.disabled = currentUser.coins < item.price;
      actionBtn.addEventListener('click', () => buyCosmetic(item.id));
    } else if (isEquipped) {
      actionBtn.innerHTML = '<span>QUITAR</span>';
      actionBtn.addEventListener('click', () => equipCosmetic(null));
    } else {
      actionBtn.innerHTML = '<span>EQUIPAR</span>';
      actionBtn.addEventListener('click', () => equipCosmetic(item.key_name));
    }

    li.appendChild(swatch);
    li.appendChild(label);
    li.appendChild(price);
    li.appendChild(actionBtn);
    listEl.appendChild(li);
  });
}

async function buyCosmetic(cosmeticId) {
  try {
    const data = await apiFetch('shop/buy.php', {
      method: 'POST',
      body: JSON.stringify({ cosmeticId })
    });
    applyCurrentUser(data.user);
    loadShop();
  } catch (err) {
    alert(err.message);
  }
}

async function equipCosmetic(keyName) {
  try {
    const data = await apiFetch('shop/equip.php', {
      method: 'POST',
      body: JSON.stringify({ keyName })
    });
    applyCurrentUser(data.user);
    loadShop();
  } catch (err) {
    alert(err.message);
  }
}

// ================= MULTIJUGADOR ONLINE (Socket.IO) =================
// El servidor Node (server.js) es la única fuente de verdad del estado de la
// partida online: cada cliente solo recibe SU vista (sus propias TNTs siempre
// visibles, las del rival ocultas hasta que se revelan). El cliente nunca
// muta gameState directamente en modo online; solo emite la intención
// (colocar/cavar/finalizar) y espera a que llegue el siguiente 'state'.

const SOCKET_URL = 'http://localhost:3000';
let onlineSocket = null;
let onlineMatchSaved = false;

function setOnlineStatus(msg) {
  const el = document.getElementById('onlineStatusMsg');
  if (el) el.innerText = msg;
}

function resetOnlineRoomUI() {
  const idle = document.getElementById('onlineRoomIdle');
  const codeDisplay = document.getElementById('onlineRoomCodeDisplay');
  if (idle) idle.style.display = 'flex';
  if (codeDisplay) codeDisplay.style.display = 'none';
  setOnlineStatus('');
}

function ensureOnlineSocket() {
  if (onlineSocket) return onlineSocket;

  if (typeof io !== 'function') {
    setOnlineStatus('No se pudo conectar al servidor online (¿está corriendo "node server.js"?).');
    return null;
  }

  onlineSocket = io(SOCKET_URL);

  onlineSocket.on('connect_error', () => {
    setOnlineStatus('No se pudo conectar al servidor online (¿está corriendo "node server.js"?).');
  });

  onlineSocket.on('room_created', ({ code }) => {
    const codeDisplay = document.getElementById('onlineRoomCodeDisplay');
    const idle = document.getElementById('onlineRoomIdle');
    const codeValue = document.getElementById('onlineRoomCodeValue');
    if (idle) idle.style.display = 'none';
    if (codeDisplay) codeDisplay.style.display = 'flex';
    if (codeValue) codeValue.innerText = code;
    setOnlineStatus('Esperando al rival... comparte este código con él.');
  });

  onlineSocket.on('room_error', ({ error }) => {
    setOnlineStatus(error);
  });

  onlineSocket.on('opponent_left', () => {
    // Solo avisar de "desconexión" si la partida estaba realmente en curso;
    // si ya había terminado (GAME_OVER) es simplemente que el rival volvió al menú.
    const matchWasInProgress = gameState.gameMode === 'online' &&
      [PHASES.PLACEMENT_P1, PHASES.PLACEMENT_P2, PHASES.TURNS, PHASES.RESOLUTION].includes(gameState.phase);
    if (matchWasInProgress) {
      alert('Tu rival se ha desconectado. La partida ha terminado.');
    }
    leaveOnlineRoom();
  });

  onlineSocket.on('state', (view) => {
    applyOnlineState(view);
  });

  return onlineSocket;
}

function createOnlineRoom() {
  if (!currentUser) {
    setOnlineStatus('Inicia sesión para jugar online.');
    return;
  }
  const socket = ensureOnlineSocket();
  if (!socket) return;
  onlineMatchSaved = false;
  setOnlineStatus('Creando sala...');
  socket.emit('create_room', { username: currentUser.username });
}

function joinOnlineRoom(code) {
  if (!currentUser) {
    setOnlineStatus('Inicia sesión para jugar online.');
    return;
  }
  const trimmedCode = (code || '').trim().toUpperCase();
  if (trimmedCode.length !== 6) {
    setOnlineStatus('El código debe tener 6 caracteres.');
    return;
  }
  const socket = ensureOnlineSocket();
  if (!socket) return;
  onlineMatchSaved = false;
  setOnlineStatus('Uniéndose a la sala...');
  socket.emit('join_room', { code: trimmedCode, username: currentUser.username });
}

function leaveOnlineRoom() {
  if (onlineSocket) {
    onlineSocket.emit('leave_room');
    onlineSocket.disconnect();
    onlineSocket = null;
  }
  resetOnlineRoomUI();
  returnToMenu();
}

// Aplica la vista recibida del servidor al gameState local (de solo lectura:
// nunca se muta gameState en modo online salvo a través de aquí) y repinta.
function applyOnlineState(view) {
  const previouslyClicked = gameState.clickedCells instanceof Set ? gameState.clickedCells : new Set();
  const previousTnts = new Set([
    ...(gameState.p1Tnts instanceof Set ? gameState.p1Tnts : []),
    ...(gameState.p2Tnts instanceof Set ? gameState.p2Tnts : [])
  ]);

  gameState.round = view.round;
  gameState.gridSize = view.gridSize;
  gameState.tntPerPlayer = view.tntPerPlayer;
  gameState.p1Lives = view.p1Lives;
  gameState.p2Lives = view.p2Lives;
  gameState.phase = view.phase;
  gameState.activePlayer = view.activePlayer;
  gameState.placedCount = view.placedCount;
  gameState.mySeat = view.mySeat;
  gameState.gameMode = 'online';
  gameState.onlineUsernames = view.usernames;
  gameState.rocks = new Set(view.rocks);
  gameState.clickedCells = new Set(view.clickedCells);
  // En online las TNTs de ambos jugadores son siempre visibles para los dos
  // (el reto es la memoria, no el secreto), así que se copian tal cual.
  gameState.p1Tnts = new Set(view.p1Tnts);
  gameState.p2Tnts = new Set(view.p2Tnts);

  timeLeft = view.timeLeft;
  updateTimerDisplay();

  // Sonido/partículas para TNTs recién colocadas (por mí o por el rival, en vivo).
  // También se anota el momento exacto de colocación: cada TNT se muestra
  // brevemente y luego se desvanece (como en el modo local), en vez de
  // quedarse visible durante toda la fase de colocación.
  if (!gameState.tntPlacedAt) gameState.tntPlacedAt = {};
  const allTnts = new Set([...gameState.p1Tnts, ...gameState.p2Tnts]);
  const newlyPlaced = [...allTnts].filter((key) => !previousTnts.has(key));
  newlyPlaced.forEach((key) => {
    gameState.tntPlacedAt[key] = Date.now();
    const [x, y] = key.split(',');
    const cellEl = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    playPlaceSound();
    if (cellEl) spawnParticles(cellEl, 'tnt-place');
  });

  // Sonido/partículas para celdas recién reveladas al cavar.
  const newlyClicked = [...gameState.clickedCells].filter((key) => !previouslyClicked.has(key));
  newlyClicked.forEach((key) => {
    const [x, y] = key.split(',');
    const cellEl = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    const exploded = gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key);
    if (exploded) {
      playExplosionSound();
      if (cellEl) spawnParticles(cellEl, 'explosion');
    } else {
      playSafeClickSound();
      if (cellEl) spawnParticles(cellEl, 'safe');
    }
  });

  setControls();
  renderHearts();
  updateDashboard();
  renderBoard();

  if (view.phase === PHASES.GAME_OVER && !onlineMatchSaved) {
    onlineMatchSaved = true;
    saveMatchResult();
  }
}

// Intención de colocar/cavar en modo online: valida localmente lo obvio para
// dar feedback inmediato, pero quien decide de verdad es el servidor.
function handleOnlineCellClick(key) {
  if (!onlineSocket || gameState.rocks.has(key)) return;

  if (gameState.phase === PHASES.PLACEMENT_P1 || gameState.phase === PHASES.PLACEMENT_P2) {
    const myPhase = gameState.mySeat === 1 ? PHASES.PLACEMENT_P1 : PHASES.PLACEMENT_P2;
    if (gameState.phase !== myPhase) return;
    if (gameState.placedCount >= gameState.tntPerPlayer) return;
    // Una casilla no puede tener dos TNTs (ni siquiera de jugadores distintos).
    if (gameState.p1Tnts.has(key) || gameState.p2Tnts.has(key)) return;
    onlineSocket.emit('place_tnt', { key });
    return;
  }

  if (gameState.phase === PHASES.TURNS) {
    if (gameState.activePlayer !== gameState.mySeat) return;
    if (gameState.clickedCells.has(key)) return;
    onlineSocket.emit('dig_cell', { key });
  }
}

function finishOnlineRound() {
  if (!onlineSocket) return;
  if (gameState.phase !== PHASES.TURNS || gameState.activePlayer !== gameState.mySeat) return;
  onlineSocket.emit('finish_round');
}

function clearPendingRound() {
  if (nextRoundId) {
    clearTimeout(nextRoundId);
    nextRoundId = null;
  }
  if (botTimeoutId) {
    clearTimeout(botTimeoutId);
    botTimeoutId = null;
  }
}

function startPhaseTimer() {
  stopPhaseTimer();
  if (gameState.phase !== PHASES.PLACEMENT_P1 &&
      gameState.phase !== PHASES.PLACEMENT_P2 &&
      gameState.phase !== PHASES.TURNS) {
    updateTimerDisplay();
    return;
  }

  timeLeft = PHASE_SECONDS;
  updateTimerDisplay();
  timerId = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      handleTimerExpired();
    }
  }, 1000);
}

function stopPhaseTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  timeLeft = 0;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const timerDisplay = document.getElementById('timerDisplay');
  if (!timerDisplay) return;

  if (!timerId && timeLeft === 0) {
    timerDisplay.innerText = '';
    return;
  }

  timerDisplay.innerText = `Tiempo: ${timeLeft}s`;
}

function handleTimerExpired() {
  stopPhaseTimer();

  // If placement timer expires: subtract a life and go to next round
  if (gameState.phase === PHASES.PLACEMENT_P1 || gameState.phase === PHASES.PLACEMENT_P2) {
    if (gameState.phase === PHASES.PLACEMENT_P1) {
      damagePlayer(1);
    } else {
      damagePlayer(2);
    }
    
    playExplosionSound();

    if (isGameOver()) {
      endGame();
    } else {
      resolveRound();
    }
    return;
  }

  // If turn timer expires: switch player
  if (gameState.phase === PHASES.TURNS) {
    gameState.activePlayer = gameState.activePlayer === 1 ? 2 : 1;
    updateDashboard();
    renderBoard();
    startPhaseTimer();
    checkBotAction();
  }
}

function setControls() {
  const endRoundBtn = document.getElementById('endRoundBtn');
  const freeSizeBtns = FREE_SIZES.map((size) => ({
    size,
    el: document.getElementById(`freeSize${size}Btn`)
  }));
  const modeBox = document.getElementById('modeBox');
  const difficultyBox = document.getElementById('difficultyBox');
  const onlineRoomPanel = document.getElementById('onlineRoomPanel');

  // Filas de la sección de controles: cada fase de juego muestra una única
  // fila entera (nunca botones sueltos con las demás filas vacías ocupando
  // espacio), para que el panel quede siempre centrado y sin huecos.
  const primaryActionsRow = document.getElementById('primaryActionsRow');
  const secondaryActionsRow = document.getElementById('secondaryActionsRow');
  const matchControlsRow = document.getElementById('matchControlsRow');
  const freeSizeRow = document.getElementById('freeSizeRow');
  const exitFreeModeRow = document.getElementById('exitFreeModeRow');
  const gameOverRow = document.getElementById('gameOverRow');

  const isReady = gameState.phase === PHASES.READY;
  const isFree = gameState.phase === PHASES.FREE;
  const isGameOver = gameState.phase === PHASES.GAME_OVER;
  const isOnlineMode = gameState.gameMode === 'online';
  const isMatchInProgress = [
    PHASES.PLACEMENT_P1,
    PHASES.PLACEMENT_P2,
    PHASES.TURNS,
    PHASES.RESOLUTION
  ].includes(gameState.phase);

  // En modo online no hay un botón genérico de "empezar": la partida arranca
  // sola en cuanto la sala tiene 2 jugadores. En su lugar se muestra el panel
  // de crear/unirse a sala.
  if (primaryActionsRow) primaryActionsRow.style.display = (isReady && !isOnlineMode) ? 'flex' : 'none';
  if (secondaryActionsRow) secondaryActionsRow.style.display = isReady ? 'flex' : 'none';
  if (modeBox) modeBox.style.display = isReady ? 'flex' : 'none';
  if (difficultyBox) difficultyBox.style.display = (isReady && !isOnlineMode) ? 'flex' : 'none';
  if (onlineRoomPanel) onlineRoomPanel.style.display = (isReady && isOnlineMode) ? 'flex' : 'none';

  const isBotThinking = gameState.gameMode === 'solo' &&
                        ((gameState.phase === PHASES.PLACEMENT_P2) ||
                         (gameState.phase === PHASES.TURNS && gameState.activePlayer === 2));
  const isWaitingOnlineOpponent = isOnlineMode &&
                        gameState.phase === PHASES.TURNS &&
                        gameState.activePlayer !== gameState.mySeat;

  if (matchControlsRow) matchControlsRow.style.display = isMatchInProgress ? 'flex' : 'none';
  if (endRoundBtn) {
    endRoundBtn.style.display = gameState.phase === PHASES.TURNS ? 'inline-flex' : 'none';
    if (isBotThinking || isWaitingOnlineOpponent) {
      endRoundBtn.classList.add('disabled');
    } else {
      endRoundBtn.classList.remove('disabled');
    }
  }

  if (freeSizeRow) freeSizeRow.style.display = isFree ? 'flex' : 'none';
  freeSizeBtns.forEach(({ size, el }) => {
    if (!el) return;
    el.classList.toggle('disabled', !(isFree && gameState.gridSize !== size));
  });

  if (exitFreeModeRow) exitFreeModeRow.style.display = isFree ? 'flex' : 'none';
  if (gameOverRow) gameOverRow.style.display = isGameOver ? 'flex' : 'none';
}

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playClickSound() {
  if (!isSoundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.06);
}

function playPlaceSound() {
  if (!isSoundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(120, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.09);
}

function playSafeClickSound() {
  if (!isSoundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.09);
}

function playExplosionSound() {
  if (!isSoundEnabled || !audioCtx) return;
  const now = audioCtx.currentTime;
  const noiseBufferSize = audioCtx.sampleRate * 0.35;
  const noiseBuffer = audioCtx.createBuffer(1, noiseBufferSize, audioCtx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < noiseBufferSize; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const noiseGain = audioCtx.createGain();
  const boom = audioCtx.createOscillator();
  const boomGain = audioCtx.createGain();

  noise.buffer = noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, now);
  filter.frequency.exponentialRampToValueAtTime(150, now + 0.3);
  noiseGain.gain.setValueAtTime(0.45, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  boom.type = 'triangle';
  boom.frequency.setValueAtTime(150, now);
  boom.frequency.exponentialRampToValueAtTime(30, now + 0.5);
  boomGain.gain.setValueAtTime(0.75, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  boom.connect(boomGain);
  boomGain.connect(audioCtx.destination);
  noise.start(now);
  boom.start(now);
  noise.stop(now + 0.4);
  boom.stop(now + 0.6);
}

function startMusic() {
  initAudio();
  if (isMusicPlaying) return;
  isMusicPlaying = true;
  playMusicTick();
  musicInterval = setInterval(playMusicTick, 1500);
}

function stopMusic() {
  isMusicPlaying = false;
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
}

function playMusicTick() {
  if (!isMusicPlaying || !audioCtx) return;
  const chord = tensionChords[currentChordIndex];

  if (musicTickCounter % 8 === 0) {
    currentChordIndex = (currentChordIndex + 1) % tensionChords.length;
    playSoftTone(chord.bass, 0.08, 'triangle', 4.0, 0.5);
  }

  if (Math.random() < 0.7) {
    const note = chord.treble[Math.floor(Math.random() * chord.treble.length)];
    setTimeout(() => {
      if (isMusicPlaying) playSoftTone(note, 0.03, 'triangle', 2.5, 0.3);
    }, Math.random() * 300);
  }

  musicTickCounter++;
}

function playSoftTone(freq, volume, type, duration, attack) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  const now = audioCtx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + attack);
  gainNode.gain.setValueAtTime(volume, now + attack + duration * 0.2);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.1);
}

function spawnParticles(cell, type) {
  const particleCount = type === 'explosion' ? 20 : 12;
  const colorsByType = {
    explosion: ['#ff4400', '#ffaa00', '#3a3a3a', '#111111', '#db2e2e', '#ffdd00'],
    safe: ['#55ff55', '#aaffaa', '#245224', '#77cc77'],
    'tnt-place': ['#db2e2e', '#ffffff', '#2a2a2a', '#737373']
  };
  const colors = colorsByType[type] || colorsByType.safe;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const distance = 15 + Math.random() * 28;

    particle.className = 'particle';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${35 + Math.random() * 30}%`;
    particle.style.top = `${35 + Math.random() * 30}%`;
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    cell.appendChild(particle);
    setTimeout(() => particle.remove(), 500);
  }
}

// ================= BOT AI LOGIC =================

let botTimeoutId = null;

function getGridCategory(x, y, gridSize) {
  const max = gridSize - 1;
  const isCorner = (x === 0 || x === max) && (y === 0 || y === max);
  if (isCorner) return 'corner';
  const isEdge = x === 0 || x === max || y === 0 || y === max;
  if (isEdge) return 'edge';
  return 'center';
}

function isAdjacentToRock(x, y) {
  const neighbors = [
    { x: x - 1, y: y },
    { x: x + 1, y: y },
    { x: x, y: y - 1 },
    { x: x, y: y + 1 }
  ];
  return neighbors.some(n => gameState.rocks.has(`${n.x},${n.y}`));
}

function isAdjacentToSafeClicked(x, y) {
  const neighbors = [
    { x: x - 1, y: y },
    { x: x + 1, y: y },
    { x: x, y: y - 1 },
    { x: x, y: y + 1 }
  ];
  return neighbors.some(n => {
    const key = `${n.x},${n.y}`;
    return gameState.clickedCells.has(key) && !isAnyTntAt(key);
  });
}

function getP1PlacementRatios() {
  let cornerCount = 0;
  let edgeCount = 0;
  let centerCount = 0;
  let total = 0;

  gameState.p1PlacementHistory.forEach(placements => {
    placements.forEach(pos => {
      total++;
      if (pos.category === 'corner') cornerCount++;
      else if (pos.category === 'edge') edgeCount++;
      else if (pos.category === 'center') centerCount++;
    });
  });

  if (total === 0) {
    return { corner: 0.33, edge: 0.33, center: 0.34 };
  }

  return {
    corner: cornerCount / total,
    edge: edgeCount / total,
    center: centerCount / total
  };
}

function getP1ClickRatios() {
  let corner = 0, edge = 0, center = 0, total = 0;
  gameState.p1ClickHistory.forEach(click => {
    total++;
    if (click.category === 'corner') corner++;
    else if (click.category === 'edge') edge++;
    else if (click.category === 'center') center++;
  });

  if (total === 0) {
    return { corner: 0.33, edge: 0.33, center: 0.34 };
  }
  return {
    corner: corner / total,
    edge: edge / total,
    center: center / total
  };
}

function makeBotPlacement() {
  const validCells = [];
  for (let y = 0; y < gameState.gridSize; y++) {
    for (let x = 0; x < gameState.gridSize; x++) {
      const key = `${x},${y}`;
      const isRock = gameState.rocks.has(key);
      const isP1Tnt = gameState.gameMode === 'solo' && gameState.p1Tnts.has(key);
      if (!isRock && !isP1Tnt) {
        validCells.push({ x, y, key });
      }
    }
  }

  const selected = new Set();
  const tempCells = validCells.map(c => {
    let w = 1.0;
    if (gameState.difficulty === 'hard') {
      const clickRatios = getP1ClickRatios();
      const cat = getGridCategory(c.x, c.y, gameState.gridSize);
      w += 3.0 * (1.0 - (clickRatios[cat] || 0.33));
      
      if (isAdjacentToRock(c.x, c.y)) {
        w += 1.5;
      }
    }
    return { ...c, w };
  });

  for (let i = 0; i < gameState.tntPerPlayer; i++) {
    if (tempCells.length === 0) break;

    const totalW = tempCells.reduce((sum, c) => sum + c.w, 0);
    if (totalW <= 0) {
      const idx = Math.floor(Math.random() * tempCells.length);
      const chosen = tempCells.splice(idx, 1)[0];
      selected.add(chosen.key);
      continue;
    }

    let r = Math.random() * totalW;
    let chosenIdx = 0;
    for (let j = 0; j < tempCells.length; j++) {
      r -= tempCells[j].w;
      if (r <= 0) {
        chosenIdx = j;
        break;
      }
    }

    const chosen = tempCells.splice(chosenIdx, 1)[0];
    selected.add(chosen.key);

    if (gameState.difficulty === 'medium') {
      tempCells.forEach(tc => {
        const dx = Math.abs(tc.x - chosen.x);
        const dy = Math.abs(tc.y - chosen.y);
        if (dx + dy === 1) {
          tc.w *= 0.1;
        }
      });
    }
  }

  return selected;
}

function makeBotSelection() {
  const available = [];
  for (let y = 0; y < gameState.gridSize; y++) {
    for (let x = 0; x < gameState.gridSize; x++) {
      const key = `${x},${y}`;
      if (!gameState.rocks.has(key) && !gameState.clickedCells.has(key)) {
        available.push({ x, y, key });
      }
    }
  }

  if (available.length === 0) return 'finish';

  const totalTnts = gameState.tntPerPlayer;
  const N = available.length;

  if (N <= totalTnts) {
    return 'finish';
  }

  const knownTnts = new Set();
  const cheatChance = gameState.difficulty === 'hard' ? 0.45 : (gameState.difficulty === 'medium' ? 0.20 : 0.0);
  if (Math.random() < cheatChance) {
    gameState.p1Tnts.forEach(key => knownTnts.add(key));
  }

  const unknownSafeCells = available.filter(cell => !knownTnts.has(cell.key));
  if (unknownSafeCells.length === 0) {
    return 'finish';
  }

  let bestCell = null;
  let minScore = Infinity;

  const ratios = getP1PlacementRatios();

  available.forEach(cell => {
    let score = 0;

    if (knownTnts.has(cell.key)) {
      score += 9999;
    }

    if (gameState.difficulty === 'medium') {
      if (isAdjacentToRock(cell.x, cell.y)) {
        score += 1.0;
      }
      if (isAdjacentToSafeClicked(cell.x, cell.y)) {
        score -= 0.5;
      }
    } else if (gameState.difficulty === 'hard') {
      if (isAdjacentToRock(cell.x, cell.y)) {
        score += 1.5;
      }
      if (isAdjacentToSafeClicked(cell.x, cell.y)) {
        score -= 1.0;
      }
      
      const cat = getGridCategory(cell.x, cell.y, gameState.gridSize);
      score += (ratios[cat] || 0.33) * 3.0;
    }

    score += Math.random() * 0.05;

    if (score < minScore) {
      minScore = score;
      bestCell = cell.key;
    }
  });

  return bestCell;
}

function runBotPlacement() {
  if (gameState.phase !== PHASES.PLACEMENT_P2) return;
  
  const targetKeys = Array.from(makeBotPlacement());
  gameState.p2Tnts.clear();
  gameState.placedCount = 0;

  function placeStep(index) {
    if (gameState.phase !== PHASES.PLACEMENT_P2) return;
    
    if (index < targetKeys.length) {
      const key = targetKeys[index];
      gameState.p2Tnts.add(key);
      gameState.placedCount++;
      
      const [x, y] = key.split(',');
      const cellElement = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (cellElement) {
        cellElement.classList.add('has-tnt', 'tnt-fade');
        spawnParticles(cellElement, 'tnt-place');
      }
      
      playPlaceSound();
      updateDashboard();
      
      const delay = 500 + Math.random() * 500; // 0.5 - 1.0 seconds
      botTimeoutId = setTimeout(() => placeStep(index + 1), delay);
    } else {
      botTimeoutId = setTimeout(() => {
        advancePlacementPhase();
      }, 2000);
    }
  }

  placeStep(0);
}

function runBotTurn() {
  if (gameState.phase !== PHASES.TURNS || gameState.activePlayer !== 2) return;

  const decision = makeBotSelection();

  if (decision === 'finish') {
    finishRoundAttempt();
  } else {
    const x = decision.split(',')[0];
    const y = decision.split(',')[1];
    const cellElement = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    handleCellClick(decision, cellElement, true);
  }
}

function checkBotAction() {
  if (gameState.gameMode !== 'solo') return;

  if (botTimeoutId) {
    clearTimeout(botTimeoutId);
    botTimeoutId = null;
  }

  if (gameState.phase === PHASES.PLACEMENT_P2) {
    stopPhaseTimer();
    const delay = 1200 + Math.random() * 800;
    botTimeoutId = setTimeout(runBotPlacement, delay);
  } else if (gameState.phase === PHASES.TURNS && gameState.activePlayer === 2) {
    stopPhaseTimer();
    const delay = 1200 + Math.random() * 800;
    botTimeoutId = setTimeout(runBotTurn, delay);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startDuelBtn');
  const startAudioBtn = document.getElementById('startAudioBtn');
  const audioModal = document.getElementById('audioModal');
  const freeBtn = document.getElementById('freeModeBtn');
  const endRoundBtn = document.getElementById('endRoundBtn');
  const restartBtn = document.getElementById('restartGameBtn');
  const exitFreeModeBtn = document.getElementById('exitFreeModeBtn');
  const musicToggle = document.getElementById('musicToggle');
  const soundToggle = document.getElementById('soundToggle');

  // Setup mode & difficulty buttons
  const modeOnlineBtn = document.getElementById('modeOnlineBtn');
  const modeSoloBtn = document.getElementById('modeSoloBtn');
  const onlineRoomPanel = document.getElementById('onlineRoomPanel');
  const diffEasyBtn = document.getElementById('diffEasyBtn');
  const diffMediumBtn = document.getElementById('diffMediumBtn');
  const diffHardBtn = document.getElementById('diffHardBtn');

  if (modeOnlineBtn && modeSoloBtn) {
    modeOnlineBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      currentSelectedMode = 'online';
      if (gameState) gameState.gameMode = 'online';
      modeOnlineBtn.classList.add('active');
      modeSoloBtn.classList.remove('active');
      updateDashboard();
      setControls();
    });

    modeSoloBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      currentSelectedMode = 'solo';
      if (gameState) gameState.gameMode = 'solo';
      modeSoloBtn.classList.add('active');
      modeOnlineBtn.classList.remove('active');
      updateDashboard();
      setControls();
    });
  }

  const diffBtns = [
    { el: diffEasyBtn, value: 'easy' },
    { el: diffMediumBtn, value: 'medium' },
    { el: diffHardBtn, value: 'hard' }
  ];

  diffBtns.forEach(btnInfo => {
    if (btnInfo.el) {
      btnInfo.el.addEventListener('click', () => {
        initAudio();
        playClickSound();
        currentSelectedDifficulty = btnInfo.value;
        if (gameState) gameState.difficulty = btnInfo.value;
        diffBtns.forEach(b => {
          if (b.el) b.el.classList.toggle('active', b.value === btnInfo.value);
        });
      });
    }
  });

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      initAudio();
      startMusic();
      if (musicToggle) {
        musicToggle.querySelector('span').innerText = 'ON';
        musicToggle.classList.remove('muted');
      }
      beginDuel();
    });
  }

  if (freeBtn) {
    freeBtn.addEventListener('click', () => {
      initAudio();
      enterFreeMode(3);
    });
  }

  const historyBtnEl = document.getElementById('historyBtn');
  const historyModal = document.getElementById('historyModal');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');

  if (historyBtnEl && historyModal) {
    historyBtnEl.addEventListener('click', () => {
      initAudio();
      playClickSound();
      historyModal.classList.remove('hide');
      loadMatchHistory();
    });
  }

  if (closeHistoryBtn && historyModal) {
    closeHistoryBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      historyModal.classList.add('hide');
    });
  }

  if (startAudioBtn) {
    startAudioBtn.addEventListener('click', () => {
      initAudio();
      if (audioModal) audioModal.classList.add('hide');
      startMusic();
      beginDuel();
    });
  }

  if (endRoundBtn) {
    endRoundBtn.addEventListener('click', () => {
      initAudio();
      if (gameState.gameMode === 'online') {
        finishOnlineRound();
      } else {
        finishRoundAttempt();
      }
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      initAudio();
      restartGame();
    });
  }

  const menuBtnEl = document.getElementById('menuBtn');
  if (menuBtnEl) {
    menuBtnEl.addEventListener('click', () => {
      initAudio();
      returnToMenu();
    });
  }

  const leaveMatchBtn = document.getElementById('leaveMatchBtn');
  if (leaveMatchBtn) {
    leaveMatchBtn.addEventListener('click', () => {
      initAudio();
      leaveCurrentMatch();
    });
  }

  // ===== Sala online =====
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const cancelRoomBtn = document.getElementById('cancelRoomBtn');

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      createOnlineRoom();
    });
  }
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      joinOnlineRoom(joinCodeInput ? joinCodeInput.value : '');
    });
  }
  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', () => {
      joinCodeInput.value = joinCodeInput.value.toUpperCase();
    });
  }
  if (cancelRoomBtn) {
    cancelRoomBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      leaveOnlineRoom();
    });
  }

  FREE_SIZES.forEach((size) => {
    const btn = document.getElementById(`freeSize${size}Btn`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      initAudio();
      enterFreeMode(size);
    });
  });

  if (exitFreeModeBtn) {
    exitFreeModeBtn.addEventListener('click', () => {
      initAudio();
      exitFreeMode();
    });
  }

  if (musicToggle) {
    musicToggle.addEventListener('click', () => {
      initAudio();
      playClickSound();
      if (isMusicPlaying) {
        stopMusic();
        musicToggle.querySelector('span').innerText = 'OFF';
        musicToggle.classList.add('muted');
      } else {
        startMusic();
        musicToggle.querySelector('span').innerText = 'ON';
        musicToggle.classList.remove('muted');
      }
    });
  }

  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      initAudio();
      isSoundEnabled = !isSoundEnabled;
      playClickSound();
      soundToggle.querySelector('span').innerText = isSoundEnabled ? 'ON' : 'OFF';
      soundToggle.classList.toggle('muted', !isSoundEnabled);
    });
  }

  // ===== Auth =====
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const authStatusMsg = document.getElementById('authStatusMsg');

  if (showRegisterBtn) showRegisterBtn.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'flex';
    if (authStatusMsg) authStatusMsg.innerText = '';
  });
  if (showLoginBtn) showLoginBtn.addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'flex';
    if (authStatusMsg) authStatusMsg.innerText = '';
  });

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('loginUser').value.trim();
      const p = document.getElementById('loginPass').value;
      try {
        const user = await loginUser(u, p);
        applyCurrentUser(user);
        loginForm.reset();
        if (authStatusMsg) authStatusMsg.innerText = '';
      } catch (err) {
        if (authStatusMsg) authStatusMsg.innerText = err.message;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('regUser').value.trim();
      const p = document.getElementById('regPass').value;
      try {
        const user = await registerUser(u, p);
        applyCurrentUser(user);
        registerForm.reset();
        if (authStatusMsg) authStatusMsg.innerText = '';
      } catch (err) {
        if (authStatusMsg) authStatusMsg.innerText = err.message;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      applyCurrentUser(null);
    });
  }

  // ===== Perfil =====
  const openProfileBtn = document.getElementById('openProfileBtn');
  const closeProfileBtn = document.getElementById('closeProfileBtn');
  const profileModal = document.getElementById('profileModal');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const avatarFileInput = document.getElementById('avatarFileInput');

  if (openProfileBtn && profileModal) {
    openProfileBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      openProfileModal();
    });
  }
  if (closeProfileBtn && profileModal) {
    closeProfileBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      profileModal.classList.add('hide');
    });
  }
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
      initAudio();
      saveProfileChanges();
    });
  }
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', () => {
      if (avatarFileInput.files && avatarFileInput.files[0]) {
        uploadAvatar(avatarFileInput.files[0]);
      }
    });
  }

  // ===== Tienda =====
  const openShopBtn = document.getElementById('openShopBtn');
  const closeShopBtn = document.getElementById('closeShopBtn');
  const shopModal = document.getElementById('shopModal');

  if (openShopBtn && shopModal) {
    openShopBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      shopModal.classList.remove('hide');
      loadShop();
    });
  }
  if (closeShopBtn && shopModal) {
    closeShopBtn.addEventListener('click', () => {
      initAudio();
      playClickSound();
      shopModal.classList.add('hide');
    });
  }

  setControls();
  renderHearts();
  updateDashboard();
  renderBoard();

  // Comprueba si ya hay una sesión activa (cookie de un login anterior)
  fetchMe().then(applyCurrentUser);
});
