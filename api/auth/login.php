<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../session.php';
require_once __DIR__ . '/../db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$username = trim((string)($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');

try {
    $pdo = getDbConnection();
    $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE username = :username');
    $stmt->execute([':username' => $username]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Usuario o contraseña incorrectos']);
        exit;
    }

    $userId = (int)$row['id'];
    $_SESSION['user_id'] = $userId;

    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al iniciar sesión']);
}
