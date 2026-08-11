const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ================= MOTOR DE JUEGO (autoritativo, vive solo en el servidor) =================
// Mismas reglas que el modo local (rondas, tablero, TNTs, rocas), pero aquí el
// servidor es la única fuente de verdad: cada cliente solo recibe su propia
// vista del estado, sin las posiciones de TNT del rival hasta que se revelan.

const STARTING_LIVES = 3;
const PHASE_SECONDS = 15;
const ROOM_CODE_LENGTH = 6;
// Sin 0/O ni 1/I/L para que el código no se preste a confusión al compartirlo.
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const PHASES = {
  PLACEMENT_P1: 'PLACEMENT_P1',
  PLACEMENT_P2: 'PLACEMENT_P2',
  TURNS: 'TURNS',
  RESOLUTION: 'RESOLUTION',
  GAME_OVER: 'GAME_OVER'
};

const rooms = new Map(); // code -> room

function generateRoomCode() {
  let code;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function getTntsForRound(round) {
  return round + 1;
}

function getRockCountForRound(round) {
  if (round === 1) return 1;
  if (round === 2) return 4;
  if (round === 3) return 6;
  if (round === 4) return 8;
  return 10;
}

function hasOrthogonalNeighbor(key, keySet) {
  const [x, y] = key.split(',').map(Number);
  return keySet.has(`${x - 1},${y}`) ||
    keySet.has(`${x + 1},${y}`) ||
    keySet.has(`${x},${y - 1}`) ||
    keySet.has(`${x},${y + 1}`);
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

function createRoundState(round) {
  const gridSize = Math.min(3 + (round - 1) * 2, 9);
  return {
    round,
    gridSize,
    tntPerPlayer: getTntsForRound(round),
    rocks: generateRocksForRound(round, gridSize),
    p1Tnts: new Set(),
    p2Tnts: new Set(),
    clickedCells: new Set(),
    placedCount: 0
  };
}

function createRoom(code) {
  return {
    code,
    seats: [null, null], // socket.id de cada asiento
    usernames: [null, null],
    matchSaved: false,
    state: {
      ...createRoundState(1),
      p1Lives: STARTING_LIVES,
      p2Lives: STARTING_LIVES,
      activePlayer: 1,
      phase: PHASES.PLACEMENT_P1
    },
    timeLeft: PHASE_SECONDS,
    timerInterval: null,
    placementAdvanceTimeout: null,
    nextRoundTimeout: null,
    createdAt: Date.now()
  };
}

function stopPhaseTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startPhaseTimer(room) {
  stopPhaseTimer(room);
  room.timeLeft = PHASE_SECONDS;
  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      handleTimerExpired(room);
    } else {
      broadcastState(room);
    }
  }, 1000);
}

function damagePlayer(room, player) {
  if (player === 1) room.state.p1Lives--;
  else room.state.p2Lives--;
}

function isGameOver(room) {
  return room.state.p1Lives <= 0 || room.state.p2Lives <= 0;
}

function endGame(room) {
  stopPhaseTimer(room);
  room.state.phase = PHASES.GAME_OVER;
  broadcastState(room);
}

function countRemainingSafeCells(room) {
  const s = room.state;
  let count = 0;
  for (let y = 0; y < s.gridSize; y++) {
    for (let x = 0; x < s.gridSize; x++) {
      const key = `${x},${y}`;
      if (!s.rocks.has(key) && !s.p1Tnts.has(key) && !s.p2Tnts.has(key) && !s.clickedCells.has(key)) {
        count++;
      }
    }
  }
  return count;
}

function resolveRound(room) {
  stopPhaseTimer(room);
  room.state.phase = PHASES.RESOLUTION;
  broadcastState(room);
  room.nextRoundTimeout = setTimeout(() => startNextRound(room), 2200);
}

function startNextRound(room) {
  const nextRound = room.state.round + 1;
  const startPlayer = (nextRound % 2 === 1) ? 1 : 2;

  room.state = {
    ...room.state,
    ...createRoundState(nextRound),
    phase: startPlayer === 1 ? PHASES.PLACEMENT_P1 : PHASES.PLACEMENT_P2
  };

  startPhaseTimer(room);
  broadcastState(room);
}

function advancePlacementPhase(room) {
  const startPlayer = (room.state.round % 2 === 1) ? 1 : 2;

  if (room.state.phase === PHASES.PLACEMENT_P1) {
    if (startPlayer === 1) {
      room.state.phase = PHASES.PLACEMENT_P2;
      room.state.placedCount = 0;
    } else {
      room.state.phase = PHASES.TURNS;
      room.state.activePlayer = 2;
    }
  } else if (room.state.phase === PHASES.PLACEMENT_P2) {
    if (startPlayer === 2) {
      room.state.phase = PHASES.PLACEMENT_P1;
      room.state.placedCount = 0;
    } else {
      room.state.phase = PHASES.TURNS;
      room.state.activePlayer = 1;
    }
  }

  startPhaseTimer(room);
  broadcastState(room);
}

