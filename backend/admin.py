import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import get_connection
from auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserBody(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"


class UpdateUserBody(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None


@router.get("/users")
def list_users(admin: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "username": r["username"],
                "email": r["email"],
                "role": r["role"],
                "createdAt": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    finally:
        cursor.close()
        conn.close()


@router.post("/users")
def create_user(body: CreateUserBody, admin: dict = Depends(require_admin)):
    if not body.username or not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Rol inválido")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE email = %s", (body.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")
        cursor.execute("SELECT id FROM users WHERE username = %s", (body.username,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso")

        password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (username, email, password_hash, role) VALUES (%s, %s, %s, %s)",
            (body.username, body.email, password_hash, body.role),
        )
        conn.commit()
        return {"message": "Usuario creado", "id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UpdateUserBody, admin: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        updates = []
        values = []
        if body.username is not None:
            cursor.execute("SELECT id FROM users WHERE username = %s AND id != %s", (body.username, user_id))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso")
            updates.append("username = %s")
            values.append(body.username)
        if body.email is not None:
            cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", (body.email, user_id))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email")
            updates.append("email = %s")
            values.append(body.email)
        if body.password is not None:
            if len(body.password) < 6:
                raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
            password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            updates.append("password_hash = %s")
            values.append(password_hash)
        if body.role is not None:
            if body.role not in ("user", "admin"):
                raise HTTPException(status_code=400, detail="Rol inválido")
            cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            current = cursor.fetchone()
            if current and current["role"] == "user":
                raise HTTPException(status_code=400, detail="No se puede cambiar el rol de un usuario regular")
            updates.append("role = %s")
            values.append(body.role)

        if not updates:
            raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")

        values.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", values)
        conn.commit()
        return {"message": "Usuario actualizado"}
    finally:
        cursor.close()
        conn.close()


@router.get("/users/{user_id}/search-log")
def get_user_search_log(user_id: int, admin: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        cursor.execute(
            "SELECT id, title, artist, album, spotify_url, youtube_url, score, created_at "
            "FROM search_log WHERE user_id = %s ORDER BY created_at DESC LIMIT 200",
            (user_id,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "artist": r["artist"],
                "album": r["album"],
                "spotifyUrl": r["spotify_url"],
                "youtubeUrl": r["youtube_url"],
                "score": r["score"],
                "timestamp": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    finally:
        cursor.close()
        conn.close()


@router.get("/users/{user_id}/saved")
def get_user_saved(user_id: int, admin: dict = Depends(require_admin)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, title, artist, album, spotify_url, youtube_url, created_at "
            "FROM search_history WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "title": r["title"],
                "artist": r["artist"],
                "album": r["album"],
                "spotifyUrl": r["spotify_url"],
                "youtubeUrl": r["youtube_url"],
                "timestamp": r["created_at"].isoformat(),
            }
            for r in rows
        ]
    finally:
        cursor.close()
        conn.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        return {"message": "Usuario eliminado"}
    finally:
        cursor.close()
        conn.close()
