<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../session.php';
require_once __DIR__ . '/../db.php';

$userId = currentUserId();
if ($userId === null) {
    echo json_encode(['user' => null]);
    exit;
}

try {
    $pdo = getDbConnection();
    echo json_encode(['user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al obtener el perfil']);
}
