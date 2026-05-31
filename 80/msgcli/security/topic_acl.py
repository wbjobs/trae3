import json
import hashlib
import secrets
from enum import Enum
from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path

from ..common import get_logger


class Permission(Enum):
    READ = "read"
    WRITE = "write"
    CREATE = "create"
    DELETE = "delete"
    ALTER = "alter"
    DESCRIBE = "describe"
    ALL = "all"


class ResourceType(Enum):
    TOPIC = "topic"
    GROUP = "group"
    CLUSTER = "cluster"
    TRANSACTIONAL_ID = "transactional_id"


class ResourcePatternType(Enum):
    LITERAL = "literal"
    PREFIXED = "prefixed"
    ANY = "any"


@dataclass
class ACLEntry:
    principal: str
    resource_type: ResourceType
    resource_name: str
    pattern_type: ResourcePatternType
    permission: Permission
    allowed: bool = True
    host: str = "*"
    created_at: datetime = field(default_factory=datetime.now)
    expires_at: Optional[datetime] = None

    def matches(self, resource_type: ResourceType, resource_name: str) -> bool:
        if self.resource_type != resource_type:
            return False
        
        if self.pattern_type == ResourcePatternType.LITERAL:
            return self.resource_name == resource_name
        elif self.pattern_type == ResourcePatternType.PREFIXED:
            return resource_name.startswith(self.resource_name)
        return True

    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.now() > self.expires_at

    def to_dict(self) -> Dict[str, Any]:
        return {
            "principal": self.principal,
            "resource_type": self.resource_type.value,
            "resource_name": self.resource_name,
            "pattern_type": self.pattern_type.value,
            "permission": self.permission.value,
            "allowed": self.allowed,
            "host": self.host,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


@dataclass
class User:
    username: str
    password_hash: str
    salt: str
    roles: Set[str] = field(default_factory=set)
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime = field(default_factory=datetime.now)
    last_login: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "username": self.username,
            "password_hash": self.password_hash,
            "salt": self.salt,
            "roles": list(self.roles),
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat(),
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }


@dataclass
class Role:
    name: str
    description: str = ""
    permissions: Set[str] = field(default_factory=set)
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "permissions": list(self.permissions),
            "created_at": self.created_at.isoformat(),
        }


