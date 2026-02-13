from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_connection
from auth import get_current_user

router = APIRouter(prefix="/social", tags=["social"])


class FriendRequestBody(BaseModel):
    receiver_id: int


@router.get("/search")
def search_users(q: str = "", user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if q.strip():
            cursor.execute(
                "SELECT id, username, avatar FROM users WHERE username LIKE %s AND id != %s AND role != 'admin' ORDER BY username LIMIT 50",
                (f"%{q}%", user["id"]),
            )
        else:
            cursor.execute(
                "SELECT id, username, avatar FROM users WHERE id != %s AND role != 'admin' ORDER BY username LIMIT 50",
                (user["id"],),
            )
        users = cursor.fetchall()

        if not users:
            return []

        user_ids = [u["id"] for u in users]
        placeholders = ",".join(["%s"] * len(user_ids))

        cursor.execute(
            f"""SELECT id, sender_id, receiver_id, status FROM friendships
                WHERE (sender_id = %s AND receiver_id IN ({placeholders}))
                   OR (receiver_id = %s AND sender_id IN ({placeholders}))""",
            [user["id"]] + user_ids + [user["id"]] + user_ids,
        )
        friendships = cursor.fetchall()

        friendship_map = {}
        for f in friendships:
            other_id = f["receiver_id"] if f["sender_id"] == user["id"] else f["sender_id"]
            if f["status"] == "accepted":
                friendship_map[other_id] = {"status": "accepted", "id": f["id"]}
            elif f["sender_id"] == user["id"]:
                friendship_map[other_id] = {"status": "pending_sent", "id": f["id"]}
            else:
                friendship_map[other_id] = {"status": "pending_received", "id": f["id"]}

        result = []
        for u in users:
            fship = friendship_map.get(u["id"])
            result.append({
                "id": u["id"],
                "username": u["username"],
                "avatar": u.get("avatar", "default"),
                "friendshipStatus": fship["status"] if fship else None,
                "friendshipId": fship["id"] if fship else None,
            })

        return result
    finally:
        cursor.close()
        conn.close()


@router.post("/friends/request")
def send_friend_request(body: FriendRequestBody, user: dict = Depends(get_current_user)):
    if body.receiver_id == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes enviarte una solicitud a ti mismo")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, role FROM users WHERE id = %s", (body.receiver_id,))
        receiver = cursor.fetchone()
        if not receiver:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if receiver["role"] == "admin":
            raise HTTPException(status_code=400, detail="No se puede enviar solicitud a un administrador")

        # Check if there's already a friendship in either direction
        cursor.execute(
            """SELECT id, sender_id, receiver_id, status FROM friendships
               WHERE (sender_id = %s AND receiver_id = %s)
                  OR (sender_id = %s AND receiver_id = %s)""",
            (user["id"], body.receiver_id, body.receiver_id, user["id"]),
        )
        existing = cursor.fetchone()

        if existing:
            if existing["status"] == "accepted":
                raise HTTPException(status_code=409, detail="Ya son amigos")
            if existing["sender_id"] == user["id"]:
                raise HTTPException(status_code=409, detail="Ya enviaste una solicitud a este usuario")
            # The other user already sent us a request -> auto-accept
            cursor.execute(
                "UPDATE friendships SET status = 'accepted' WHERE id = %s",
                (existing["id"],),
            )
            conn.commit()
            return {"message": "Solicitud aceptada automaticamente (ambos se enviaron solicitud)", "autoAccepted": True}

        cursor.execute(
            "INSERT INTO friendships (sender_id, receiver_id, status) VALUES (%s, %s, 'pending')",
            (user["id"], body.receiver_id),
        )
        conn.commit()
        return {"message": "Solicitud enviada", "id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()


@router.get("/friends/requests")
def get_pending_requests(user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT f.id, f.sender_id, u.username, u.avatar, f.created_at
               FROM friendships f
               JOIN users u ON u.id = f.sender_id
               WHERE f.receiver_id = %s AND f.status = 'pending'
               ORDER BY f.created_at DESC""",
            (user["id"],),
        )
        requests = cursor.fetchall()
        result = []
        for r in requests:
            result.append({
                "id": r["id"],
                "senderId": r["sender_id"],
                "username": r["username"],
                "avatar": r.get("avatar", "default"),
                "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return result
    finally:
        cursor.close()
        conn.close()


@router.put("/friends/requests/{request_id}/accept")
def accept_friend_request(request_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, receiver_id, status FROM friendships WHERE id = %s",
            (request_id,),
        )
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if req["receiver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes permiso para aceptar esta solicitud")
        if req["status"] == "accepted":
            raise HTTPException(status_code=409, detail="La solicitud ya fue aceptada")

        cursor.execute(
            "UPDATE friendships SET status = 'accepted' WHERE id = %s",
            (request_id,),
        )
        conn.commit()
        return {"message": "Solicitud aceptada"}
    finally:
        cursor.close()
        conn.close()


@router.put("/friends/requests/{request_id}/reject")
def reject_friend_request(request_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, receiver_id FROM friendships WHERE id = %s",
            (request_id,),
        )
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if req["receiver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes permiso para rechazar esta solicitud")

        cursor.execute("DELETE FROM friendships WHERE id = %s", (request_id,))
        conn.commit()
        return {"message": "Solicitud rechazada"}
    finally:
        cursor.close()
        conn.close()


@router.get("/friends")
def get_friends(user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT f.id AS friendship_id, f.created_at AS friends_since,
                      u.id, u.username, u.avatar
               FROM friendships f
               JOIN users u ON u.id = CASE WHEN f.sender_id = %s THEN f.receiver_id ELSE f.sender_id END
               WHERE (f.sender_id = %s OR f.receiver_id = %s) AND f.status = 'accepted'
               ORDER BY u.username""",
            (user["id"], user["id"], user["id"]),
        )
        friends = cursor.fetchall()
        result = []
        for f in friends:
            result.append({
                "id": f["id"],
                "username": f["username"],
                "avatar": f.get("avatar", "default"),
                "friendshipId": f["friendship_id"],
                "friendsSince": f["friends_since"].isoformat() if f["friends_since"] else None,
            })
        return result
    finally:
        cursor.close()
        conn.close()


@router.delete("/friends/{friendship_id}")
def remove_friend(friendship_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, sender_id, receiver_id FROM friendships WHERE id = %s",
            (friendship_id,),
        )
        friendship = cursor.fetchone()
        if not friendship:
            raise HTTPException(status_code=404, detail="Amistad no encontrada")
        if friendship["sender_id"] != user["id"] and friendship["receiver_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta amistad")

        cursor.execute("DELETE FROM friendships WHERE id = %s", (friendship_id,))
        conn.commit()
        return {"message": "Amigo eliminado"}
    finally:
        cursor.close()
        conn.close()


@router.get("/users/{user_id}")
def get_public_profile(user_id: int, user: dict = Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, username, avatar, role, created_at FROM users WHERE id = %s",
            (user_id,),
        )
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

        # Count search_log entries
        cursor.execute(
            "SELECT COUNT(*) AS count FROM search_log WHERE user_id = %s",
            (user_id,),
        )
        search_count = cursor.fetchone()["count"]

        # Get friends list
        cursor.execute(
            """SELECT u.id, u.username, u.avatar
               FROM friendships f
               JOIN users u ON u.id = CASE WHEN f.sender_id = %s THEN f.receiver_id ELSE f.sender_id END
               WHERE (f.sender_id = %s OR f.receiver_id = %s) AND f.status = 'accepted'
               ORDER BY u.username""",
            (user_id, user_id, user_id),
        )
        friends = []
        for f in cursor.fetchall():
            friends.append({
                "id": f["id"],
                "username": f["username"],
                "avatar": f.get("avatar", "default"),
            })

        # Friendship status with current user
        friendship_status = None
        friendship_id = None
        if user_id != user["id"]:
            cursor.execute(
                """SELECT id, sender_id, receiver_id, status FROM friendships
                   WHERE (sender_id = %s AND receiver_id = %s)
                      OR (sender_id = %s AND receiver_id = %s)""",
                (user["id"], user_id, user_id, user["id"]),
            )
            rel = cursor.fetchone()
            if rel:
                friendship_id = rel["id"]
                if rel["status"] == "accepted":
                    friendship_status = "accepted"
                elif rel["sender_id"] == user["id"]:
                    friendship_status = "pending_sent"
                else:
                    friendship_status = "pending_received"

        return {
            "id": profile["id"],
            "username": profile["username"],
            "avatar": profile.get("avatar", "default"),
            "role": profile.get("role", "user"),
            "createdAt": profile["created_at"].isoformat() if profile["created_at"] else None,
            "searchCount": search_count,
            "friends": friends,
            "friendshipStatus": friendship_status,
            "friendshipId": friendship_id,
            "isOwnProfile": user_id == user["id"],
        }
    finally:
        cursor.close()
        conn.close()
