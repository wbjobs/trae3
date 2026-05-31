import sys
import os
import re
import json
import csv
import io
import signal
import getpass
from datetime import datetime, timedelta
from typing import List, Optional

import click
from tabulate import tabulate

from imgctl.config import Config
from imgctl.db import Database
from imgctl.registry import RegistryClient, RegistryError
from imgctl.query import ImageQuery
from imgctl.tag import TagManager
from imgctl.batch import BatchManager
from imgctl.cleaner import Cleaner
from imgctl.commands import CommandRegistry, cmd, cmd_group
from imgctl.executor import BatchExecutor
from imgctl.scheduler import TaskScheduler, PRESET_SCHEDULES, parse_schedule


def _build_client(config: Config) -> RegistryClient:
    url = config.get("registry", "url")
    if not url:
        click.echo("Error: Registry URL not configured. Run 'imgctl config set registry.url <URL>'")
        sys.exit(1)
    return RegistryClient(
        url=url,
        username=config.get("registry", "username") or None,
        password=config.get("registry", "password") or None,
        verify_ssl=config.get("registry", "verify_ssl", default=True),
        timeout=config.get("retry", "timeout", default=30),
        max_retries=config.get("retry", "max_retries", default=3),
    )


def _build_db(config: Config) -> Database:
    db_path = config.get("db", "path")
    db = Database(db_path)
    db.init_tables()
    return db


def _build_executor(config: Config) -> BatchExecutor:
    return BatchExecutor(
        max_workers=config.get("batch", "max_workers", default=5),
        chunk_size=config.get("batch", "chunk_size", default=None),
        show_progress=config.get("batch", "show_progress", default=True),
        stop_on_error=config.get("batch", "stop_on_error", default=False),
    )


def _build_scheduler(config: Config) -> TaskScheduler:
    client = _build_client(config)
    db = _build_db(config)
    return TaskScheduler(
        db=db,
        client=client,
        dry_run=config.get("cleaner", "dry_run", default=True),
    )


def _fmt_size(size_bytes) -> str:
    if size_bytes is None or size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f"{size:.2f} {units[i]}"


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(version="1.0.0", prog_name="imgctl")
@click.pass_context
def cli(ctx):
    """imgctl - Container Image Registry CLI Manager

    Multi-module command line tool for image registry management,
    tag operations, batch processing, and redundant image cleanup.
    """
    ctx.ensure_object(dict)
    ctx.obj["config"] = Config()
    ctx.obj["db"] = _build_db(ctx.obj["config"])


@cmd_group("config", "Manage CLI configuration.")
@click.pass_context
def config_group(ctx):
    pass


@cmd(name="show", group="config")
@click.pass_context
def config_show(ctx):
    """Show current configuration."""
    cfg = ctx.obj["config"]
    click.echo(cfg.show())


@cmd(name="set", group="config")
@click.argument("key")
@click.argument("value")
@click.pass_context
def config_set(ctx, key, value):
    """Set a configuration value (dot-notation key)."""
    cfg = ctx.obj["config"]
    keys = key.split(".")
    if len(keys) < 1:
        click.echo("Error: Key must use dot notation, e.g. registry.url")
        return
    try:
        if value.lower() in ("true", "false"):
            parsed = value.lower() == "true"
        elif value.lstrip("-").isdigit():
            parsed = int(value)
        elif value.replace(".", "", 1).lstrip("-").isdigit():
            parsed = float(value)
        else:
            parsed = value
        cfg.set(*keys, parsed)
        click.echo(f"Set {'.'.join(keys)} = {parsed}")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="get", group="config")
@click.argument("key")
@click.pass_context
def config_get(ctx, key):
    """Get a configuration value (dot-notation key)."""
    cfg = ctx.obj["config"]
    keys = key.split(".")
    val = cfg.get(*keys)
    if val is None:
        click.echo(f"Key '{key}' not found")
    else:
        click.echo(f"{'.'.join(keys)} = {val}")


@cmd(name="init", group="config")
@click.option("--url", prompt="Registry URL", help="Registry URL (e.g. https://registry.example.com)")
@click.option("--username", prompt="Username", default="", help="Registry username")
@click.option("--password", prompt="Password", hide_input=True, default="", help="Registry password")
@click.option("--verify-ssl/--no-verify-ssl", default=True, help="Verify SSL certificates")
@click.pass_context
def config_init(ctx, url, username, password, verify_ssl):
    """Initialize configuration interactively."""
    cfg = ctx.obj["config"]
    cfg.set("registry", "url", url)
    if username:
        cfg.set("registry", "username", username)
    if password:
        cfg.set("registry", "password", password)
    cfg.set("registry", "verify_ssl", verify_ssl)
    click.echo("Configuration saved.")


@cmd_group("query", "Query images from the registry.")
@click.pass_context
def query_group(ctx):
    pass


@cmd(name="repos", group="query")
@click.option("-n", "--limit", default=None, type=int, help="Max number of repos")
@click.pass_context
def query_repos(ctx, limit):
    """List all repositories in the registry."""
    client = _build_client(ctx.obj["config"])
    q = ImageQuery(client, ctx.obj["db"])
    try:
        repos = q.list_repos(n=limit)
        if not repos:
            click.echo("No repositories found.")
            return
        table = [[i + 1, r] for i, r in enumerate(repos)]
        click.echo(tabulate(table, headers=["#", "Repository"], tablefmt="grid"))
        click.echo(f"\nTotal: {len(repos)} repositories")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="tags", group="query")
