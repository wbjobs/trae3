from typing import Optional, Union
from sqlalchemy.orm import Session

from app.core.security import verify_password, get_password_hash
from app.models import User
from app.schemas import UserCreate, UserUpdate
from app.services.base import BaseService


class UserService(BaseService[User, UserCreate, UserUpdate]):
    def __init__(self):
        super().__init__(User)

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        obj_in_data = obj_in.model_dump()
        password = obj_in_data.pop("password")
        hashed_password = get_password_hash(password)
        db_obj = User(**obj_in_data, hashed_password=hashed_password)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self,
        db: Session,
        *,
        db_obj: User,
        obj_in: Union[UserUpdate, dict],
    ) -> User:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        if "password" in update_data and update_data["password"]:
            hashed_password = get_password_hash(update_data.pop("password"))
            update_data["hashed_password"] = hashed_password

        return super().update(db, db_obj=db_obj, obj_in=update_data)

    def authenticate(self, db: Session, *, username: str, password: str) -> Optional[User]:
        user = self.get_by_username_or_email(db, username=username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_username(self, db: Session, *, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    def get_by_username_or_email(self, db: Session, *, username: str) -> Optional[User]:
        return (
            db.query(User)
            .filter((User.username == username) | (User.email == username))
            .first()
        )

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser


user_service = UserService()
