import os
import time
import random
import secrets

import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
from dotenv import load_dotenv

from auth import get_current_user

load_dotenv()

router = APIRouter(prefix="/game", tags=["game"])

# In-memory session store
_sessions: dict[str, dict] = {}

# Deezer chart cache
_chart_cache: dict = {"data": None, "fetched_at": 0}
CHART_CACHE_TTL = 600  # 10 minutes


def _cleanup_sessions():
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v["created_at"] > 300]
    for k in expired:
        del _sessions[k]


async def _fetch_chart_tracks() -> list[dict]:
    now = time.time()
    if _chart_cache["data"] and (now - _chart_cache["fetched_at"]) < CHART_CACHE_TTL:
        return _chart_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://api.deezer.com/chart/0/tracks?limit=50")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        if _chart_cache["data"]:
            return _chart_cache["data"]
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
        _chart_cache["data"] = tracks
        _chart_cache["fetched_at"] = now

    return tracks


@router.get("/song")
async def get_song(user: dict = Depends(get_current_user)):
    _cleanup_sessions()

    tracks = await _fetch_chart_tracks()
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