@click.argument("repository")
@click.option("-n", "--limit", default=None, type=int, help="Max number of tags")
@click.pass_context
def query_tags(ctx, repository, limit):
    """List tags for a repository."""
    client = _build_client(ctx.obj["config"])
    q = ImageQuery(client, ctx.obj["db"])
    try:
        tags = q.list_tags(repository, n=limit)
        if not tags:
            click.echo(f"No tags found for {repository}")
            return
        table = [[i + 1, t] for i, t in enumerate(tags)]
        click.echo(tabulate(table, headers=["#", "Tag"], tablefmt="grid"))
        click.echo(f"\nTotal: {len(tags)} tags")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="inspect", group="query")
@click.argument("repository")
@click.argument("reference")
@click.pass_context
def query_inspect(ctx, repository, reference):
    """Inspect an image or tag in detail."""
    client = _build_client(ctx.obj["config"])
    q = ImageQuery(client, ctx.obj["db"])
    try:
        info = q.inspect(repository, reference)
        click.echo(json.dumps(info, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="search", group="query")
@click.argument("keyword")
@click.option("-r", "--repository", default=None, help="Limit to specific repository")
@click.pass_context
def query_search(ctx, keyword, repository):
    """Search images by keyword."""
    client = _build_client(ctx.obj["config"])
    q = ImageQuery(client, ctx.obj["db"])
    try:
        results = q.search(keyword, repository=repository)
        if not results:
            click.echo("No results found.")
            return
        table = []
        for kind, name, tag in results:
            table.append([kind, name, tag or "-"])
        click.echo(tabulate(table, headers=["Type", "Name", "Tag"], tablefmt="grid"))
        click.echo(f"\nTotal: {len(results)} results")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="size", group="query")
@click.argument("repository")
@click.pass_context
def query_size(ctx, repository):
    """Show size report for a repository."""
    client = _build_client(ctx.obj["config"])
    q = ImageQuery(client, ctx.obj["db"])
    try:
        report = q.size_report(repository)
        table = []
        for t in report["tags"]:
            table.append([t["tag"], t["digest"][:19] + "...", _fmt_size(t["size"]), t["layers"]])
        click.echo(tabulate(table, headers=["Tag", "Digest", "Size", "Layers"], tablefmt="grid"))
        click.echo(f"\nTotal size: {_fmt_size(report['total_size'])}")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="sync", group="query")
@click.option("-r", "--repository", default=None, help="Sync specific repository only")
@click.option("--concurrency", default=None, type=int, help="Concurrent workers")
@click.pass_context
def query_sync(ctx, repository, concurrency):
    """Sync registry data to local database with parallel execution."""
    client = _build_client(ctx.obj["config"])
    executor = _build_executor(ctx.obj["config"])
    if concurrency is not None:
        executor.max_workers = concurrency
    q = ImageQuery(client, ctx.obj["db"])
    try:
        repos = [repository] if repository else client.catalog()
        if not repos:
            click.echo("No repositories to sync.")
            return

        click.echo(f"Syncing {len(repos)} repositories with {executor.max_workers} workers...")

        tasks = []
        for repo in repos:
            tasks.append((f"sync:{repo}", q.sync, (repo,), {}))

        results = executor.execute(tasks)
        executor.print_summary()

        count = sum(1 for r in results if r.success)
        click.echo(f"Synced {count}/{len(results)} repositories")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("tag", "Manage image tags.")
@click.pass_context
def tag_group(ctx):
    pass


