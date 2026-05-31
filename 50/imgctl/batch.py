from imgctl.registry import RegistryClient, RegistryError
from imgctl.db import Database


class BatchManager:
    def __init__(self, client: RegistryClient, db: Database):
        self.client = client
        self.db = db

    def _op_log(self, action, target, status, detail=None):
        self.db.add_operation_log("batch", action, target, status, detail)

    def batch_query(self, repositories=None, keyword=None, n=None):
        results = {}
        repos = repositories or self.client.catalog(n=n)
        if keyword:
            repos = [r for r in repos if keyword.lower() in r.lower()]
        for repo in repos:
            try:
                tags = self.client.list_tags(repo)
                results[repo] = {"tags": tags, "tag_count": len(tags), "status": "ok"}
            except RegistryError as e:
                results[repo] = {"tags": [], "tag_count": 0, "status": f"error: {e}"}
        self._op_log("query", f"{len(repos)} repos", "success", f"keyword={keyword}")
        return results

    def batch_tag_delete(self, mappings, force=False, respect_locks=True):
        results = []
        for repo, tags in mappings.items():
            deleted_digests = set()
            for tag in tags:
                target = f"{repo}:{tag}"
                try:
                    if respect_locks and self.db.is_tag_locked(repo, tag):
                        lock_info = self.db.get_locked_tag(repo, tag)
                        reason = lock_info["reason"] or "tag is locked"
                        self._op_log("delete", target, "skipped", f"Tag is locked: {reason}")
                        results.append({"repository": repo, "tag": tag, "status": "skipped", "reason": "locked"})
                        continue

                    detail = self.client.tag_detail(repo, tag)
                    digest = detail["digest"]

                    if digest in deleted_digests:
                        self._op_log("delete", target, "skipped", f"Digest {digest} already deleted")
                        results.append({"repository": repo, "tag": tag, "status": "skipped", "reason": "digest_already_deleted"})
                        continue

                    all_repo_tags = self.client.list_tags(repo)
                    shared_tags = []
                    for t in all_repo_tags:
                        try:
                            d = self.client.tag_detail(repo, t)
                            if d["digest"] == digest:
                                shared_tags.append(t)
                        except Exception:
                            continue

                    if respect_locks and digest:
                        locked_shared = [t for t in shared_tags if self.db.is_tag_locked(repo, t)]
                        if locked_shared:
                            self._op_log("delete", target, "skipped",
                                         f"Shared digest {digest} has locked tags: {locked_shared}")
                            results.append({
                                "repository": repo, "tag": tag, "status": "skipped",
                                "reason": f"shared_digest_locked:{locked_shared}",
                            })
                            continue

                    if len(shared_tags) > 1:
                        protected = [t for t in shared_tags if t not in tags]
                        if protected:
                            self._op_log("delete", target, "skipped",
                                         f"Shared digest {digest} has protected tags: {protected}")
                            results.append({
                                "repository": repo, "tag": tag, "status": "skipped",
                                "reason": f"shared_digest_protected:{protected}",
                            })
                            continue

                    self.client.delete_manifest(repo, digest)
                    deleted_digests.add(digest)
                    img = self.db.get_image(
                        name=repo.split("/")[-1] if "/" in repo else repo,
                        repository=repo,
                    )
                    if img:
                        for st in shared_tags:
                            self.db.delete_tag(img["id"], st)
                    self._op_log("delete", target, "success", f"Deleted digest {digest}, tags: {shared_tags}")
                    results.append(
                        {"repository": repo, "tag": tag, "status": "deleted", "affected_tags": shared_tags}
                    )
                except RegistryError as e:
                    self._op_log("delete", target, "error", str(e))
                    if force:
                        results.append(
                            {
                                "repository": repo,
                                "tag": tag,
                                "status": f"error: {e}",
                            }
                        )
                    else:
                        raise RuntimeError(
                            f"Failed to delete {target}: {e}"
                        )
        return results

    def batch_repo_delete(self, repositories, force=False):
        results = []
        for repo in repositories:
            target = f"repo:{repo}"
            try:
                tags = self.client.list_tags(repo)
                digests_seen = set()
                for tag in tags:
                    try:
                        detail = self.client.tag_detail(repo, tag)
                        d = detail["digest"]
                        if d not in digests_seen:
                            digests_seen.add(d)
                            self.client.delete_manifest(repo, d)
                    except Exception:
                        continue
                img = self.db.get_image(
                    name=repo.split("/")[-1] if "/" in repo else repo,
                    repository=repo,
                )
                if img:
                    self.db.delete_image(img["id"])
                self._op_log("delete", target, "success", f"Deleted {len(digests_seen)} manifests, {len(tags)} tags")
                results.append(
                    {"repository": repo, "tags_removed": len(tags), "status": "deleted"}
                )
            except RegistryError as e:
                self._op_log("delete", target, "error", str(e))
                if force:
                    results.append(
                        {"repository": repo, "tags_removed": 0, "status": f"error: {e}"}
                    )
                else:
                    raise RuntimeError(f"Failed to delete repo {repo}: {e}")
        return results

    def batch_sync(self, repositories=None, n=None):
        results = {}
        repos = repositories or self.client.catalog(n=n)
        for repo in repos:
            try:
                tags = self.client.list_tags(repo)
                synced_tags = []
                for tag in tags:
                    try:
                        detail = self.client.tag_detail(repo, tag)
                        image_id = self.db.upsert_image(
                            name=repo.split("/")[-1] if "/" in repo else repo,
                            repository=repo,
                            digest=detail["digest"],
                            size_bytes=detail["total_size"],
                            metadata={
                                "media_type": detail["media_type"],
                                "layers": detail["layers"],
                            },
                        )
                        self.db.add_tag(image_id, tag, detail["digest"])
                        synced_tags.append(tag)
                    except Exception:
                        synced_tags.append(f"{tag} (partial)")
                results[repo] = {"synced": len(synced_tags), "tags": synced_tags}
            except RegistryError as e:
                results[repo] = {"synced": 0, "tags": [], "error": str(e)}
        self._op_log("sync", f"{len(repos)} repos", "success")
        return results
