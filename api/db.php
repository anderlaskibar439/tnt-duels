<?php
require_once __DIR__ . '/config.php';

function getDbConnection(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

// Devuelve el perfil público de un usuario (sin password_hash), incluyendo
// el color de corazón equipado ya resuelto a hex mediante el catálogo de cosméticos.
function fetchUserProfile(PDO $pdo, int $userId): ?array {
    $stmt = $pdo->prepare(
        'SELECT u.id, u.username, u.bio, u.avatar_path, u.coins, u.wins, u.losses, u.games_played,
                u.equipped_heart_color, c.hex_color AS equipped_heart_hex
         FROM users u
         LEFT JOIN cosmetics c ON c.key_name = u.equipped_heart_color
         WHERE u.id = :id'
    );
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}