@cmd(name="list", group="tag")
@click.argument("repository")
@click.option("-d", "--detailed", is_flag=True, help="Show detailed tag info")
@click.pass_context
def tag_list(ctx, repository, detailed):
    """List tags with optional details."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    try:
        tags = tm.list_tags(repository, detailed=detailed)
        if not tags:
            click.echo(f"No tags found for {repository}")
            return
        if detailed:
            table = []
            for t in tags:
                table.append([t["tag"], t.get("digest", "-")[:19] + "...", _fmt_size(t.get("total_size", 0)), t.get("layers", "-")])
            click.echo(tabulate(table, headers=["Tag", "Digest", "Size", "Layers"], tablefmt="grid"))
        else:
            table = [[i + 1, t["tag"]] for i, t in enumerate(tags)]
            click.echo(tabulate(table, headers=["#", "Tag"], tablefmt="grid"))
        click.echo(f"\nTotal: {len(tags)} tags")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="inspect", group="tag")
@click.argument("repository")
@click.argument("tag_name")
@click.pass_context
def tag_inspect(ctx, repository, tag_name):
    """Inspect a specific tag."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    try:
        detail = tm.inspect_tag(repository, tag_name)
        click.echo(json.dumps(detail, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="delete", group="tag")
@click.argument("repository")
@click.argument("tag_name")
@click.option("--force", is_flag=True, help="Continue on error")
@click.option("--ignore-locks", is_flag=True, help="Ignore tag locks")
@click.pass_context
def tag_delete(ctx, repository, tag_name, force, ignore_locks):
    """Delete a tag from the registry."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    try:
        result = tm.delete_tag(repository, tag_name, force=force, respect_locks=not ignore_locks)
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="compare", group="tag")
@click.argument("repository")
@click.argument("tag1")
@click.argument("tag2")
@click.pass_context
def tag_compare(ctx, repository, tag1, tag2):
    """Compare two tags in a repository."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    try:
        result = tm.compare_tags(repository, tag1, tag2)
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="duplicates", group="tag")
@click.argument("repository")
@click.pass_context
def tag_duplicates(ctx, repository):
    """Find duplicate tags (same digest, different tag names)."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    try:
        result = tm.find_duplicates(repository)
        dups = result.get("duplicates", {})
        if not dups:
            click.echo("No duplicate tags found.")
            return
        for digest, tags_list in dups.items():
            click.echo(f"Digest: {digest[:19]}...")
            for t in tags_list:
                click.echo(f"  - {t}")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="bulk-delete", group="tag")
@click.argument("repository")
@click.argument("tags", nargs=-1, required=True)
@click.option("--force", is_flag=True, help="Continue on error")
@click.option("--ignore-locks", is_flag=True, help="Ignore tag locks")
@click.option("--concurrency", default=1, type=int, help="Concurrent workers")
@click.pass_context
def tag_bulk_delete(ctx, repository, tags, force, ignore_locks, concurrency):
    """Delete multiple tags from a repository with concurrent execution."""
    client = _build_client(ctx.obj["config"])
    tm = TagManager(client, ctx.obj["db"])
    executor = BatchExecutor(max_workers=concurrency, show_progress=True)
    try:
        if concurrency > 1:
            tasks = [(f"{repository}:{t}", tm.delete_tag, (repository, t),
                      {"force": force, "respect_locks": not ignore_locks}) for t in tags]
            results = executor.execute(tasks)
            executor.print_summary()
            table = []
            for r in results:
                if r.success and isinstance(r.result, dict):
                    table.append([r.result.get("tag", "?"), r.result.get("deleted", False), r.duration])
                else:
                    table.append([r.task_id.split(":")[-1], False, f"{r.error}"])
            click.echo(tabulate(table, headers=["Tag", "Status", "Duration"], tablefmt="grid"))
        else:
            results = tm.bulk_delete_tags(repository, list(tags), force=force, respect_locks=not ignore_locks)
            table = []
            for r in results:
                reason = r.get("reason", "")
                affected = r.get("affected_tags", [])
                extra = f" (affected: {affected})" if affected and len(affected) > 1 else ""
                extra += f" [{reason}]" if reason else ""
                table.append([r.get("tag", "?"), r.get("deleted", r.get("status", "?")), extra])
            click.echo(tabulate(table, headers=["Tag", "Status", "Detail"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("batch", "Batch image management operations.")
@click.pass_context
def batch_group(ctx):
    pass


@cmd(name="query", group="batch")
@click.option("-r", "--repositories", multiple=True, help="Specific repositories")
@click.option("-k", "--keyword", default=None, help="Filter by keyword")
@click.option("-n", "--limit", default=None, type=int, help="Max repos to scan")
@click.option("--concurrency", default=None, type=int, help="Concurrent workers")
@click.pass_context
def batch_query(ctx, repositories, keyword, limit, concurrency):
    """Batch query multiple repositories with concurrent execution."""
    client = _build_client(ctx.obj["config"])
    bm = BatchManager(client, ctx.obj["db"])
    executor = _build_executor(ctx.obj["config"])
    if concurrency is not None:
        executor.max_workers = concurrency
    try:
        repos = list(repositories) if repositories else None
        if not repos:
            repos = client.catalog(n=limit)
            if keyword:
                repos = [r for r in repos if keyword.lower() in r.lower()]

        click.echo(f"Querying {len(repos)} repositories with {executor.max_workers} workers...")

        def _query_single(repo):
            tags = client.list_tags(repo)
            return {"tags": tags, "tag_count": len(tags), "status": "ok"}

        tasks = [(repo, _query_single, (repo,), {}) for repo in repos]
        results = executor.execute(tasks)
        executor.print_summary()

        table = []
        for r in results:
            repo = r.task_id
            if r.success:
                info = r.result
                table.append([repo, info["tag_count"], ", ".join(info["tags"][:5]) + ("..." if len(info["tags"]) > 5 else ""), info["status"]])
            else:
                table.append([repo, 0, "", f"error: {r.error}"])
        click.echo(tabulate(table, headers=["Repository", "Tags", "Sample Tags", "Status"], tablefmt="grid"))
        click.echo(f"\nTotal: {len(results)} repositories")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="delete-tags", group="batch")
@click.option("-m", "--mapping", multiple=True, help="repo:tag1,tag2 format")
@click.option("--force", is_flag=True, help="Continue on error")
@click.option("--ignore-locks", is_flag=True, help="Ignore tag locks")
@click.option("--concurrency", default=1, type=int, help="Concurrent workers")
@click.pass_context
def batch_delete_tags(ctx, mapping, force, ignore_locks, concurrency):
    """Batch delete tags across repositories. Format: repo:tag1,tag2"""
    client = _build_client(ctx.obj["config"])
    bm = BatchManager(client, ctx.obj["db"])
    mappings = {}
    for m in mapping:
        if ":" not in m:
            click.echo(f"Invalid mapping format: {m}. Use repo:tag1,tag2")
            return
        repo, tags_str = m.split(":", 1)
        mappings[repo] = [t.strip() for t in tags_str.split(",") if t.strip()]
    if not mappings:
        click.echo("No mappings provided. Use -m repo:tag1,tag2")
        return
    try:
        results = bm.batch_tag_delete(mappings, force=force)
        table = [[r["repository"], r["tag"], r["status"]] for r in results]
        click.echo(tabulate(table, headers=["Repository", "Tag", "Status"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="delete-repos", group="batch")
@click.argument("repositories", nargs=-1, required=True)
@click.option("--force", is_flag=True, help="Continue on error")
@click.pass_context
def batch_delete_repos(ctx, repositories, force):
    """Batch delete entire repositories (all tags/manifests)."""
    client = _build_client(ctx.obj["config"])
    bm = BatchManager(client, ctx.obj["db"])
    try:
        results = bm.batch_repo_delete(list(repositories), force=force)
        table = [[r["repository"], r["tags_removed"], r["status"]] for r in results]
        click.echo(tabulate(table, headers=["Repository", "Tags Removed", "Status"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="sync", group="batch")
@click.option("-r", "--repositories", multiple=True, help="Specific repositories to sync")
@click.option("-n", "--limit", default=None, type=int, help="Max repos to sync")
@click.option("--concurrency", default=None, type=int, help="Concurrent workers")
@click.pass_context
def batch_sync(ctx, repositories, limit, concurrency):
    """Batch sync registry data to local database with concurrent execution."""
    client = _build_client(ctx.obj["config"])
    bm = BatchManager(client, ctx.obj["db"])
    executor = _build_executor(ctx.obj["config"])
    if concurrency is not None:
        executor.max_workers = concurrency
    try:
        repos = list(repositories) if repositories else client.catalog(n=limit)
        click.echo(f"Syncing {len(repos)} repositories with {executor.max_workers} workers...")

        def _sync_single(repo):
            tags = client.list_tags(repo)
            synced = 0
            for tag in tags:
                try:
                    detail = client.tag_detail(repo, tag)
                    image_id = ctx.obj["db"].upsert_image(
                        name=repo.split("/")[-1] if "/" in repo else repo,
                        repository=repo,
                        digest=detail["digest"],
                        size_bytes=detail["total_size"],
                        metadata={
                            "media_type": detail["media_type"],
                            "layers": detail["layers"],
                        },
                    )
                    ctx.obj["db"].add_tag(image_id, tag, detail["digest"])
                    synced += 1
                except Exception:
                    continue
            return {"synced": synced, "total": len(tags)}

        tasks = [(repo, _sync_single, (repo,), {}) for repo in repos]
        results = executor.execute(tasks)
        executor.print_summary()

        table = []
        for r in results:
            if r.success:
                table.append([r.task_id, f"{r.result['synced']}/{r.result['total']}", "ok"])
            else:
                table.append([r.task_id, "0/0", f"error: {r.error}"])
        click.echo(tabulate(table, headers=["Repository", "Synced", "Status"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("clean", "Redundant image cleanup management.")
@click.pass_context
def clean_group(ctx):
    pass


@cmd(name="find-untagged", group="clean")
@click.argument("repository")
@click.pass_context
def clean_find_untagged(ctx, repository):
    """Find untagged images in a repository."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=True)
    try:
        result = cl.find_untagged(repository)
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="find-old", group="clean")
@click.argument("repository")
@click.option("-d", "--days", default=90, type=int, help="Older than N days")
@click.pass_context
def clean_find_old(ctx, repository, days):
    """Find images older than N days."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=True)
    try:
        result = cl.find_older_than(repository, days)
        if result["to_remove"]:
            click.echo(f"Images older than {days} days in {repository}:")
            for t in result["to_remove"]:
                locked = ctx.obj["db"].is_tag_locked(repository, t)
                marker = " [LOCKED]" if locked else ""
                click.echo(f"  - {t}{marker}")
            click.echo(f"\nTo remove: {len(result['to_remove'])}, To keep: {len(result['to_keep'])}")
        else:
            click.echo(f"No images older than {days} days found.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="find-duplicates", group="clean")
@click.argument("repository")
@click.pass_context
def clean_find_duplicates(ctx, repository):
    """Find duplicate digest tags in a repository."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=True)
    try:
        result = cl.find_duplicate_digest(repository)
        dups = result.get("duplicates", {})
        to_remove = result.get("to_remove", [])
        if not dups:
            click.echo("No duplicate digest tags found.")
            return
        for digest, tags_list in dups.items():
            click.echo(f"Digest: {digest[:19]}...")
            for t in tags_list:
                marker = " (remove)" if t in to_remove else " (keep)"
                locked = ctx.obj["db"].is_tag_locked(repository, t)
                if locked:
                    marker += " [LOCKED]"
                click.echo(f"  - {t}{marker}")
        click.echo(f"\nTotal removable: {len(to_remove)} tags")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="find-latest", group="clean")
