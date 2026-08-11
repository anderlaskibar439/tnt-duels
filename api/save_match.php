<?php
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/db.php';

const COINS_PER_WIN = 10;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON inválido']);
    exit;
}

$p1Name = trim((string)($input['p1Name'] ?? '')) ?: 'Jugador 1';
$p2Name = trim((string)($input['p2Name'] ?? '')) ?: 'Jugador 2';
$p1Name = mb_substr($p1Name, 0, 50);
$p2Name = mb_substr($p2Name, 0, 50);

$allowedGameModes = ['1v1', 'solo', 'online'];
$gameMode = in_array($input['gameMode'] ?? null, $allowedGameModes, true) ? $input['gameMode'] : '1v1';

$allowedDifficulties = ['easy', 'medium', 'hard'];
$difficulty = in_array($input['difficulty'] ?? null, $allowedDifficulties, true)
    ? $input['difficulty']
    : null;

$winner = filter_var($input['winner'] ?? null, FILTER_VALIDATE_INT);
if ($winner === false || !in_array($winner, [0, 1, 2], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'El campo winner debe ser 0 (empate), 1 o 2']);
    exit;
}

$p1Lives = filter_var($input['p1Lives'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$p2Lives = filter_var($input['p2Lives'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$roundsPlayed = filter_var($input['roundsPlayed'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

if ($p1Lives === false || $p2Lives === false || $roundsPlayed === false) {
    http_response_code(400);
    echo json_encode(['error' => 'p1Lives, p2Lives y roundsPlayed deben ser enteros válidos']);
    exit;
}

try {
    $pdo = getDbConnection();
    $stmt = $pdo->prepare(
        'INSERT INTO matches
            (p1_name, p2_name, game_mode, difficulty, winner, p1_lives_remaining, p2_lives_remaining, rounds_played)
         VALUES
            (:p1_name, :p2_name, :game_mode, :difficulty, :winner, :p1_lives, :p2_lives, :rounds_played)'
    );
    $stmt->execute([
        ':p1_name' => $p1Name,
        ':p2_name' => $p2Name,
        ':game_mode' => $gameMode,
        ':difficulty' => $difficulty,
        ':winner' => $winner,
        ':p1_lives' => $p1Lives,
        ':p2_lives' => $p2Lives,
        ':rounds_played' => $roundsPlayed,
    ]);
    $matchId = (int)$pdo->lastInsertId();

    // Si hay una cuenta logueada, se le atribuyen las estadísticas como si
    // fuera el Jugador 1: en solitario el humano siempre es J1, y en online
    // cada cliente llama a este endpoint con SU propia perspectiva (mis vidas
    // como p1Lives, las del rival como p2Lives), así que ambas cuentas quedan
    // bien registradas de forma independiente.
    $updatedUser = null;
    $userId = currentUserId();
    if ($userId !== null) {
        if ($winner === 1) {
            $pdo->prepare(
                'UPDATE users SET wins = wins + 1, games_played = games_played + 1, coins = coins + :coins WHERE id = :id'
            )->execute([':coins' => COINS_PER_WIN, ':id' => $userId]);
        } elseif ($winner === 2) {
            $pdo->prepare(
                'UPDATE users SET losses = losses + 1, games_played = games_played + 1 WHERE id = :id'
            )->execute([':id' => $userId]);
        } else {
            $pdo->prepare(
                'UPDATE users SET games_played = games_played + 1 WHERE id = :id'
            )->execute([':id' => $userId]);
        }
        $updatedUser = fetchUserProfile($pdo, $userId);
    }

    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $matchId, 'user' => $updatedUser]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo guardar la partida']);
}
