from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from database import get_connection
from auth import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class UpdateUserBody(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
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
