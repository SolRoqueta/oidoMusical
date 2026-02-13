import os
import time
import random
import secrets
import asyncio

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from dotenv import load_dotenv

from auth import get_current_user, JWT_SECRET, JWT_ALGORITHM
from database import get_connection

load_dotenv()

router = APIRouter(prefix="/game", tags=["game"])

# In-memory session store
_sessions: dict[str, dict] = {}

# Deezer chart cache (per genre_id)
_chart_cache: dict[int, dict] = {}
CHART_CACHE_TTL = 600  # 10 minutes

# Deezer genre cache
_genre_cache: dict = {"data": None, "fetched_at": 0}
GENRE_CACHE_TTL = 3600  # 1 hour


def _cleanup_sessions():
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v["created_at"] > 300]
    for k in expired:
        del _sessions[k]


async def _fetch_genres() -> list[dict]:
    now = time.time()
    if _genre_cache["data"] and (now - _genre_cache["fetched_at"]) < GENRE_CACHE_TTL:
        return _genre_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://api.deezer.com/genre")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        if _genre_cache["data"]:
            return _genre_cache["data"]
        raise HTTPException(status_code=502, detail=f"Error al obtener géneros de Deezer: {str(e)}")

    genres = []
    for g in data.get("data", []):
        if g.get("id") == 0:
            continue
        genres.append({
            "id": g["id"],
            "name": g.get("name", ""),
            "picture": g.get("picture_medium", "") or g.get("picture", ""),
        })

    if genres:
        _genre_cache["data"] = genres
        _genre_cache["fetched_at"] = now

    return genres


async def _fetch_chart_tracks(genre_id: int = 0) -> list[dict]:
    now = time.time()
    cached = _chart_cache.get(genre_id)
    if cached and cached["data"] and (now - cached["fetched_at"]) < CHART_CACHE_TTL:
        return cached["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://api.deezer.com/chart/{genre_id}/tracks?limit=50")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        if cached and cached["data"]:
            return cached["data"]
        raise HTTPException(status_code=502, detail=f"Error al obtener canciones de Deezer: {str(e)}")

    tracks = []
    for t in data.get("data", []):
        preview = t.get("preview")
        if not preview:
            continue
        tracks.append({
            "title": t.get("title", ""),
            "artist": t.get("artist", {}).get("name", ""),
            "album": t.get("album", {}).get("title", ""),
            "cover": t.get("album", {}).get("cover_big", "") or t.get("album", {}).get("cover_medium", ""),
            "preview_url": preview,
        })

    if tracks:
        _chart_cache[genre_id] = {"data": tracks, "fetched_at": now}

    return tracks


# ── Existing REST endpoints (kept for single-player backwards compat) ──

@router.get("/genres")
async def get_genres(user: dict = Depends(get_current_user)):
    genres = await _fetch_genres()
    return {"genres": genres}


@router.get("/song")
async def get_song(genre_id: int = Query(0), user: dict = Depends(get_current_user)):
    _cleanup_sessions()

    tracks = await _fetch_chart_tracks(genre_id)
    if not tracks:
        raise HTTPException(status_code=503, detail="No hay canciones disponibles")

    track = random.choice(tracks)

    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "title": track["title"],
        "artist": track["artist"],
        "album": track["album"],
        "cover": track["cover"],
        "preview_url": track["preview_url"],
        "created_at": time.time(),
    }

    return {
        "sessionToken": token,
        "previewUrl": track["preview_url"],
    }


@router.post("/reveal")
async def reveal_song(
    sessionToken: str = Query(...),
    user: dict = Depends(get_current_user),
):
    session = _sessions.get(sessionToken)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de juego no encontrada o expirada")

    song_info = {
        "title": session["title"],
        "artist": session["artist"],
        "album": session["album"],
        "cover": session["cover"],
    }
    del _sessions[sessionToken]
    return {"song": song_info}


# ── Multiplayer WebSocket ──

