<?php
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$limit = filter_var($_GET['limit'] ?? 20, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
if ($limit === false) {
    $limit = 20;
}

try {
    $pdo = getDbConnection();
    $stmt = $pdo->prepare(
        'SELECT id, p1_name, p2_name, game_mode, difficulty, winner,
                p1_lives_remaining, p2_lives_remaining, rounds_played, played_at
         FROM matches
         ORDER BY played_at DESC
         LIMIT :limit'
    );
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode(['success' => true, 'matches' => $stmt->fetchAll()]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo cargar el historial']);
}
