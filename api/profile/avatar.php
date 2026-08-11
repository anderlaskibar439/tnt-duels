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

if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No se recibió ninguna imagen válida']);
    exit;
}

$file = $_FILES['avatar'];

$maxBytes = 2 * 1024 * 1024; // 2 MB
if ($file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['error' => 'La imagen no puede superar los 2 MB']);
    exit;
}

// No confiamos en la extensión ni en el Content-Type que manda el navegador:
// se detecta el tipo real leyendo los bytes del archivo con finfo.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);
$allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

if (!isset($allowedTypes[$mime])) {
    http_response_code(400);
    echo json_encode(['error' => 'Formato no permitido. Usa JPG, PNG o WEBP']);
    exit;
}

$uploadsDir = __DIR__ . '/../uploads/avatars';
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}

// Nombre de archivo generado por el servidor (nunca el nombre original) para
// evitar path traversal y colisiones.
$filename = 'user_' . $userId . '_' . bin2hex(random_bytes(8)) . '.' . $allowedTypes[$mime];
$destination = $uploadsDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo guardar la imagen']);
    exit;
}

try {
    $pdo = getDbConnection();

    $prevStmt = $pdo->prepare('SELECT avatar_path FROM users WHERE id = :id');
    $prevStmt->execute([':id' => $userId]);
    $prevPath = $prevStmt->fetchColumn();

    $relativePath = 'uploads/avatars/' . $filename;
    $update = $pdo->prepare('UPDATE users SET avatar_path = :path WHERE id = :id');
    $update->execute([':path' => $relativePath, ':id' => $userId]);

    // Borra el avatar anterior para no acumular archivos huérfanos.
    if ($prevPath) {
        $prevFile = realpath(__DIR__ . '/../' . $prevPath);
        $uploadsRealPath = realpath($uploadsDir);
        if ($prevFile && $uploadsRealPath && str_starts_with($prevFile, $uploadsRealPath) && is_file($prevFile)) {
            @unlink($prevFile);
        }
    }

    echo json_encode(['success' => true, 'user' => fetchUserProfile($pdo, $userId)]);
} catch (PDOException $e) {
    @unlink($destination);
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo actualizar el avatar']);
}
