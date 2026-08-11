# TNT Duels

Juego de estrategia 1v1 (online o local contra un bot) inspirado en el "Buscaminas" de Minecraft: coloca TNTs y cava casillas por turnos intentando no explotar, mientras intentas recordar dónde están las minas.

- **Frontend**: HTML, CSS y JavaScript puro (pixel-art estilo Minecraft, sin frameworks).
- **Backend de cuentas/partidas**: PHP + MySQL (API REST en `api/`) — registro/login, historial de partidas, monedas y tienda de cosméticos.
- **Multijugador online 1vs1**: Node.js + Socket.IO (`server.js`) — salas con código de 6 caracteres, sincronización de tablero en tiempo real.

## Requisitos

- [XAMPP](https://www.apachefriends.org/) (Apache + MySQL + PHP) para servir el frontend y la API.
- [Node.js](https://nodejs.org/) para el servidor de la partida online.

## Instalación

1. **Copia este proyecto** dentro de `htdocs` de tu instalación de XAMPP (p. ej. `C:\xampp\htdocs\minecraft_tnt_duels`), y arranca Apache y MySQL desde el panel de control de XAMPP.

2. **Base de datos**: crea la base de datos y las tablas ejecutando el script SQL incluido:
   ```bash
   mysql -u root < api/schema.sql
   ```

3. **Configuración de la API**: copia la plantilla y edítala si tu MySQL no usa las credenciales por defecto de XAMPP (`root` sin contraseña):
   ```bash
   cp api/config.example.php api/config.php
   ```

4. **Servidor de multijugador online**:
   ```bash
   npm install
   npm start
   # o para desarrollo con reinicio automático:
   npm run dev
   ```
   Esto levanta el servidor de Socket.IO en `http://localhost:3000`.

5. Abre el juego en el navegador a través de Apache, por ejemplo:
   `http://localhost/minecraft_tnt_duels/`

   (El modo online necesita que el servidor Node del paso 4 esté corriendo a la vez que Apache/MySQL.)

## Modos de juego

- **Online 1vs1**: crea o únete a una sala con un código de 6 caracteres. Requiere haber iniciado sesión.
- **Solitario**: contra un bot con 3 niveles de dificultad.
- **Modo libre**: edita el tablero libremente (tierra, roca, TNT) sin reglas de partida.

## Cuentas

Puedes jugar como invitado en los modos locales, pero el modo online requiere una cuenta (registro con usuario/contraseña). Las cuentas registran victorias, derrotas, partidas jugadas y monedas ganadas, que se pueden gastar en la tienda para desbloquear colores de corazón cosméticos (sin ninguna ventaja de juego).
