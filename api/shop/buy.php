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
$cosmeticId = filter_var($input['cosmeticId'] ?? null, FILTER_VALIDATE_INT);

if (!$cosmeticId) {
    http_response_code(400);
    echo json_encode(['error' => 'cosmeticId inválido']);
    exit;
}

$pdo = getDbConnection();

try {
    $pdo->beginTransaction();

    // FOR UPDATE bloquea la fila para evitar condiciones de carrera si el
    // usuario hace doble clic en "comprar" muy rápido.
    $item = $pdo->prepare('SELECT price FROM cosmetics WHERE id = :id FOR UPDATE');
    $item->execute([':id' => $cosmeticId]);
    $price = $item->fetchColumn();

    if ($price === false) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Cosmético no encontrado']);
        exit;
    }

    $owned = $pdo->prepare('SELECT 1 FROM user_cosmetics WHERE user_id = :uid AND cosmetic_id = :cid');
    $owned->execute([':uid' => $userId, ':cid' => $cosmeticId]);
    if ($owned->fetch()) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(['error' => 'Ya tienes este cosmético']);
        exit;
    }

    $user = $pdo->prepare('SELECT coins FROM users WHERE id = :id FOR UPDATE');
    $user->execute([':id' => $userId]);
    $coins = $user->fetchColumn();

    if ($coins === false || (int)$coins < (int)$price) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['error' => 'No tienes suficientes monedas']);
        exit;
    }

    $pdo->prepare('UPDATE users SET coins = coins - :price WHERE id = :id')
        ->execute([':price' => $price, ':id' => $userId]);
    $pdo->prepare('INSERT INTO user_cosmetics (user_id, cosmetic_id) VALUES (:uid, :cid)')
        ->execute([':uid' => $userId, ':cid' => $cosmeticId]);

    $pdo->commit();
    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo completar la compra']);
}