@click.argument("repository")
@click.option("-n", "--keep", default=5, type=int, help="Keep latest N tags")
@click.pass_context
def clean_find_latest(ctx, repository, keep):
    """Find tags to remove, keeping only the latest N (semver sorted)."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=True)
    try:
        result = cl.find_keep_latest_n(repository, n=keep)
        if result["to_remove"]:
            click.echo(f"Tags to remove (keeping latest {keep}):")
            for t in result["to_remove"]:
                locked = ctx.obj["db"].is_tag_locked(repository, t)
                marker = " [LOCKED]" if locked else ""
                click.echo(f"  - {t}{marker}")
            click.echo(f"\nTo remove: {len(result['to_remove'])}, To keep: {len(result['to_keep'])}")
        else:
            click.echo(f"Only {len(result['to_keep'])} tags found, nothing to remove.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="find-pattern", group="clean")
@click.argument("repository")
@click.argument("pattern")
@click.pass_context
def clean_find_pattern(ctx, repository, pattern):
    """Find tags matching a pattern (e.g. 'dev-*', 'test-*')."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=True)
    try:
        result = cl.find_by_pattern(repository, pattern)
        if result["matched"]:
            click.echo(f"Tags matching '{pattern}' in {repository}:")
            for t in result["matched"]:
                locked = ctx.obj["db"].is_tag_locked(repository, t)
                marker = " [LOCKED]" if locked else ""
                click.echo(f"  - {t}{marker}")
            click.echo(f"\nMatched: {len(result['matched'])}/{result['total']}")
        else:
            click.echo("No matching tags found.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="execute", group="clean")
@click.argument("repository")
@click.argument("tags", nargs=-1, required=True)
@click.option("--dry-run/--no-dry-run", default=True, help="Dry run mode")
@click.option("--ignore-locks", is_flag=True, help="Ignore tag locks")
@click.option("--concurrency", default=1, type=int, help="Concurrent workers")
@click.pass_context
def clean_execute(ctx, repository, tags, dry_run, ignore_locks, concurrency):
    """Execute cleanup: delete specified tags from a repository."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"], dry_run=dry_run)
    executor = BatchExecutor(max_workers=concurrency, show_progress=True)
    try:
        if concurrency > 1:
            tasks = [
                (f"{repository}:{t}", cl.execute_cleanup, (repository, [t]),
                 {"respect_locks": not ignore_locks})
                for t in tags
            ]
            results = executor.execute(tasks)
            executor.print_summary()
            table = []
            for r in results:
                if r.success and r.result:
                    for item in r.result:
                        table.append([item["target"], item["status"]])
                else:
                    table.append([r.task_id, f"error: {r.error}"])
            click.echo(tabulate(table, headers=["Target", "Status"], tablefmt="grid"))
        else:
            results = cl.execute_cleanup(repository, list(tags), respect_locks=not ignore_locks)
            table = [[r["target"], r["status"]] for r in results]
            click.echo(tabulate(table, headers=["Target", "Status"], tablefmt="grid"))
        if dry_run:
            click.echo("\n(Dry run - no changes made)")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("policy", "Manage cleanup policies.")
@click.pass_context
def policy_group(ctx):
    pass


@cmd(name="list", group="policy")
@click.pass_context
def policy_list(ctx):
    """List all cleanup policies."""
    db = ctx.obj["db"]
    policies = db.list_policies()
    if not policies:
        click.echo("No cleanup policies defined.")
        return
    table = []
    for p in policies:
        table.append([p["id"], p["name"], p["strategy"], "enabled" if p["enabled"] else "disabled", p["params_json"][:50]])
    click.echo(tabulate(table, headers=["ID", "Name", "Strategy", "Status", "Params"], tablefmt="grid"))


@cmd(name="add", group="policy")
@click.argument("name")
@click.argument("strategy", type=click.Choice(Cleaner.STRATEGIES))
@click.option("-r", "--repository", required=True, help="Target repository")
@click.option("-n", "--keep-n", default=5, type=int, help="For keep_latest_n: number to keep")
@click.option("-d", "--days", default=90, type=int, help="For older_than: number of days")
@click.option("-p", "--pattern", default="*", help="For pattern: glob pattern")
@click.pass_context
def policy_add(ctx, name, strategy, repository, keep_n, days, pattern):
    """Add a cleanup policy."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"])
    params = {"repository": repository}
    if strategy == "keep_latest_n":
        params["n"] = keep_n
    elif strategy == "older_than":
        params["days"] = days
    elif strategy == "pattern":
        params["pattern"] = pattern
    try:
        cl.add_policy(name, strategy, params)
        click.echo(f"Policy '{name}' added (strategy={strategy}, repo={repository})")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="remove", group="policy")
