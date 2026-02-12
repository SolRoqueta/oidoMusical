from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_connection
from auth import get_current_user

router = APIRouter(prefix="/history", tags=["history"])


class SongBody(BaseModel):
    title: str
    artist: str
    album: str = ""
    spotifyUrl: str = ""
    youtubeUrl: str = ""


@router.get("")
def get_history(user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, title, artist, album, spotify_url, youtube_url, created_at "
            "FROM search_history WHERE user_id = %s AND hidden = 0 ORDER BY created_at DESC LIMIT 50",
            (user["id"],),
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


@router.post("")
def add_to_history(body: SongBody, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Check if exists (visible)
        cursor.execute(
            "SELECT id FROM search_history WHERE user_id = %s AND title = %s AND artist = %s AND hidden = 0",
            (user["id"], body.title, body.artist),
        )
        if cursor.fetchone():
            return {"message": "Ya existe en el historial"}

        # Check if exists but hidden -> unhide it
        cursor.execute(
            "SELECT id FROM search_history WHERE user_id = %s AND title = %s AND artist = %s AND hidden = 1",
            (user["id"], body.title, body.artist),
        )
        hidden_row = cursor.fetchone()
        if hidden_row:
            cursor.execute("UPDATE search_history SET hidden = 0, created_at = NOW() WHERE id = %s", (hidden_row["id"],))
            conn.commit()
            return {"message": "Guardada en historial", "id": hidden_row["id"]}

        cursor.execute(
            "INSERT INTO search_history (user_id, title, artist, album, spotify_url, youtube_url) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (user["id"], body.title, body.artist, body.album, body.spotifyUrl, body.youtubeUrl),
        )
        conn.commit()
        return {"message": "Guardada en historial", "id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()


@router.delete("")
def clear_history(user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE search_history SET hidden = 1 WHERE user_id = %s", (user["id"],))
        conn.commit()
        return {"message": "Historial limpiado"}
    finally:
        cursor.close()
        conn.close()
