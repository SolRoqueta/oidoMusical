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