@click.argument("name")
@click.pass_context
def policy_remove(ctx, name):
    """Remove a cleanup policy."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"])
    try:
        cl.remove_policy(name)
        click.echo(f"Policy '{name}' removed.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="enable", group="policy")
@click.argument("name")
@click.pass_context
def policy_enable(ctx, name):
    """Enable a cleanup policy."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"])
    cl.toggle_policy(name, enabled=True)
    click.echo(f"Policy '{name}' enabled.")


@cmd(name="disable", group="policy")
@click.argument("name")
@click.pass_context
def policy_disable(ctx, name):
    """Disable a cleanup policy."""
    client = _build_client(ctx.obj["config"])
    cl = Cleaner(client, ctx.obj["db"])
    cl.toggle_policy(name, enabled=False)
    click.echo(f"Policy '{name}' disabled.")


@cmd(name="run", group="policy")
@click.argument("name")
@click.option("--dry-run/--no-dry-run", default=None, help="Override dry-run setting")
@click.pass_context
def policy_run(ctx, name, dry_run):
    """Execute a cleanup policy."""
    client = _build_client(ctx.obj["config"])
    cfg = ctx.obj["config"]
    actual_dry_run = cfg.get("cleaner", "dry_run", default=True) if dry_run is None else dry_run
    cl = Cleaner(client, ctx.obj["db"], dry_run=actual_dry_run)
    try:
        result = cl.run_policy(name)
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("lock", "Image tag locking for deletion protection.")
@click.pass_context
def lock_group(ctx):
    pass


