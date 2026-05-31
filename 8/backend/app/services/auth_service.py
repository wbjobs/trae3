import sqlite3
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from app.config import DB_PATH, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES
from app.models.schemas import UserInfo, UserRole


def get_db():
    return sqlite3.connect(str(DB_PATH))


def create_token(user: UserInfo) -> str:
    payload = {
        "id": user.id,
        "username": user.username,
        "role": user.role.value,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def authenticate_user(username: str, password: str):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE username = ? AND is_active = 1", (username,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    if not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        return None
    return UserInfo(
        id=row["id"],
        username=row["username"],
        role=UserRole(row["role"]),
        is_active=bool(row["is_active"]),
        created_at=row["created_at"],
    )


def get_user_by_id(user_id: str):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return UserInfo(
        id=row["id"],
        username=row["username"],
        role=UserRole(row["role"]),
        is_active=bool(row["is_active"]),
        created_at=row["created_at"],
    )


def list_users(page: int = 1, page_size: int = 20):
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    offset = (page - 1) * page_size
    c.execute("SELECT COUNT(*) as total FROM users")
    total = c.fetchone()["total"]
    c.execute("SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?", (page_size, offset))
    rows = c.fetchall()
    conn.close()
    users = [
        UserInfo(
            id=r["id"],
            username=r["username"],
            role=UserRole(r["role"]),
            is_active=bool(r["is_active"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]
    return users, total


def create_user(username: str, password: str, role: str = "user"):
    conn = get_db()
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = str(uuid.uuid4())
    try:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            (user_id, username, password_hash, role),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return None
    conn.close()
    return get_user_by_id(user_id)


def update_user(user_id: str, **kwargs):
    conn = get_db()
    sets = []
    values = []
    for key, value in kwargs.items():
        if value is not None:
            sets.append(f"{key} = ?")
            values.append(value if key != "is_active" else int(value))
    if not sets:
        conn.close()
        return get_user_by_id(user_id)
    values.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return get_user_by_id(user_id)


def delete_user(user_id: str):
    conn = get_db()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()


def change_password(user_id: str, old_password: str, new_password: str):
    user = get_user_by_id(user_id)
    if not user:
        return False
    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    if not bcrypt.checkpw(old_password.encode(), row["password_hash"].encode()):
        conn.close()
        return False
    new_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()
    return True