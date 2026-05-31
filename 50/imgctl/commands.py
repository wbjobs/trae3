from __future__ import annotations
import sys
import importlib
import pkgutil
from typing import Dict, Callable, List, Optional, Type

import click


class CommandRegistry:
    _commands: Dict[str, click.Command] = {}
    _groups: Dict[str, click.Group] = {}
    _modules_loaded = False

    @classmethod
    def register(cls, name: Optional[str] = None, group: Optional[str] = None, **cmd_kwargs):
        def decorator(func):
            if isinstance(func, click.Command):
                cmd_obj = func
            else:
                cmd_obj = click.command(name=name, **cmd_kwargs)(func)
            cmd_name = name or cmd_obj.name
            if group:
                if group not in cls._groups:
                    cls._groups[group] = click.Group(name=group)
                cls._groups[group].add_command(cmd_obj, name=cmd_name)
            else:
                cls._commands[cmd_name] = cmd_obj
            return func
        return decorator

    @classmethod
    def register_group(cls, name: str, help_text: str = ""):
        def decorator(group_cls):
            if isinstance(group_cls, click.Group):
                g = group_cls
            elif callable(group_cls):
                g = click.group(name=name, help=help_text)(group_cls)
            else:
                raise ValueError("Group must be a function or click.Group")
            cls._groups[name] = g
            return group_cls
        return decorator

    @classmethod
    def load_modules(cls, package_name: str = "imgctl"):
        if cls._modules_loaded:
            return
        try:
            package = importlib.import_module(package_name)
            for _, mod_name, is_pkg in pkgutil.iter_modules(package.__path__):
                if mod_name.startswith("cmd_") or mod_name in ("commands",):
                    try:
                        importlib.import_module(f"{package_name}.{mod_name}")
                    except Exception as e:
                        sys.stderr.write(f"Warning: Failed to load {package_name}.{mod_name}: {e}\n")
        except Exception as e:
            sys.stderr.write(f"Warning: Failed to load commands from {package_name}: {e}\n")
        cls._modules_loaded = True

    @classmethod
    def build_root_group(cls, **group_kwargs) -> click.Group:
        root = click.Group(**group_kwargs)
        for name, cmd in cls._commands.items():
            root.add_command(cmd, name=name)
        for name, group in cls._groups.items():
            root.add_command(group, name=name)
        return root

    @classmethod
    def get_command(cls, full_path: str) -> Optional[click.Command]:
        parts = full_path.split(" ")
        if len(parts) == 1:
            return cls._commands.get(parts[0])
        group = cls._groups.get(parts[0])
        if group and len(parts) == 2:
            return group.commands.get(parts[1])
        return None

    @classmethod
    def list_commands(cls) -> Dict[str, List[str]]:
        result = {"root": list(cls._commands.keys())}
        for group_name, group in cls._groups.items():
            result[group_name] = list(group.commands.keys())
        return result


cmd = CommandRegistry.register
cmd_group = CommandRegistry.register_group
