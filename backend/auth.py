import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database import get_connection

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleAuthBody(BaseModel):
    credential: str


class ProfileUpdateBody(BaseModel):
    username: str | None = None
    avatar: str | None = None


def create_token(user_id: int, username: str, role: str = "user") -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"id": payload["sub"], "username": payload["username"], "role": payload.get("role", "user")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado: se requiere rol de administrador")
    return user


@router.post("/google")
def google_auth(body: GoogleAuthBody):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID no configurado en el servidor")

    try:
        idinfo = id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Token de Google inválido")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    name = idinfo.get("name", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="No se pudo obtener el email de Google")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Try to find user by google_id
        cursor.execute(
            "SELECT id, username, email, role, avatar, google_id FROM users WHERE google_id = %s",
            (google_id,),
        )
        user = cursor.fetchone()

        if not user:
            # Try to find by email (link existing account or admin placeholder)
            cursor.execute(
                "SELECT id, username, email, role, avatar, google_id FROM users WHERE email = %s",
                (email,),
            )
            user = cursor.fetchone()

            if user:
                # Link Google account to existing user
                cursor.execute(
                    "UPDATE users SET google_id = %s WHERE id = %s",
                    (google_id, user["id"]),
                )
                conn.commit()
                user["google_id"] = google_id
            else:
                # Auto-register new user
                cursor.execute(
                    "INSERT INTO users (username, email, google_id) VALUES (%s, %s, %s)",
                    (name, email, google_id),
                )
                conn.commit()
                user = {
                    "id": cursor.lastrowid,
                    "username": name,
                    "email": email,
                    "role": "user",
                    "avatar": "default",
                    "google_id": google_id,
                }

        token = create_token(user["id"], user["username"], user["role"])
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "role": user["role"],
                "avatar": user.get("avatar", "default"),
            },
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, username, email, role, avatar, created_at FROM users WHERE id = %s", (user["id"],))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return {"user": {"id": row["id"], "username": row["username"], "email": row["email"], "role": row["role"], "avatar": row.get("avatar", "default")}}
    finally:
        cursor.close()
        conn.close()


VALID_AVATARS = ["default", "cat", "dog", "fox", "panda", "owl", "rabbit", "bear", "koala", "penguin", "music", "headphones"]


@router.put("/profile")
def update_profile(body: ProfileUpdateBody, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        updates = []
        values = []
        if body.username is not None:
            cursor.execute("SELECT id FROM users WHERE username = %s AND id != %s", (body.username, user["id"]))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso")
            updates.append("username = %s")
            values.append(body.username)
        if body.avatar is not None:
            if body.avatar not in VALID_AVATARS:
                raise HTTPException(status_code=400, detail="Avatar inválido")
            updates.append("avatar = %s")
            values.append(body.avatar)

        if not updates:
            raise HTTPException(status_code=400, detail="No se proporcionaron campos para actualizar")

        values.append(user["id"])
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", values)
        conn.commit()

        cursor.execute("SELECT id, username, email, role, avatar FROM users WHERE id = %s", (user["id"],))
        row = cursor.fetchone()
        new_token = create_token(row["id"], row["username"], row["role"])
        return {
            "token": new_token,
            "user": {"id": row["id"], "username": row["username"], "email": row["email"], "role": row["role"], "avatar": row["avatar"]},
        }
    finally:
        cursor.close()
        conn.close()
