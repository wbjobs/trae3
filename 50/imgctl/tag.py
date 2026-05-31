from imgctl.registry import RegistryClient, RegistryError
from imgctl.db import Database


class TagManager:
    def __init__(self, client: RegistryClient, db: Database):
        self.client = client
        self.db = db

    def _op_log(self, action, target, status, detail=None):
        self.db.add_operation_log("tag", action, target, status, detail)

    def list_tags(self, repository, detailed=False):
        try:
            tags = self.client.list_tags(repository)
            if not detailed:
                return [{"tag": t} for t in tags]
            result = []
            for tag in tags:
                try:
                    detail = self.client.tag_detail(repository, tag)
                    result.append(detail)
                except Exception:
                    result.append({"tag": tag, "digest": "-", "total_size": 0, "layers": 0})
            return result
        except RegistryError as e:
            raise RuntimeError(f"Failed to list tags: {e}")

    def inspect_tag(self, repository, tag):
        try:
            return self.client.tag_detail(repository, tag)
        except RegistryError as e:
            raise RuntimeError(f"Failed to inspect tag {tag}: {e}")

    def _check_shared_digest(self, repository, tag_to_delete):
        try:
            detail = self.client.tag_detail(repository, tag_to_delete)
            digest = detail["digest"]
            all_tags = self.client.list_tags(repository)
            shared = []
            for t in all_tags:
                if t == tag_to_delete:
                    shared.append(t)
                    continue
                try:
                    d = self.client.tag_detail(repository, t)
                    if d["digest"] == digest:
                        shared.append(t)
                except Exception:
                    continue
            return digest, shared
        except Exception:
            return None, [tag_to_delete]

    def delete_tag(self, repository, tag, force=False, respect_locks=True):
        target = f"{repository}:{tag}"
        try:
            if respect_locks and self.db.is_tag_locked(repository, tag):
                lock_info = self.db.get_locked_tag(repository, tag)
                reason = lock_info["reason"] or "tag is locked"
                self._op_log("delete", target, "skipped", f"Tag is locked: {reason}")
                return {"repository": repository, "tag": tag, "deleted": False, "reason": "locked"}

            digest, shared_tags = self._check_shared_digest(repository, tag)

            if respect_locks and digest:
                locked_shared = [t for t in shared_tags if self.db.is_tag_locked(repository, t)]
                if locked_shared:
                    self._op_log("delete", target, "skipped",
                                 f"Shared digest {digest} has locked tags: {locked_shared}")
                    return {
                        "repository": repository, "tag": tag, "deleted": False,
                        "reason": f"shared_digest_locked:{locked_shared}",
                    }

            if len(shared_tags) > 1:
                self._op_log("delete", target, "warning",
                             f"Digest {digest} shared by tags: {shared_tags}. Deleting will affect ALL these tags.")
            self.client.delete_manifest(repository, digest)
            img = self.db.get_image(name=repository.split("/")[-1] if "/" in repository else repository, repository=repository)
            if img:
                for st in shared_tags:
                    self.db.delete_tag(img["id"], st)
            self._op_log("delete", target, "success",
                         f"Deleted digest {digest}, affected tags: {shared_tags}")
            return {"repository": repository, "tag": tag, "digest": digest, "deleted": True, "affected_tags": shared_tags}
        except RegistryError as e:
            self._op_log("delete", target, "error", str(e))
            if not force:
                raise RuntimeError(f"Failed to delete tag {tag}: {e}")
            return {"repository": repository, "tag": tag, "deleted": False, "error": str(e)}

    def compare_tags(self, repository, tag1, tag2):
        try:
            d1 = self.client.tag_detail(repository, tag1)
            d2 = self.client.tag_detail(repository, tag2)
            return {
                "repository": repository,
                "tag1": {"tag": tag1, **d1},
                "tag2": {"tag": tag2, **d2},
                "same_digest": d1["digest"] == d2["digest"],
                "size_diff": d2["total_size"] - d1["total_size"],
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to compare tags: {e}")

    def find_duplicates(self, repository):
        try:
            tags = self.client.list_tags(repository)
            digest_map = {}
            for tag in tags:
                try:
                    detail = self.client.tag_detail(repository, tag)
                    d = detail["digest"]
                    if d not in digest_map:
                        digest_map[d] = []
                    digest_map[d].append(tag)
                except Exception:
                    continue
            return {
                "repository": repository,
                "duplicates": {
                    d: tags_list
                    for d, tags_list in digest_map.items()
                    if len(tags_list) > 1
                },
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to find duplicates: {e}")

    def bulk_delete_tags(self, repository, tags, force=False, respect_locks=True):
        results = []
        deleted_digests = set()
        for tag in tags:
            target = f"{repository}:{tag}"
            try:
                if respect_locks and self.db.is_tag_locked(repository, tag):
                    lock_info = self.db.get_locked_tag(repository, tag)
                    reason = lock_info["reason"] or "tag is locked"
                    self._op_log("delete", target, "skipped", f"Tag is locked: {reason}")
                    results.append({"repository": repository, "tag": tag, "deleted": False, "reason": "locked"})
                    continue

                digest, shared_tags = self._check_shared_digest(repository, tag)
                if digest and digest in deleted_digests:
                    self._op_log("delete", target, "skipped", f"Digest {digest} already deleted")
                    results.append({"repository": repository, "tag": tag, "deleted": False, "reason": "digest_already_deleted"})
                    continue

                if respect_locks and digest:
                    locked_shared = [t for t in shared_tags if self.db.is_tag_locked(repository, t)]
                    if locked_shared:
                        self._op_log("delete", target, "skipped",
                                     f"Shared digest {digest} has locked tags: {locked_shared}")
                        results.append({
                            "repository": repository, "tag": tag, "deleted": False,
                            "reason": f"shared_digest_locked:{locked_shared}",
                        })
                        continue

                if len(shared_tags) > 1:
                    protected = [t for t in shared_tags if t not in tags]
                    if protected:
                        self._op_log("delete", target, "skipped",
                                     f"Shared digest {digest} has protected tags: {protected}")
                        results.append({
                            "repository": repository, "tag": tag, "deleted": False,
                            "reason": f"shared_digest_protected:{protected}",
                        })
                        continue

                self.client.delete_manifest(repository, digest)
                deleted_digests.add(digest)
                img = self.db.get_image(name=repository.split("/")[-1] if "/" in repository else repository, repository=repository)
                if img:
                    for st in shared_tags:
                        self.db.delete_tag(img["id"], st)
                self._op_log("delete", target, "success", f"Deleted digest {digest}, tags: {shared_tags}")
                results.append({"repository": repository, "tag": tag, "deleted": True, "affected_tags": shared_tags})
            except Exception as e:
                self._op_log("delete", target, "error", str(e))
                if force:
                    results.append({"repository": repository, "tag": tag, "deleted": False, "error": str(e)})
                else:
                    raise RuntimeError(f"Failed to delete {target}: {e}")
        return results