@cmd(name="add", group="lock")
@click.argument("repository")
@click.argument("tag")
@click.option("-r", "--reason", default=None, help="Lock reason")
@click.option("-b", "--locked-by", default=None, help="User who locked")
@click.option("-e", "--expires", default=None, help="Expiration (e.g. 7d, 24h, 2026-12-31)")
@click.pass_context
def lock_add(ctx, repository, tag, reason, locked_by, expires):
    """Lock a tag to prevent deletion."""
    db = ctx.obj["db"]
    try:
        client = _build_client(ctx.obj["config"])
        detail = None
        try:
            detail = client.tag_detail(repository, tag)
        except Exception:
            pass
        digest = detail["digest"] if detail else None

        expires_at = None
        if expires:
            expires_at = _parse_expires(expires)
            if not expires_at:
                click.echo(f"Error: Invalid expiration format '{expires}'. Use e.g. 7d, 24h, 2026-12-31")
                return

        if not locked_by:
            locked_by = getpass.getuser()

        lock_id = db.add_locked_tag(
            repository=repository,
            tag=tag,
            digest=digest,
            reason=reason,
            locked_by=locked_by,
            expires_at=expires_at,
        )
        if lock_id is None:
            click.echo(f"Tag {repository}:{tag} is already locked.")
        else:
            click.echo(f"Locked {repository}:{tag} (id={lock_id})")
            if expires_at:
                click.echo(f"  Expires at: {expires_at}")
        db.add_operation_log("lock", "add", f"{repository}:{tag}", "success", reason)
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="list", group="lock")
@click.option("-r", "--repository", default=None, help="Filter by repository")
@click.pass_context
def lock_list(ctx, repository):
    """List all locked tags."""
    db = ctx.obj["db"]
    try:
        locks = db.list_locked_tags(repository=repository)
        if not locks:
            click.echo("No locked tags found.")
            return
        table = []
        for l in locks:
            table.append([
                l["id"], l["repository"], l["tag"], l.get("reason", "-") or "-",
                l.get("locked_by", "-") or "-", l["locked_at"], l.get("expires_at", "-") or "-"
            ])
        click.echo(tabulate(table, headers=["ID", "Repository", "Tag", "Reason", "Locked By", "Locked At", "Expires"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="remove", group="lock")
@click.argument("repository")
@click.argument("tag")
@click.pass_context
def lock_remove(ctx, repository, tag):
    """Unlock a tag."""
    db = ctx.obj["db"]
    try:
        count = db.delete_locked_tag(repository, tag)
        if count == 0:
            click.echo(f"No lock found for {repository}:{tag}.")
        else:
            click.echo(f"Unlocked {repository}:{tag}")
            db.add_operation_log("lock", "remove", f"{repository}:{tag}", "success")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="purge-expired", group="lock")
@click.pass_context
def lock_purge_expired(ctx):
    """Purge all expired locks."""
    db = ctx.obj["db"]
    try:
        expired = db.get_expired_locks()
        if not expired:
            click.echo("No expired locks found.")
            return
        click.echo(f"Found {len(expired)} expired locks:")
        for l in expired:
            click.echo(f"  - {l['repository']}:{l['tag']} (expired: {l['expires_at']})")
        if click.confirm("Purge these locks?"):
            count = db.purge_expired_locks()
            click.echo(f"Purged {count} expired locks.")
            db.add_operation_log("lock", "purge-expired", f"{count} locks", "success")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd_group("schedule", "Scheduled task management.")
@click.pass_context
def schedule_group(ctx):
    pass


@cmd(name="list", group="schedule")
@click.pass_context
def schedule_list(ctx):
    """List all scheduled tasks."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        tasks = scheduler.list_tasks()
        if not tasks:
            click.echo("No scheduled tasks defined.")
            return
        table = []
        for t in tasks:
            table.append([
                t["id"], t["name"], t["task_type"],
                "enabled" if t["enabled"] else "disabled",
                t.get("cron", "-") or "-",
                t.get("next_run", "-") or "-",
                t.get("last_run_at", "-") or "-",
            ])
        click.echo(tabulate(table, headers=["ID", "Name", "Type", "Status", "Cron", "Next Run", "Last Run"], tablefmt="grid"))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="add", group="schedule")
@click.argument("name")
@click.argument("task_type", type=click.Choice(["cleanup_policy", "sync", "garbage_collect"]))
@click.option("-s", "--schedule", required=True,
              help=f"Schedule: preset ({', '.join(PRESET_SCHEDULES.keys())}) or 5-field cron (m h d M w)")
@click.option("-p", "--policy", default=None, help="Policy name (for cleanup_policy type)")
@click.option("-r", "--repository", default=None, help="Repository (for sync type)")
@click.option("--params", default=None, help="JSON string of extra params")
@click.pass_context
def schedule_add(ctx, name, task_type, schedule, policy, repository, params):
    """Add a scheduled task."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        task_params = {}
        if task_type == "cleanup_policy":
            if not policy:
                click.echo("Error: --policy is required for cleanup_policy tasks")
                return
            task_params["policy"] = policy
        if task_type == "sync" and repository:
            task_params["repository"] = repository
        if params:
            import json as _json
            task_params.update(_json.loads(params))

        task_id = scheduler.add_task(name, task_type, schedule, task_params)
        if task_id is None:
            click.echo(f"Task '{name}' already exists.")
        else:
            cron = parse_schedule(schedule)
            click.echo(f"Task '{name}' added (type={task_type}, cron='{cron}')")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="remove", group="schedule")