function handleTimerExpired(room) {
  stopPhaseTimer(room);

  if (room.state.phase === PHASES.PLACEMENT_P1 || room.state.phase === PHASES.PLACEMENT_P2) {
    const player = room.state.phase === PHASES.PLACEMENT_P1 ? 1 : 2;
    damagePlayer(room, player);
    if (isGameOver(room)) {
      endGame(room);
    } else {
      resolveRound(room);
    }
    return;
  }

  if (room.state.phase === PHASES.TURNS) {
    room.state.activePlayer = room.state.activePlayer === 1 ? 2 : 1;
    startPhaseTimer(room);
    broadcastState(room);
  }
}

function buildViewForSeat(room, seat) {
  const s = room.state;

  // A diferencia del modo local/solitario, en online las TNTs de ambos
  // jugadores son siempre visibles para los dos desde el momento en que se
  // colocan: el reto del juego es la memoria (recordar dónde están mientras
  // cavas contrarreloj), no el secreto de su ubicación.
  return {
    round: s.round,
    gridSize: s.gridSize,
    tntPerPlayer: s.tntPerPlayer,
    p1Lives: s.p1Lives,
    p2Lives: s.p2Lives,
    phase: s.phase,
    activePlayer: s.activePlayer,
    placedCount: s.placedCount,
    mySeat: seat,
    rocks: [...s.rocks],
    clickedCells: [...s.clickedCells],
    p1Tnts: [...s.p1Tnts],
    p2Tnts: [...s.p2Tnts],
    timeLeft: room.timeLeft,
    usernames: room.usernames
  };
}

function broadcastState(room) {
  room.seats.forEach((socketId, idx) => {
    if (!socketId) return;
    io.to(socketId).emit('state', buildViewForSeat(room, idx + 1));
  });
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  stopPhaseTimer(room);
  if (room.placementAdvanceTimeout) clearTimeout(room.placementAdvanceTimeout);
  if (room.nextRoundTimeout) clearTimeout(room.nextRoundTimeout);
  rooms.delete(code);
}

// ================= SOCKET.IO: SALAS Y EVENTOS =================

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.seat = null;

  socket.on('create_room', ({ username } = {}) => {
    const code = generateRoomCode();
    const room = createRoom(code);
    room.seats[0] = socket.id;
    room.usernames[0] = String(username || 'Jugador 1').slice(0, 20);
    rooms.set(code, room);

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.seat = 1;

    socket.emit('room_created', { code });
  });

  socket.on('join_room', ({ code, username } = {}) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) {
      socket.emit('room_error', { error: 'Esa sala no existe o ya ha terminado.' });
      return;
    }
    if (room.seats[1]) {
      socket.emit('room_error', { error: 'Esa sala ya está completa.' });
      return;
    }

    room.seats[1] = socket.id;
    room.usernames[1] = String(username || 'Jugador 2').slice(0, 20);

    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.seat = 2;

    startPhaseTimer(room);
    broadcastState(room);
  });

  socket.on('place_tnt', ({ key } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !socket.data.seat || typeof key !== 'string') return;
    const seat = socket.data.seat;
    const s = room.state;

    const expectedPhase = seat === 1 ? PHASES.PLACEMENT_P1 : PHASES.PLACEMENT_P2;
    if (s.phase !== expectedPhase) return;
    if (s.placedCount >= s.tntPerPlayer) return;
    if (s.rocks.has(key)) return;
    // Una casilla no puede tener dos TNTs (ni siquiera de jugadores distintos).
    if (s.p1Tnts.has(key) || s.p2Tnts.has(key)) return;

    const mySet = seat === 1 ? s.p1Tnts : s.p2Tnts;
    mySet.add(key);
    s.placedCount++;
    broadcastState(room);

    if (s.placedCount === s.tntPerPlayer) {
      stopPhaseTimer(room);
      room.placementAdvanceTimeout = setTimeout(() => advancePlacementPhase(room), 2200);
    }
  });

  socket.on('dig_cell', ({ key } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !socket.data.seat || typeof key !== 'string') return;
    const seat = socket.data.seat;
    const s = room.state;

    if (s.phase !== PHASES.TURNS) return;
    if (s.activePlayer !== seat) return;
    if (s.rocks.has(key) || s.clickedCells.has(key)) return;

    s.clickedCells.add(key);
    const hasTnt = s.p1Tnts.has(key) || s.p2Tnts.has(key);

    if (hasTnt) {
      damagePlayer(room, seat);
      if (isGameOver(room)) {
        endGame(room);
      } else {
        resolveRound(room);
      }
      return;
    }

    s.activePlayer = s.activePlayer === 1 ? 2 : 1;

    const playableCells = s.gridSize * s.gridSize - s.rocks.size;
    if (s.clickedCells.size === playableCells) {
      resolveRound(room);
      return;
    }

    broadcastState(room);
    startPhaseTimer(room);
  });

  socket.on('finish_round', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !socket.data.seat) return;
    const seat = socket.data.seat;
    const s = room.state;

    if (s.phase !== PHASES.TURNS || s.activePlayer !== seat) return;

    if (countRemainingSafeCells(room) > 0) {
      damagePlayer(room, seat);
      if (isGameOver(room)) {
        endGame(room);
        return;
      }
    }
    resolveRound(room);
  });

  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  function handleDisconnect(sock) {
    const code = sock.data.roomCode;
    sock.data.roomCode = null;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    io.to(code).emit('opponent_left');
    cleanupRoom(code);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
