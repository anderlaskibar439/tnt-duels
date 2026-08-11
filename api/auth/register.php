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

if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
    http_response_code(400);
    echo json_encode(['error' => 'El usuario debe tener 3-20 caracteres (letras, números o _)']);
    exit;
}
if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'La contraseña debe tener al menos 6 caracteres']);
    exit;
}

try {
    $pdo = getDbConnection();

    $check = $pdo->prepare('SELECT id FROM users WHERE username = :username');
    $check->execute([':username' => $username]);
    if ($check->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Ese nombre de usuario ya existe']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $insert = $pdo->prepare('INSERT INTO users (username, password_hash) VALUES (:username, :hash)');
    $insert->execute([':username' => $username, ':hash' => $hash]);

    $userId = (int)$pdo->lastInsertId();
    $_SESSION['user_id'] = $userId;

    http_response_code(201);
    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo registrar el usuario']);
}
