CREATE DATABASE IF NOT EXISTS tnt_duels CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tnt_duels;

CREATE TABLE IF NOT EXISTS matches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  p1_name VARCHAR(50) NOT NULL DEFAULT 'Jugador 1',
  p2_name VARCHAR(50) NOT NULL DEFAULT 'Jugador 2',
  game_mode ENUM('1v1', 'solo', 'online') NOT NULL,
  difficulty ENUM('easy', 'medium', 'hard') DEFAULT NULL,
  winner TINYINT UNSIGNED NOT NULL COMMENT '0 = empate, 1 = gana J1, 2 = gana J2',
  p1_lives_remaining TINYINT UNSIGNED NOT NULL,
  p2_lives_remaining TINYINT UNSIGNED NOT NULL,
  rounds_played INT UNSIGNED NOT NULL,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_played_at (played_at)
) ENGINE=InnoDB;

-- Cuentas de usuario
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  bio VARCHAR(200) DEFAULT NULL,
  avatar_path VARCHAR(255) DEFAULT NULL,
  coins INT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  losses INT UNSIGNED NOT NULL DEFAULT 0,
  games_played INT UNSIGNED NOT NULL DEFAULT 0,
  equipped_heart_color VARCHAR(30) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Catálogo de cosméticos comprables (solo visuales, sin ventaja de juego)
CREATE TABLE IF NOT EXISTS cosmetics (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL,
  hex_color VARCHAR(7) NOT NULL,
  price INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

-- Cosméticos que cada usuario ha desbloqueado
CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id INT UNSIGNED NOT NULL,
  cosmetic_id INT UNSIGNED NOT NULL,
  unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, cosmetic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cosmetic_id) REFERENCES cosmetics(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO cosmetics (key_name, label, hex_color, price) VALUES
  ('blue', 'Corazones Azules', '#3388ff', 50),
  ('green', 'Corazones Verdes', '#33cc66', 50),
  ('purple', 'Corazones Morados', '#aa44ff', 75),
  ('gold', 'Corazones Dorados', '#ffcc22', 100),
  ('cyan', 'Corazones Cian', '#22ddee', 60)
ON DUPLICATE KEY UPDATE label = VALUES(label);
