import requests
import base64
import json
import time


DEFAULT_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_BACKOFF = 1
PAGINATION_PAGE_SIZE = 100


class RegistryError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class RegistryClient:
    def __init__(self, url, username=None, password=None, verify_ssl=True,
                 timeout=DEFAULT_TIMEOUT, max_retries=MAX_RETRIES):
        self.url = url.rstrip("/")
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl
        self.timeout = timeout
        self.max_retries = max_retries
        self._session = None
        self._token = None
        self._auth_attempted = False

    @property
    def session(self):
        if self._session is None:
            self._session = requests.Session()
            self._session.verify = self.verify_ssl
        return self._session

    def _auth_header(self):
        if self.username and self.password:
            cred = f"{self.username}:{self.password}"
            encoded = base64.b64encode(cred.encode()).decode()
            return f"Basic {encoded}"
        if self._token:
            return f"Bearer {self._token}"
        return None

    def _request(self, method, path, **kwargs):
        url = f"{self.url}/v2{path}"
        headers = kwargs.pop("headers", {})
        auth_header = self._auth_header()
        if auth_header:
            headers["Authorization"] = auth_header
        headers.setdefault("Accept", "application/json")
        kwargs.setdefault("timeout", self.timeout)

        last_exc = None
        for attempt in range(self.max_retries):
            try:
                resp = self.session.request(method, url, headers=headers, **kwargs)
                break
            except requests.ConnectionError as e:
                last_exc = e
                if attempt < self.max_retries - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                raise RegistryError(f"Connection failed after {self.max_retries} retries: {e}")
            except requests.Timeout as e:
                last_exc = e
                if attempt < self.max_retries - 1:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                raise RegistryError(f"Request timed out after {self.max_retries} retries (timeout={self.timeout}s)")
        else:
            raise RegistryError(f"Request failed after {self.max_retries} retries: {last_exc}")

        if resp.status_code == 401:
            www_auth = resp.headers.get("Www-Authenticate", "")
            if "Bearer" in www_auth and not self._auth_attempted:
                self._auth_attempted = True
                self._try_bearer_auth(www_auth, path)
                return self._request(method, path, **kwargs)
            raise RegistryError("Authentication failed", 401)

        if resp.status_code == 404:
            raise RegistryError(f"Not found: {path}", 404)

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise RegistryError(
                f"Registry error ({resp.status_code}): {detail}", resp.status_code
            )

        return resp

    def _try_bearer_auth(self, www_auth, scope_path):
        parts = www_auth.replace("Bearer ", "").split(",")
        realm = None
        service = None
        scope = None
        for part in parts:
            kv = part.strip().split("=", 1)
            if len(kv) == 2:
                key, val = kv[0], kv[1].strip('"')
                if key == "realm":
                    realm = val
                elif key == "service":
                    service = val
                elif key == "scope":
                    scope = val

        if not realm:
            return

        params = {}
        if service:
            params["service"] = service
        if scope:
            params["scope"] = scope
        auth = None
        if self.username and self.password:
            auth = (self.username, self.password)

        try:
            resp = requests.get(
                realm, params=params, auth=auth, verify=self.verify_ssl,
                timeout=self.timeout
            )
            if resp.status_code == 200:
                self._token = resp.json().get("token")
        except Exception:
            pass

    def ping(self):
        try:
            self._auth_attempted = False
            self._request("GET", "/")
            return True
        except RegistryError:
            return False

    def catalog(self, n=None, last=None):
        all_repos = []
        page_size = n or PAGINATION_PAGE_SIZE
        cursor = last
        while True:
            params = {"n": page_size}
            if cursor:
                params["last"] = cursor
            resp = self._request("GET", "/_catalog", params=params)
            repos = resp.json().get("repositories", [])
            all_repos.extend(repos)
            if len(repos) < page_size:
                break
            if n is not None:
                break
            cursor = repos[-1]
        return all_repos

    def list_tags(self, repository, n=None, last=None):
        all_tags = []
        page_size = n or PAGINATION_PAGE_SIZE
        cursor = last
        while True:
            params = {"n": page_size}
            if cursor:
                params["last"] = cursor
            resp = self._request("GET", f"/{repository}/tags/list", params=params)
            data = resp.json()
            tags = data.get("tags", []) or []
            all_tags.extend(tags)
            if len(tags) < page_size:
                break
            if n is not None:
                break
            cursor = tags[-1]
        return all_tags

    def manifest(self, repository, reference):
        headers = {
            "Accept": "application/vnd.docker.distribution.manifest.v2+json, "
            "application/vnd.docker.distribution.manifest.list.v2+json, "
            "application/vnd.oci.image.manifest.v1+json"
        }
        resp = self._request(
            "GET", f"/{repository}/manifests/{reference}", headers=headers
        )
        return {
            "schema_version": resp.json().get("schemaVersion"),
            "media_type": resp.json().get("mediaType"),
            "digest": resp.headers.get("Docker-Content-Digest", ""),
            "size": resp.json().get("config", {}).get("size", 0),
            "manifest": resp.json(),
        }

    def delete_manifest(self, repository, digest):
        headers = {
            "Accept": "application/vnd.docker.distribution.manifest.v2+json, "
            "application/vnd.docker.distribution.manifest.list.v2+json"
        }
        self._request(
            "DELETE", f"/{repository}/manifests/{digest}", headers=headers
        )
        return True

    def blob(self, repository, digest):
        resp = self._request("GET", f"/{repository}/blobs/{digest}")
        return resp.content

    def blob_head(self, repository, digest):
        resp = self._request("HEAD", f"/{repository}/blobs/{digest}")
        return {
            "size": int(resp.headers.get("Content-Length", 0)),
            "digest": digest,
        }

    def delete_blob(self, repository, digest):
        self._request("DELETE", f"/{repository}/blobs/{digest}")
        return True

    def tag_detail(self, repository, tag):
        mf = self.manifest(repository, tag)
        config_size = mf["manifest"].get("config", {}).get("size", 0)
        layer_sizes = sum(
            l.get("size", 0) for l in mf["manifest"].get("layers", [])
        )
        return {
            "tag": tag,
            "digest": mf["digest"],
            "total_size": config_size + layer_sizes,
            "layers": len(mf["manifest"].get("layers", [])),
            "media_type": mf["media_type"],
        }
