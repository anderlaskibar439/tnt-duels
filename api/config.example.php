<?php
// Credenciales de conexión a MySQL.
// Copia este archivo como config.php y edita estos 4 valores según tu
// instalación (por defecto en XAMPP: host=localhost, user=root, sin contraseña).
//
// En hosting en la nube que soporte variables de entorno (Render, Railway,
// etc.) puedes en vez de eso definir DB_HOST/DB_NAME/DB_USER/DB_PASS como
// variables de entorno del servicio y dejar estos valores como están: se
// usan solo si la variable de entorno correspondiente no existe.

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'tnt_duels');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
