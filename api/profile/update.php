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
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON inválido']);
    exit;
}

$username = array_key_exists('username', $input) ? trim((string)$input['username']) : null;
$bio = array_key_exists('bio', $input) ? trim((string)$input['bio']) : null;

if ($username !== null && !preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
    http_response_code(400);
    echo json_encode(['error' => 'El usuario debe tener 3-20 caracteres (letras, números o _)']);
    exit;
}
if ($bio !== null) {
    $bio = mb_substr($bio, 0, 200);
}

try {
    $pdo = getDbConnection();

    if ($username !== null) {
        $check = $pdo->prepare('SELECT id FROM users WHERE username = :username AND id != :id');
        $check->execute([':username' => $username, ':id' => $userId]);
        if ($check->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Ese nombre de usuario ya existe']);
            exit;
        }
        $stmt = $pdo->prepare('UPDATE users SET username = :username WHERE id = :id');
        $stmt->execute([':username' => $username, ':id' => $userId]);
    }

    if ($bio !== null) {
        $stmt = $pdo->prepare('UPDATE users SET bio = :bio WHERE id = :id');
        $stmt->execute([':bio' => $bio, ':id' => $userId]);
    }

    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo actualizar el perfil']);
}
