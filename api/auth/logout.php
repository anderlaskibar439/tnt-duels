<?php
require_once __DIR__ . '/../cors.php';
require_once __DIR__ . '/../session.php';

$_SESSION = [];
session_destroy();

echo json_encode(['success' => true]);
