import os
import json
import time
import hashlib
import hmac
import base64
import tempfile
from pathlib import Path
from urllib.parse import quote_plus

import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import init_db, get_connection
from auth import router as auth_router, get_current_user
from history import router as history_router
from admin import router as admin_router
from game import router as game_router
from social import router as social_router

load_dotenv(override=True)

app = FastAPI(title="OidoMusical API")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in FRONTEND_URL.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(history_router)
app.include_router(admin_router)
app.include_router(game_router)
app.include_router(social_router)


@app.on_event("startup")
def on_startup():
    init_db()

ACR_ACCESS_KEY = os.getenv("ACR_ACCESS_KEY", "")
ACR_ACCESS_SECRET = os.getenv("ACR_ACCESS_SECRET", "")
ACR_HOST = os.getenv("ACR_HOST", "identify-us-west-2.acrcloud.com")


def build_signature(method, uri, access_key, data_type, signature_version, timestamp, access_secret):
    string_to_sign = f"{method}\n{uri}\n{access_key}\n{data_type}\n{signature_version}\n{timestamp}"
    sign = base64.b64encode(
        hmac.HMAC(
            access_secret.encode("ascii"),
            string_to_sign.encode("ascii"),
            digestmod=hashlib.sha1,
        ).digest()
    ).decode("ascii")
    return sign


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/recognize")
async def recognize_audio(audio: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await audio.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío")

    timestamp = str(int(time.time()))
    signature = build_signature(
        "POST", "/v1/identify", ACR_ACCESS_KEY, "audio", "1", timestamp, ACR_ACCESS_SECRET
    )

    data = {
        "access_key": ACR_ACCESS_KEY,
        "data_type": "audio",
        "signature_version": "1",
        "signature": signature,
        "sample_bytes": str(len(content)),
        "timestamp": timestamp,
    }

    files = {"sample": ("audio.webm", content, "audio/webm")}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"https://{ACR_HOST}/v1/identify",
                data=data,
                files=files,
            )
        result = response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al contactar ACRCloud: {str(e)}")

    status = result.get("status", {})
    if status.get("code") != 0:
        return {
            "found": False,
            "message": status.get("msg", "No se pudo identificar la canción"),
            "songs": [],
        }

    metadata = result.get("metadata", {})
    music_list = metadata.get("music", []) or metadata.get("humming", [])

    songs = []
    for track in music_list:
        title = track.get("title", "Desconocido")
        artist = ", ".join(a.get("name", "") for a in track.get("artists", []))
        album = track.get("album", {}).get("name", "")
        score = track.get("score", 0)

        external = track.get("external_metadata", {})

        spotify_id = None
        spotify_data = external.get("spotify", {})
        if spotify_data:
            spotify_id = spotify_data.get("track", {}).get("id")

        youtube_vid = None
        youtube_data = external.get("youtube", {})
        if youtube_data:
            youtube_vid = youtube_data.get("vid")

        search_query = quote_plus(f"{title} {artist}")
        spotify_url = f"https://open.spotify.com/track/{spotify_id}" if spotify_id else f"https://open.spotify.com/search/{search_query}"
        youtube_url = f"https://www.youtube.com/watch?v={youtube_vid}" if youtube_vid else f"https://www.youtube.com/results?search_query={search_query}"

        songs.append({
            "title": title,
            "artist": artist,
            "album": album,
            "score": score,
            "spotifyUrl": spotify_url,
            "youtubeUrl": youtube_url,
        })

    # Log all results to search_log
    try:
        conn = get_connection()
        cursor = conn.cursor()
        for s in songs:
            cursor.execute(
                "INSERT INTO search_log (user_id, title, artist, album, spotify_url, youtube_url, score) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (user["id"], s["title"], s["artist"], s["album"], s["spotifyUrl"], s["youtubeUrl"], s["score"]),
            )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception:
        pass

    return {
        "found": True,
        "message": f"Se encontraron {len(songs)} resultado(s)",
        "songs": songs,
    }