@click.argument("name")
@click.pass_context
def schedule_remove(ctx, name):
    """Remove a scheduled task."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        count = scheduler.remove_task(name)
        if count == 0:
            click.echo(f"Task '{name}' not found.")
        else:
            click.echo(f"Task '{name}' removed.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="enable", group="schedule")
@click.argument("name")
@click.pass_context
def schedule_enable(ctx, name):
    """Enable a scheduled task."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        scheduler.enable_task(name)
        click.echo(f"Task '{name}' enabled.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="disable", group="schedule")
@click.argument("name")
@click.pass_context
def schedule_disable(ctx, name):
    """Disable a scheduled task."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        scheduler.disable_task(name)
        click.echo(f"Task '{name}' disabled.")
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="run", group="schedule")
@click.argument("name")
@click.pass_context
def schedule_run(ctx, name):
    """Execute a scheduled task immediately."""
    scheduler = _build_scheduler(ctx.obj["config"])
    try:
        result = scheduler.run_task_now(name)
        click.echo(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        click.echo(f"Error: {e}")


@cmd(name="daemon", group="schedule")
@click.option("--foreground/--background", default=True, help="Run in foreground")
@click.pass_context
def schedule_daemon(ctx, foreground):
    """Run the scheduler daemon (checks tasks every minute)."""
    scheduler = _build_scheduler(ctx.obj["config"])
    click.echo(f"Starting scheduler daemon (pid={os.getpid() if 'os' in dir() else 'N/A'})...")
    click.echo("Press Ctrl+C to stop.")

    def _signal_handler(signum, frame):
        click.echo("\nStopping scheduler...")
        scheduler.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    if foreground:
        try:
            scheduler.start(daemon=False)
            while scheduler.is_running():
                scheduler._thread.join(timeout=1)
        except KeyboardInterrupt:
            scheduler.stop()
    else:
        import os
        pid = os.fork() if hasattr(os, "fork") else 0
        if pid == 0:
            scheduler.start(daemon=False)
            while scheduler.is_running():
                scheduler._thread.join(timeout=1)
        else:
            click.echo(f"Scheduler started in background (pid={pid})")


@cmd(name="presets", group="schedule")
def schedule_presets():
    """Show available schedule presets."""
    table = [[name, cron] for name, cron in sorted(PRESET_SCHEDULES.items())]
    click.echo(tabulate(table, headers=["Preset", "Cron Expression"], tablefmt="grid"))


@cmd_group("logs", "View and export operation logs.")
@click.pass_context
def logs_group(ctx):
    pass


@cmd(name="cleanup", group="logs")
@click.option("-n", "--limit", default=20, type=int, help="Number of log entries")
@click.pass_context
def logs_cleanup(ctx, limit):
    """View cleanup execution logs."""
    db = ctx.obj["db"]
    entries = db.list_cleanup_logs(limit=limit)
    if not entries:
        click.echo("No logs found.")
        return
    table = []
    for e in entries:
        table.append([e["id"], e["action"], e["target"], e["status"], e["executed_at"]])
    click.echo(tabulate(table, headers=["ID", "Action", "Target", "Status", "Time"], tablefmt="grid"))


@cmd(name="operations", group="logs")
@click.option("-m", "--module", default=None, help="Filter by module (tag/batch/clean/lock)")
@click.option("-n", "--limit", default=20, type=int, help="Number of log entries")
@click.pass_context
def logs_operations(ctx, module, limit):
    """View general operation audit logs."""
    db = ctx.obj["db"]
    entries = db.list_operation_logs(module=module, limit=limit)
    if not entries:
        click.echo("No operation logs found.")
        return
    table = []
    for e in entries:
        table.append([e["id"], e["module"], e["action"], e["target"], e["status"], e["executed_at"]])
    click.echo(tabulate(table, headers=["ID", "Module", "Action", "Target", "Status", "Time"], tablefmt="grid"))


@cmd(name="export", group="logs")
@click.option("-m", "--module", default=None, help="Filter by module")
@click.option("-s", "--status", default=None, help="Filter by status (success/error/skipped)")
@click.option("-f", "--format", "fmt", default="json", type=click.Choice(["json", "csv", "text"]),
              help="Output format")
@click.option("-o", "--output", default="-", help="Output file path (- for stdout)")
@click.option("--from", "from_date", default=None, help="From date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)")
@click.option("--to", "to_date", default=None, help="To date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)")
@click.option("-n", "--limit", default=1000, type=int, help="Max entries")
@click.pass_context
def logs_export(ctx, module, status, fmt, output, from_date, to_date, limit):
    """Export operation logs to JSON, CSV, or text."""
    db = ctx.obj["db"]
    try:
        entries = db.list_operation_logs(module=module, limit=limit)

        if status:
            entries = [e for e in entries if e["status"].lower() == status.lower()]

        if from_date:
            from_dt = _parse_date_filter(from_date)
            if from_dt:
                entries = [e for e in entries if e["executed_at"] >= from_dt.isoformat()]

        if to_date:
            to_dt = _parse_date_filter(to_date)
            if to_dt:
                entries = [e for e in entries if e["executed_at"] <= to_dt.isoformat()]

        if not entries:
            click.echo("No matching log entries found.")
            return

        result = _format_logs(entries, fmt)

        if output == "-":
            click.echo(result)
        else:
            with open(output, "w", encoding="utf-8") as f:
                f.write(result)
            click.echo(f"Exported {len(entries)} entries to {output} ({fmt} format)")

        db.add_operation_log(
            "logs", "export", f"{len(entries)} entries", "success",
            f"format={fmt}, output={output}, module={module}, status={status}"
        )
    except Exception as e:
        click.echo(f"Error: {e}")


def _parse_expires(expires: str) -> Optional[str]:
    if not expires:
        return None
    expires_lower = expires.lower().strip()
    now = datetime.utcnow()

    m = re.match(r"^(\d+)(d|h|m|s)$", expires_lower)
    if m:
        amount = int(m.group(1))
        unit = m.group(2)
        delta = None
        if unit == "d":
            delta = timedelta(days=amount)
        elif unit == "h":
            delta = timedelta(hours=amount)
        elif unit == "m":
            delta = timedelta(minutes=amount)
        elif unit == "s":
            delta = timedelta(seconds=amount)
        if delta:
            return (now + delta).isoformat()

    for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"]:
        try:
            dt = datetime.strptime(expires, fmt)
            return dt.isoformat()
        except ValueError:
            continue

    return None


def _parse_date_filter(date_str: str) -> Optional[datetime]:
    if not date_str:
        return None
    for fmt in ["%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d"]:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def _format_logs(entries, fmt: str) -> str:
    rows = []
    for e in entries:
        rows.append({
            "id": e["id"],
            "module": e["module"],
            "action": e["action"],
            "target": e["target"],
            "status": e["status"],
            "detail": e["detail"] or "",
            "executed_at": e["executed_at"],
        })

    if fmt == "json":
        return json.dumps(rows, indent=2, ensure_ascii=False)

    elif fmt == "csv":
        if not rows:
            return ""
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys(), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        return output.getvalue()

    elif fmt == "text":
        lines = []
        for r in rows:
            lines.append(
                f"[{r['executed_at']}] {r['module']}:{r['action']} "
                f"target={r['target']} status={r['status']}"
                + (f" detail={r['detail']}" if r["detail"] else "")
            )
        return "\n".join(lines) + "\n"

    raise ValueError(f"Unknown format: {fmt}")


@cmd(name="ping")
@click.pass_context
def ping_cmd(ctx):
    """Test connectivity to the registry."""
    client = _build_client(ctx.obj["config"])
    if client.ping():
        click.echo("Registry is reachable.")
    else:
        click.echo("Registry is NOT reachable.")


@cmd(name="commands")
def list_commands():
    """List all available commands."""
    commands = CommandRegistry.list_commands()
    click.echo("\n=== Available Commands ===")
    click.echo("\nRoot commands:")
    for cmd_name in sorted(commands.get("root", [])):
        click.echo(f"  imgctl {cmd_name}")
    for group_name in sorted(k for k in commands.keys() if k != "root"):
        click.echo(f"\n{group_name} group:")
        for cmd_name in sorted(commands[group_name]):
            click.echo(f"  imgctl {group_name} {cmd_name}")
    click.echo()


def _register_all():
    registry = cli
    for name, group in CommandRegistry._groups.items():
        registry.add_command(group, name=name)
    for name, cmd_obj in CommandRegistry._commands.items():
        registry.add_command(cmd_obj, name=name)
    return registry


def main():
    _register_all()
    cli(obj={})


if __name__ == "__main__":
    main()
