<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../session.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

try {
    $pdo = getDbConnection();
    $userId = currentUserId();

    $ownedIds = [];
    if ($userId !== null) {
        $ownedStmt = $pdo->prepare('SELECT cosmetic_id FROM user_cosmetics WHERE user_id = :id');
        $ownedStmt->execute([':id' => $userId]);
        $ownedIds = array_map('intval', array_column($ownedStmt->fetchAll(), 'cosmetic_id'));
    }

    $items = $pdo->query(
        'SELECT id, key_name, label, hex_color, price FROM cosmetics ORDER BY price ASC'
    )->fetchAll();

    foreach ($items as &$item) {
        $item['id'] = (int)$item['id'];
        $item['price'] = (int)$item['price'];
        $item['owned'] = in_array($item['id'], $ownedIds, true);
    }
    unset($item);

    echo json_encode(['success' => true, 'items' => $items]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo cargar la tienda']);
}