class TopicACLManager:
    def __init__(self, storage_path: str = "./acl_data"):
        self.logger = get_logger("TopicACLManager")
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        self._users: Dict[str, User] = {}
        self._roles: Dict[str, Role] = {}
        self._acls: List[ACLEntry] = []
        
        self._load_data()
        self._init_defaults()

    def _init_defaults(self):
        if "admin" not in self._roles:
            self.create_role("admin", "Administrator role with full access", 
                           {f"{p.value}:*" for p in Permission})
        
        if "reader" not in self._roles:
            self.create_role("reader", "Read-only access", 
                           {f"read:*"})
        
        if "writer" not in self._roles:
            self.create_role("writer", "Write-only access", 
                           {f"write:*"})
        
        if "admin" not in self._users:
            self.create_user("admin", "admin123", is_admin=True)
            self.assign_role("admin", "admin")

    def _load_data(self):
        users_file = self.storage_path / "users.json"
        roles_file = self.storage_path / "roles.json"
        acls_file = self.storage_path / "acls.json"
        
        if users_file.exists():
            with open(users_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for username, user_data in data.items():
                    self._users[username] = User(
                        username=user_data["username"],
                        password_hash=user_data["password_hash"],
                        salt=user_data["salt"],
                        roles=set(user_data.get("roles", [])),
                        is_active=user_data.get("is_active", True),
                        is_admin=user_data.get("is_admin", False),
                        created_at=datetime.fromisoformat(user_data["created_at"]),
                        last_login=datetime.fromisoformat(user_data["last_login"]) if user_data.get("last_login") else None,
                    )
        
        if roles_file.exists():
            with open(roles_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for name, role_data in data.items():
                    self._roles[name] = Role(
                        name=role_data["name"],
                        description=role_data.get("description", ""),
                        permissions=set(role_data.get("permissions", [])),
                        created_at=datetime.fromisoformat(role_data["created_at"]),
                    )
        
        if acls_file.exists():
            with open(acls_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for acl_data in data:
                    self._acls.append(ACLEntry(
                        principal=acl_data["principal"],
                        resource_type=ResourceType(acl_data["resource_type"]),
                        resource_name=acl_data["resource_name"],
                        pattern_type=ResourcePatternType(acl_data["pattern_type"]),
                        permission=Permission(acl_data["permission"]),
                        allowed=acl_data.get("allowed", True),
                        host=acl_data.get("host", "*"),
                        created_at=datetime.fromisoformat(acl_data["created_at"]),
                        expires_at=datetime.fromisoformat(acl_data["expires_at"]) if acl_data.get("expires_at") else None,
                    ))

    def _save_data(self):
        users_file = self.storage_path / "users.json"
        roles_file = self.storage_path / "roles.json"
        acls_file = self.storage_path / "acls.json"
        
        with open(users_file, 'w', encoding='utf-8') as f:
            json.dump({u: self._users[u].to_dict() for u in self._users}, f, indent=2)
        
        with open(roles_file, 'w', encoding='utf-8') as f:
            json.dump({r: self._roles[r].to_dict() for r in self._roles}, f, indent=2)
        
        with open(acls_file, 'w', encoding='utf-8') as f:
            json.dump([a.to_dict() for a in self._acls], f, indent=2)

    def _hash_password(self, password: str, salt: Optional[str] = None) -> tuple[str, str]:
        if salt is None:
            salt = secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        ).hex()
        return password_hash, salt

    def create_user(self, username: str, password: str, is_admin: bool = False) -> User:
        if username in self._users:
            raise ValueError(f"User {username} already exists")
        
        password_hash, salt = self._hash_password(password)
        user = User(
            username=username,
            password_hash=password_hash,
            salt=salt,
            is_admin=is_admin,
        )
        self._users[username] = user
        self._save_data()
        self.logger.info(f"Created user: {username}")
        return user

    def authenticate(self, username: str, password: str) -> Optional[User]:
        user = self._users.get(username)
        if not user or not user.is_active:
            return None
        
        password_hash, _ = self._hash_password(password, user.salt)
        if password_hash == user.password_hash:
            user.last_login = datetime.now()
            self._save_data()
            return user
        return None

    def delete_user(self, username: str) -> bool:
        if username in self._users:
            del self._users[username]
            self._save_data()
            self.logger.info(f"Deleted user: {username}")
            return True
        return False

    def list_users(self) -> List[Dict[str, Any]]:
        return [
            {
                "username": u.username,
                "roles": list(u.roles),
                "is_active": u.is_active,
                "is_admin": u.is_admin,
                "last_login": u.last_login.isoformat() if u.last_login else None,
            }
            for u in self._users.values()
        ]

    def create_role(self, name: str, description: str = "", 
                    permissions: Optional[Set[str]] = None) -> Role:
        if name in self._roles:
            raise ValueError(f"Role {name} already exists")
        
        role = Role(
            name=name,
            description=description,
            permissions=permissions or set(),
        )
        self._roles[name] = role
        self._save_data()
        self.logger.info(f"Created role: {name}")
        return role

    def delete_role(self, name: str) -> bool:
        if name in self._roles:
            del self._roles[name]
            for user in self._users.values():
                user.roles.discard(name)
            self._save_data()
            self.logger.info(f"Deleted role: {name}")
            return True
        return False

    def assign_role(self, username: str, role_name: str) -> bool:
        user = self._users.get(username)
        if not user or role_name not in self._roles:
            return False
        user.roles.add(role_name)
        self._save_data()
        self.logger.info(f"Assigned role {role_name} to user {username}")
        return True

    def revoke_role(self, username: str, role_name: str) -> bool:
        user = self._users.get(username)
        if not user:
            return False
        user.roles.discard(role_name)
        self._save_data()
        self.logger.info(f"Revoked role {role_name} from user {username}")
        return True

    def list_roles(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self._roles.values()]

    def grant_permission(self, principal: str, resource_type: ResourceType, 
                        resource_name: str, permission: Permission,
                        pattern_type: ResourcePatternType = ResourcePatternType.LITERAL,
                        expires_days: Optional[int] = None) -> ACLEntry:
        expires_at = None
        if expires_days:
            expires_at = datetime.now() + timedelta(days=expires_days)
        
        acl = ACLEntry(
            principal=principal,
            resource_type=resource_type,
            resource_name=resource_name,
            pattern_type=pattern_type,
            permission=permission,
            allowed=True,
            expires_at=expires_at,
        )
        self._acls.append(acl)
        self._save_data()
        self.logger.info(f"Granted {permission.value} on {resource_name} to {principal}")
        return acl

    def revoke_permission(self, principal: str, resource_type: ResourceType,
                         resource_name: str, permission: Permission) -> bool:
        original_count = len(self._acls)
        self._acls = [
            a for a in self._acls
            if not (a.principal == principal and 
                    a.resource_type == resource_type and 
                    a.resource_name == resource_name and 
                    a.permission == permission)
        ]
        if len(self._acls) != original_count:
            self._save_data()
            self.logger.info(f"Revoked {permission.value} on {resource_name} from {principal}")
            return True
        return False

    def check_permission(self, principal: str, resource_type: ResourceType,
                        resource_name: str, permission: Permission) -> bool:
        user = self._users.get(principal)
        if user and user.is_admin:
            return True
        
        if user:
            for role_name in user.roles:
                role = self._roles.get(role_name)
                if role:
                    perm_key = f"{permission.value}:{resource_name}"
                    if perm_key in role.permissions or f"{permission.value}:*" in role.permissions:
                        return True
        
        allowed = False
        for acl in self._acls:
            if acl.principal != principal:
                continue
            if acl.is_expired():
                continue
            if not acl.matches(resource_type, resource_name):
                continue
            if acl.permission == Permission.ALL or acl.permission == permission:
                if acl.allowed:
                    allowed = True
                else:
                    return False
        
        return allowed

    def get_user_permissions(self, username: str) -> List[Dict[str, Any]]:
        permissions = []
        for acl in self._acls:
            if acl.principal == username:
                permissions.append(acl.to_dict())
        return permissions

    def list_acls(self, principal: Optional[str] = None, 
                  resource_type: Optional[ResourceType] = None) -> List[Dict[str, Any]]:
        acls = self._acls
        if principal:
            acls = [a for a in acls if a.principal == principal]
        if resource_type:
            acls = [a for a in acls if a.resource_type == resource_type]
        return [a.to_dict() for a in acls]