def _authenticate_ws(token: str) -> dict | None:
    """Authenticate a WebSocket connection using a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "id": payload["sub"],
            "username": payload["username"],
            "role": payload.get("role", "user"),
        }
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


class PlayerConnection:
    def __init__(self, ws: WebSocket, user_id: int, username: str, role: str):
        self.ws = ws
        self.user_id = user_id
        self.username = username
        self.role = role
        self.score = 0
        self.can_stop = True      # Can press PARAR this round
        self.has_stopped = False   # Currently in THINKING (pressed PARAR)


class RoomState:
    """Game room managing all connected players."""

    LOBBY = "LOBBY"
    PLAYING = "PLAYING"
    THINKING = "THINKING"
    ROUND_END = "ROUND_END"

    def __init__(self, room_id: str, creator_id: int, creator_username: str, invited_ids: set[int]):
        self.room_id = room_id
        self.creator_id = creator_id
        self.creator_username = creator_username
        self.invited_ids = invited_ids
        self.created_at = time.time()
        self.state: str = self.LOBBY
        self.players: dict[int, PlayerConnection] = {}
        self.current_song: dict | None = None
        self.stopper_id: int | None = None
        self.selected_genres: list[int] = []
        self._think_timer: asyncio.Task | None = None
        self._play_timer: asyncio.Task | None = None

    # ── Player management ──

    async def add_player(self, pc: PlayerConnection):
        if self.state != self.LOBBY:
            await pc.ws.send_json({"type": "error", "message": "La partida ya comenzó. Espera a que vuelvan al lobby."})
            await pc.ws.close()
            return False
        self.players[pc.user_id] = pc
        await self.broadcast_player_list()
        return True

    async def remove_player(self, user_id: int, ws: WebSocket):
        pc = self.players.get(user_id)
        # Only remove if the WebSocket matches (avoids removing a newer reconnection)
        if not pc or pc.ws is not ws:
            return
        del self.players[user_id]

        # If the stopper disconnected during THINKING, cancel timer and go to ROUND_END
        if self.state == self.THINKING and self.stopper_id == user_id:
            self._cancel_think_timer()
            self.state = self.ROUND_END
            song = self._song_info()
            await self.broadcast({
                "type": "round_lost",
                "song": song,
                "scores": self._scores_list(),
            })
        # If no players left, clean up
        if not self.players:
            self._reset()
            rooms.pop(self.room_id, None)
            return
        await self.broadcast_player_list()

    # ── Broadcast helpers ──

    async def broadcast(self, msg: dict):
        disconnected = []
        for uid, pc in self.players.items():
            try:
                await pc.ws.send_json(msg)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.players.pop(uid, None)

    async def broadcast_player_list(self):
        players_data = [
            {
                "id": pc.user_id,
                "username": pc.username,
                "isCreator": pc.user_id == self.creator_id,
                "score": pc.score,
                "canStop": pc.can_stop,
            }
            for pc in self.players.values()
        ]
        await self.broadcast({"type": "players", "players": players_data})

    # ── Game flow ──

    async def start_game(self, genre_ids: list[int]):
        if self.state != self.LOBBY:
            return
        self.selected_genres = genre_ids
        self.state = self.PLAYING
        # Reset scores for a new game
        for pc in self.players.values():
            pc.score = 0
            pc.can_stop = True
            pc.has_stopped = False
        await self._load_and_send_song()

    async def _load_and_send_song(self):
        """Load a random song from selected genres and broadcast to all players."""
        genre_id = random.choice(self.selected_genres) if self.selected_genres else 0
        tracks = await _fetch_chart_tracks(genre_id)
        if not tracks:
            await self.broadcast({"type": "error", "message": "No hay canciones disponibles"})
            self.state = self.LOBBY
            return

        track = random.choice(tracks)
        self.current_song = track
        self.stopper_id = None

        await self.broadcast({
            "type": "game_start",
            "previewUrl": track["preview_url"],
        })

        # Start 30s play timer (backend safety net)
        self._cancel_play_timer()
        self._play_timer = asyncio.create_task(self._play_timeout())

    async def player_stop(self, user_id: int):
        if self.state != self.PLAYING:
            return
        pc = self.players.get(user_id)
        if not pc or not pc.can_stop:
            return

        self._cancel_play_timer()
        self.state = self.THINKING
        self.stopper_id = user_id
        pc.has_stopped = True

        # Notify everyone that someone stopped
        await self.broadcast({
            "type": "player_stopped",
            "userId": user_id,
            "username": pc.username,
        })

        # Start 10s think timer
        self._cancel_think_timer()
        self._think_timer = asyncio.create_task(self._think_timeout())

    async def player_keep_listening(self, user_id: int):
        if self.state != self.THINKING or self.stopper_id != user_id:
            return
        pc = self.players.get(user_id)
        if not pc:
            return

        self._cancel_think_timer()
        pc.can_stop = False
        pc.has_stopped = False
        self.stopper_id = None
        self.state = self.PLAYING

        await self.broadcast({
            "type": "keep_listening",
            "userId": user_id,
            "username": pc.username,
        })

        # Restart play timer with remaining time (simplified: restart full)
        self._cancel_play_timer()
        self._play_timer = asyncio.create_task(self._play_timeout())

    async def player_give_up(self, user_id: int):
        if self.state != self.THINKING or self.stopper_id != user_id:
            return

        self._cancel_think_timer()
        self.state = self.ROUND_END
        song = self._song_info()
        await self.broadcast({
            "type": "round_lost",
            "song": song,
            "scores": self._scores_list(),
        })

    async def next_round(self):
        if self.state != self.ROUND_END:
            return
        self.state = self.PLAYING
        for pc in self.players.values():
            pc.can_stop = True
            pc.has_stopped = False
        await self.broadcast_player_list()
        await self._load_and_send_song()

    async def back_to_lobby(self):
        self._cancel_think_timer()
        self._cancel_play_timer()
        self.state = self.LOBBY
        self.current_song = None
        self.stopper_id = None
        for pc in self.players.values():
            pc.can_stop = True
            pc.has_stopped = False
        await self.broadcast({"type": "back_to_lobby"})
        await self.broadcast_player_list()

    # ── Timers ──

    async def _think_timeout(self):
        """10s thinking timer. If it expires, the stopper guessed correctly."""
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            return

        pc = self.players.get(self.stopper_id)
        if not pc:
            return

        pc.score += 1
        self.state = self.ROUND_END
        song = self._song_info()
        await self.broadcast({
            "type": "round_won",
            "song": song,
            "winnerId": pc.user_id,
            "winnerName": pc.username,
            "scores": self._scores_list(),
        })

    async def _play_timeout(self):
        """30s play timer. If nobody stops, reveal song automatically."""
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            return

        if self.state != self.PLAYING:
            return

        self.state = self.ROUND_END
        song = self._song_info()
        await self.broadcast({
            "type": "round_lost",
            "song": song,
            "scores": self._scores_list(),
        })

    def _cancel_think_timer(self):
        if self._think_timer and not self._think_timer.done():
            self._think_timer.cancel()
        self._think_timer = None

    def _cancel_play_timer(self):
        if self._play_timer and not self._play_timer.done():
            self._play_timer.cancel()
        self._play_timer = None

    # ── Helpers ──

    def _song_info(self) -> dict:
        if not self.current_song:
            return {}
        return {
            "title": self.current_song["title"],
            "artist": self.current_song["artist"],
            "album": self.current_song["album"],
            "cover": self.current_song["cover"],
        }

    def _scores_list(self) -> list[dict]:
        return sorted(
            [{"id": pc.user_id, "username": pc.username, "score": pc.score} for pc in self.players.values()],
            key=lambda x: x["score"],
            reverse=True,
        )

    def _reset(self):
        self._cancel_think_timer()
        self._cancel_play_timer()
        self.state = self.LOBBY
        self.players.clear()
        self.current_song = None
        self.stopper_id = None
        self.selected_genres = []


# Multi-room store
rooms: dict[str, RoomState] = {}


def _cleanup_rooms():
    """Remove stale empty rooms older than 30 minutes."""
    now = time.time()
    expired = [rid for rid, r in rooms.items() if not r.players and now - r.created_at > 1800]
    for rid in expired:
        del rooms[rid]


# ── REST endpoints for room management ──

class CreateRoomBody(BaseModel):
    invited_ids: list[int]


@router.post("/rooms")
def create_room(body: CreateRoomBody, user: dict = Depends(get_current_user)):
    _cleanup_rooms()

    if not body.invited_ids:
        raise HTTPException(status_code=400, detail="Debes invitar al menos un amigo")

    # Validate all invited_ids are accepted friends
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        placeholders = ",".join(["%s"] * len(body.invited_ids))
        cursor.execute(
            f"""SELECT CASE WHEN sender_id = %s THEN receiver_id ELSE sender_id END AS friend_id
                FROM friendships
                WHERE status = 'accepted'
                  AND ((sender_id = %s AND receiver_id IN ({placeholders}))
                    OR (receiver_id = %s AND sender_id IN ({placeholders})))""",
            [user["id"], user["id"]] + body.invited_ids + [user["id"]] + body.invited_ids,
        )
        valid_friend_ids = {row["friend_id"] for row in cursor.fetchall()}
        invalid = set(body.invited_ids) - valid_friend_ids
        if invalid:
            raise HTTPException(status_code=400, detail="Algunos usuarios no son tus amigos")
    finally:
        cursor.close()
        conn.close()

    room_id = secrets.token_urlsafe(6)
    while room_id in rooms:
        room_id = secrets.token_urlsafe(6)

    invited_set = set(body.invited_ids)
    new_room = RoomState(room_id, user["id"], user["username"], invited_set)
    rooms[room_id] = new_room

    return {"roomId": room_id, "invitedCount": len(invited_set)}


@router.get("/rooms")
def get_my_rooms(user: dict = Depends(get_current_user)):
    _cleanup_rooms()
    result = []
    for r in rooms.values():
        if r.creator_id == user["id"] or user["id"] in r.invited_ids:
            result.append({
                "roomId": r.room_id,
                "creatorUsername": r.creator_username,
                "creatorId": r.creator_id,
                "playerCount": len(r.players),
                "state": r.state,
                "createdAt": r.created_at,
            })
    return result


@router.delete("/rooms/{room_id}")
async def close_room(room_id: str, user: dict = Depends(get_current_user)):
    current_room = rooms.get(room_id)
    if not current_room:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    if current_room.creator_id != user["id"]:
        raise HTTPException(status_code=403, detail="Solo el creador puede cerrar la sala")

    # Notify and disconnect all players
    await current_room.broadcast({"type": "room_closed", "message": "El creador cerró la sala"})
    current_room._reset()
    rooms.pop(room_id, None)
    return {"message": "Sala cerrada"}


# ── WebSocket endpoint (per room) ──

@router.websocket("/ws/{room_id}")
async def game_ws(ws: WebSocket, room_id: str):
    await ws.accept()

    # Authenticate: read token from query param
    token = ws.query_params.get("token")
    if not token:
        try:
            first_msg = await asyncio.wait_for(ws.receive_json(), timeout=5)
            token = first_msg.get("token")
        except Exception:
            await ws.send_json({"type": "error", "message": "Token no proporcionado"})
            await ws.close()
            return

    user = _authenticate_ws(token)
    if not user:
        await ws.send_json({"type": "error", "message": "Token inválido o expirado"})
        await ws.close()
        return

    # Find the room
    current_room = rooms.get(room_id)
    if not current_room:
        await ws.send_json({"type": "error", "message": "Sala no encontrada"})
        await ws.close()
        return

    # Validate user is creator or invited
    if user["id"] != current_room.creator_id and user["id"] not in current_room.invited_ids:
        await ws.send_json({"type": "error", "message": "No tienes acceso a esta sala"})
        await ws.close()
        return

    pc = PlayerConnection(ws, user["id"], user["username"], user["role"])

    # Send current state before adding
    await ws.send_json({"type": "state", "state": current_room.state})

    added = await current_room.add_player(pc)
    if not added:
        return

    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")

            if msg_type == "start":
                if pc.user_id != current_room.creator_id:
                    await ws.send_json({"type": "error", "message": "Solo el creador puede iniciar la partida"})
                    continue
                genres = data.get("genres", [])
                await current_room.start_game(genres)

            elif msg_type == "stop":
                await current_room.player_stop(pc.user_id)

            elif msg_type == "keep_listening":
                await current_room.player_keep_listening(pc.user_id)

            elif msg_type == "give_up":
                await current_room.player_give_up(pc.user_id)

            elif msg_type == "next_round":
                if pc.user_id != current_room.creator_id:
                    await ws.send_json({"type": "error", "message": "Solo el creador puede avanzar de ronda"})
                    continue
                await current_room.next_round()

            elif msg_type == "back_to_lobby":
                if pc.user_id != current_room.creator_id:
                    await ws.send_json({"type": "error", "message": "Solo el creador puede volver al lobby"})
                    continue
                await current_room.back_to_lobby()

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await current_room.remove_player(pc.user_id, ws)
