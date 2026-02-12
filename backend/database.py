import os
import bcrypt
from mysql.connector import pooling
from dotenv import load_dotenv

load_dotenv()

db_config = {
    "pool_name": "oido_pool",
    "pool_size": 5,
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "oido_musical"),
}

# Enable SSL for cloud databases (TiDB Serverless, etc.)
if os.getenv("DB_SSL", "").lower() in ("true", "1", "yes"):
    import certifi
    db_config["use_pure"] = True
    db_config["ssl_ca"] = certifi.where()
    db_config["ssl_verify_cert"] = True
    db_config["ssl_verify_identity"] = True

pool = pooling.MySQLConnectionPool(**db_config)


def get_connection():
    return pool.get_connection()


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            avatar VARCHAR(20) NOT NULL DEFAULT 'default',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add columns if table already exists without them
    for col, definition in [
        ("role", "VARCHAR(20) NOT NULL DEFAULT 'user'"),
        ("avatar", "VARCHAR(20) NOT NULL DEFAULT 'default'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {definition}")
            conn.commit()
        except Exception:
            pass
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            artist VARCHAR(255) NOT NULL,
            album VARCHAR(255) DEFAULT '',
            spotify_url VARCHAR(500) DEFAULT '',
            youtube_url VARCHAR(500) DEFAULT '',
            hidden TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_song (user_id, title, artist)
        )
    """)
    # Add hidden column if table already exists without it
    try:
        cursor.execute("ALTER TABLE search_history ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0")
        conn.commit()
    except Exception:
        pass
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            artist VARCHAR(255) NOT NULL,
            album VARCHAR(255) DEFAULT '',
            spotify_url VARCHAR(500) DEFAULT '',
            youtube_url VARCHAR(500) DEFAULT '',
            score FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    # Create admin user if not exists
    cursor.execute("SELECT id FROM users WHERE email = %s", ("admin@oidomusical.com",))
    if not cursor.fetchone():
        admin_hash = bcrypt.hashpw("Admin123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, %s)",
            ("admin", "admin@oidomusical.com", admin_hash, "admin"),
        )
    conn.commit()
    cursor.close()
    conn.close()
