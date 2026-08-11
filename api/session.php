<?php
// Sesión PHP nativa: guarda el user_id logueado en $_SESSION, respaldado por
// una cookie httpOnly. El frontend debe llamar a fetch() con `credentials: 'include'`
// para que el navegador envíe y acepte esta cookie.
if (session_status() === PHP_SESSION_NONE) {
    // En local (HTTP) usamos SameSite=Lax, que no necesita HTTPS. En
    // producción el frontend (GitHub Pages) y la API viven en dominios
    // distintos, así que la cookie de sesión necesita SameSite=None +
    // Secure para que el navegador la envíe en peticiones cross-site;
    // eso solo es válido sobre HTTPS.
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'samesite' => $isHttps ? 'None' : 'Lax',
        'secure' => $isHttps,
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
