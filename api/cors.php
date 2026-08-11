<?php
// Cabeceras comunes para todos los endpoints de la API.
// Ahora que hay sesiones (cookies) de por medio, no se puede usar '*' como
// Access-Control-Allow-Origin junto con credentials — hay que reflejar el
// origen concreto de la petición. El frontend debe usar fetch(..., { credentials: 'include' }).
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
