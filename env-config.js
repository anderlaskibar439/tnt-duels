// Configuración de entorno: en local (XAMPP) todo apunta a rutas/puertos
// locales, tal cual siempre. En producción (p.ej. servido desde GitHub
// Pages) apunta al backend desplegado en la nube.
//
// Rellena PROD_API_BASE_URL y PROD_SOCKET_URL con las URLs reales una vez
// desplegado el backend (API PHP+MySQL y servidor Node/Socket.IO).
(function () {
  const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  const PROD_API_BASE_URL = 'https://TU-HOSTING-PHP.example.com/api';
  const PROD_SOCKET_URL = 'https://tnt-duels.onrender.com';

  window.TNT_CONFIG = {
    API_BASE_URL: isLocal ? 'api' : PROD_API_BASE_URL,
    SOCKET_URL: isLocal ? 'http://localhost:3000' : PROD_SOCKET_URL,
  };
})();
