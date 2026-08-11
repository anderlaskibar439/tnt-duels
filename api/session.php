<?php
// Sesión PHP nativa: guarda el user_id logueado en $_SESSION, respaldado por
// una cookie httpOnly. El frontend debe llamar a fetch() con `credentials: 'include'`
// para que el navegador envíe y acepte esta cookie.
if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'samesite' => 'Lax',
        'httponly' => true,
    ]);
    session_start();
}

function currentUserId(): ?int {
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function requireLogin(): int {
    $id = currentUserId();
    if ($id === null) {
        http_response_code(401);
        echo json_encode(['error' => 'No has iniciado sesión']);
        exit;
    }
    return $id;
}
