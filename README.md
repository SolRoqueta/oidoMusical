# OidoMusical

Aplicacion web que reconoce canciones por tarareo usando ACRCloud. Incluye sistema de autenticacion, historial de busquedas y panel de administracion.

## Tecnologias

**Backend:** Python, FastAPI, MySQL, bcrypt, JWT (PyJWT)
**Frontend:** React 19, Vite, react-router-dom
**API externa:** ACRCloud (reconocimiento de audio)

## Requisitos

- Python 3.12+
- Node.js 18+
- MySQL 9.0
- Cuenta en ACRCloud

## Instalacion

### Base de datos

```sql
CREATE DATABASE oido_musical;
```

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Configurar el archivo `backend/.env`:

```
ACR_ACCESS_KEY=<tu_clave>
ACR_ACCESS_SECRET=<tu_secreto>
ACR_HOST=identify-us-west-2.acrcloud.com

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=oido_musical

JWT_SECRET=oidoMusical_s3cr3t_k3y_2026!
```

### Frontend

```bash
cd frontend
npm install
```

## Ejecucion

### Backend

```bash
cd backend
uvicorn main:app --reload
```

Se ejecuta en http://127.0.0.1:8000

### Frontend

```bash
cd frontend
npm run dev
```

Se ejecuta en http://localhost:5173

## Credenciales

### Administrador

| Campo    | Valor                    |
|----------|--------------------------|
| Email    | admin@oidomusical.com    |
| Password | Admin123                 |

El usuario admin se crea automaticamente al iniciar el backend por primera vez.

### Usuarios de prueba

Los usuarios se registran desde la pagina `/register`.

## Estructura del proyecto

```
oidoMusical/
├── backend/
│   ├── main.py          # API principal, endpoint /recognize
│   ├── auth.py          # Autenticacion: register, login, JWT
│   ├── database.py      # Conexion MySQL, creacion de tablas
│   ├── history.py       # Historial guardado por el usuario
│   ├── admin.py         # ABM de usuarios, historial de busquedas
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Rutas y navbar
│   │   ├── App.css              # Estilos globales
│   │   ├── main.jsx             # Entry point con Router y AuthProvider
│   │   ├── index.css            # Variables CSS (light/dark)
│   │   ├── context/
│   │   │   └── AuthContext.jsx  # Estado de autenticacion
│   │   ├── components/
│   │   │   ├── AudioRecorder.jsx    # Grabacion y resultados
│   │   │   ├── WaveformPlayer.jsx   # Reproductor estilo WhatsApp
│   │   │   ├── SearchHistory.jsx    # Historial del usuario
│   │   │   └── ProtectedRoute.jsx   # Proteccion de rutas
│   │   ├── pages/
│   │   │   ├── Login.jsx        # Pagina de login
│   │   │   ├── Register.jsx     # Pagina de registro
│   │   │   ├── Admin.jsx        # Panel de administracion
│   │   │   └── UserDetail.jsx   # Detalle de usuario (info + historial)
│   │   └── utils/
│   │       └── history.js       # API calls para historial
│   └── public/
│       └── favicon.svg
└── README.md
```

## Base de datos

### Tablas

**users** - Usuarios registrados
| Campo         | Tipo         | Descripcion                     |
|---------------|--------------|---------------------------------|
| id            | INT (PK)     | ID autoincremental              |
| username      | VARCHAR(50)  | Nombre de usuario (unico)       |
| email         | VARCHAR(100) | Email (unico)                   |
| password_hash | VARCHAR(255) | Password hasheada con bcrypt    |
| role          | VARCHAR(20)  | "user" o "admin"                |
| created_at    | TIMESTAMP    | Fecha de creacion               |

**search_history** - Canciones guardadas por el usuario
| Campo       | Tipo         | Descripcion                       |
|-------------|--------------|-----------------------------------|
| id          | INT (PK)     | ID autoincremental                |
| user_id     | INT (FK)     | Referencia a users.id             |
| title       | VARCHAR(255) | Titulo de la cancion              |
| artist      | VARCHAR(255) | Artista                           |
| album       | VARCHAR(255) | Album                             |
| spotify_url | VARCHAR(500) | Link a Spotify                    |
| youtube_url | VARCHAR(500) | Link a YouTube                    |
| created_at  | TIMESTAMP    | Fecha en que se guardo            |

**search_log** - Todas las busquedas realizadas (automatico)
| Campo       | Tipo         | Descripcion                       |
|-------------|--------------|-----------------------------------|
| id          | INT (PK)     | ID autoincremental                |
| user_id     | INT (FK)     | Referencia a users.id             |
| title       | VARCHAR(255) | Titulo de la cancion              |
| artist      | VARCHAR(255) | Artista                           |
| album       | VARCHAR(255) | Album                             |
| spotify_url | VARCHAR(500) | Link a Spotify                    |
| youtube_url | VARCHAR(500) | Link a YouTube                    |
| score       | FLOAT        | Puntaje de coincidencia           |
| created_at  | TIMESTAMP    | Fecha de la busqueda              |

## API Endpoints

### Autenticacion
| Metodo | Ruta            | Descripcion                  | Auth |
|--------|-----------------|------------------------------|------|
| POST   | /auth/register  | Registrar nuevo usuario      | No   |
| POST   | /auth/login     | Iniciar sesion               | No   |
| GET    | /auth/me        | Obtener usuario actual       | Si   |

### Reconocimiento
| Metodo | Ruta       | Descripcion                     | Auth |
|--------|------------|---------------------------------|------|
| POST   | /recognize | Enviar audio para reconocimiento| Si   |
| GET    | /health    | Estado del servidor             | No   |

### Historial (usuario)
| Metodo | Ruta     | Descripcion                      | Auth |
|--------|----------|----------------------------------|------|
| GET    | /history | Obtener historial guardado       | Si   |
| POST   | /history | Guardar cancion en historial     | Si   |
| DELETE | /history | Limpiar historial                | Si   |

### Administracion (solo admin)
| Metodo | Ruta                            | Descripcion                        |
|--------|---------------------------------|------------------------------------|
| GET    | /admin/users                    | Listar todos los usuarios          |
| POST   | /admin/users                    | Crear usuario                      |
| PUT    | /admin/users/{id}               | Editar usuario                     |
| DELETE | /admin/users/{id}               | Eliminar usuario                   |
| GET    | /admin/users/{id}/search-log    | Historial completo de busquedas    |
| GET    | /admin/users/{id}/saved         | Historial guardado del usuario     |

## Funcionalidades

- Reconocimiento de canciones por tarareo (ACRCloud)
- Links directos a Spotify y YouTube por cada resultado
- Reproductor de audio estilo WhatsApp con visualizacion de onda
- Historial de canciones guardadas por el usuario
- Modo claro/oscuro con persistencia
- Sistema de login/registro con passwords hasheadas (bcrypt)
- Tokens JWT con expiracion de 24 horas
- Panel de administracion con ABM de usuarios
- Vista de historial completo de cada usuario (para el admin)
- Responsive (mobile y desktop)
