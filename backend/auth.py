import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

from database import get_connection

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    username: str
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str


class ProfileUpdateBody(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str | None = None
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


@router.post("/register")
def register(body: RegisterBody):
    if not body.username or not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")

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
            "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
            (body.username, body.email, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid
        token = create_token(user_id, body.username, "user")
        return {"token": token, "user": {"id": user_id, "username": body.username, "email": body.email, "role": "user", "avatar": "default"}}
    finally:
        cursor.close()
        conn.close()


@router.post("/login")
def login(body: LoginBody):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email y contraseña son obligatorios")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, username, email, password_hash, role, avatar FROM users WHERE email = %s", (body.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

        if not bcrypt.checkpw(body.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

        token = create_token(user["id"], user["username"], user["role"])
        return {"token": token, "user": {"id": user["id"], "username": user["username"], "email": user["email"], "role": user["role"], "avatar": user.get("avatar", "default")}}
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
        if body.email is not None:
            cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", (body.email, user["id"]))
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
