from imgctl.registry import RegistryClient, RegistryError
from imgctl.db import Database


class ImageQuery:
    def __init__(self, client: RegistryClient, db: Database):
        self.client = client
        self.db = db

    def list_repos(self, n=None):
        return self.client.catalog(n=n)

    def list_tags(self, repository, n=None):
        try:
            tags = self.client.list_tags(repository, n=n)
            return tags
        except RegistryError as e:
            raise RuntimeError(f"Failed to list tags for {repository}: {e}")

    def inspect(self, repository, reference):
        try:
            if reference.startswith("sha256:"):
                mf = self.client.manifest(repository, reference)
                return {
                    "repository": repository,
                    "digest": mf["digest"],
                    "size": mf["size"],
                    "media_type": mf["media_type"],
                    "manifest": mf["manifest"],
                }
            detail = self.client.tag_detail(repository, reference)
            return {
                "repository": repository,
                **detail,
            }
        except RegistryError as e:
            raise RuntimeError(f"Failed to inspect {repository}:{reference}: {e}")

    def sync(self, repository=None):
        synced = []
        repos = [repository] if repository else self.list_repos()
        for repo in repos:
            try:
                tags = self.list_tags(repo)
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
                        synced.append(f"{repo}:{tag}")
                    except Exception:
                        synced.append(f"{repo}:{tag} (metadata skipped)")
            except Exception as e:
                synced.append(f"{repo} (error: {e})")
        return synced

    def search(self, keyword, repository=None):
        results = []
        repos = [repository] if repository else self.list_repos()
        keyword_lower = keyword.lower()
        for repo in repos:
            if keyword_lower in repo.lower():
                results.append(("repository", repo, None))
            try:
                tags = self.list_tags(repo)
                for tag in tags:
                    if keyword_lower in tag.lower():
                        results.append(("tag", f"{repo}:{tag}", tag))
            except Exception:
                continue
        return results

    def size_report(self, repository):
        try:
            tags = self.list_tags(repository)
            report = []
            total = 0
            for tag in tags:
                try:
                    detail = self.client.tag_detail(repository, tag)
                    report.append(
                        {
                            "tag": tag,
                            "digest": detail["digest"],
                            "size": detail["total_size"],
                            "layers": detail["layers"],
                        }
                    )
                    total += detail["total_size"]
                except Exception:
                    report.append({"tag": tag, "digest": "-", "size": 0, "layers": 0})
            return {"repository": repository, "tags": report, "total_size": total}
        except RegistryError as e:
            raise RuntimeError(f"Failed to generate size report: {e}")
