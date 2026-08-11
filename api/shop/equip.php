<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../session.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$userId = requireLogin();
$input = json_decode(file_get_contents('php://input'), true);
// keyName = null equivale a "quitar" el cosmético y volver al corazón por defecto.
$keyName = isset($input['keyName']) ? (string)$input['keyName'] : null;

try {
    $pdo = getDbConnection();

    if ($keyName !== null) {
        $check = $pdo->prepare(
            'SELECT c.key_name FROM cosmetics c
             JOIN user_cosmetics uc ON uc.cosmetic_id = c.id
             WHERE uc.user_id = :uid AND c.key_name = :key'
        );
        $check->execute([':uid' => $userId, ':key' => $keyName]);
        if (!$check->fetch()) {
            http_response_code(403);
            echo json_encode(['error' => 'No has desbloqueado ese cosmético']);
            exit;
        }
    }

    $stmt = $pdo->prepare('UPDATE users SET equipped_heart_color = :key WHERE id = :id');
    $stmt->execute([':key' => $keyName, ':id' => $userId]);

    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo equipar el cosmético']);
}
