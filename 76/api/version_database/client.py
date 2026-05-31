import time
from typing import Any

import requests

from api.version_database.models import VersionDiff, VersionRecord
from utils.config import ConfigManager
from utils.logger import setup_logger
from exceptions import (
    CloudAPIAuthError,
    CloudAPIError,
    CloudAPIRateLimitError,
    CloudAPIServerError,
)


class VersionDatabaseClient:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("api.version_database", config.logging.level, config.logging.file)
        self._base_url = config.cloud.version_database_url
        self._timeout = config.cloud.version_database_timeout
        self._retry_count = config.cloud.version_database_retry_count
        self._retry_delay = config.cloud.version_database_retry_delay
        self._token: str | None = None
        self._session = requests.Session()

    def set_auth_token(self, token: str) -> None:
        self._token = token
        self._session.headers.update({"Authorization": f"Bearer {token}"})

    def list_versions(
        self,
        program_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> list[VersionRecord]:
        params = {"page": page, "page_size": page_size}
        response = self._request("GET", f"/programs/{program_id}/versions", params=params)
        items = response.get("items", [])
        return [VersionRecord.from_dict(item) for item in items]

    def get_version(self, program_id: str, version_id: str) -> VersionRecord:
        response = self._request("GET", f"/programs/{program_id}/versions/{version_id}")
        return VersionRecord.from_dict(response)

    def get_latest_version(self, program_id: str) -> VersionRecord:
        response = self._request("GET", f"/programs/{program_id}/versions/latest")
        return VersionRecord.from_dict(response)

    def create_version(self, version_record: VersionRecord) -> dict[str, Any]:
        payload = version_record.to_dict()
        return self._request(
            "POST", f"/programs/{version_record.program_id}/versions", json=payload
        )

    def compare_versions(
        self, program_id: str, old_version_id: str, new_version_id: str
    ) -> list[VersionDiff]:
        params = {"old_version": old_version_id, "new_version": new_version_id}
        response = self._request(
            "GET", f"/programs/{program_id}/versions/compare", params=params
        )
        diffs = response.get("diffs", [])
        return [VersionDiff.from_dict(d) for d in diffs]

    def delete_version(self, program_id: str, version_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/programs/{program_id}/versions/{version_id}")

    def rollback_version(self, program_id: str, version_id: str) -> dict[str, Any]:
        return self._request(
            "POST", f"/programs/{program_id}/versions/{version_id}/rollback"
        )

    def get_version_history(self, program_id: str) -> list[dict[str, Any]]:
        response = self._request("GET", f"/programs/{program_id}/versions/history")
        return response.get("history", [])

    def _request(
        self,
        method: str,
        endpoint: str,
        params: dict | None = None,
        json: dict | None = None,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{endpoint}"
        last_error: Exception | None = None

        for attempt in range(self._retry_count):
            try:
                resp = self._session.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json,
                    timeout=self._timeout,
                )
                return self._handle_response(resp)

            except CloudAPIAuthError:
                raise
            except CloudAPIRateLimitError as e:
                last_error = e
                wait = self._retry_delay * (attempt + 1)
                self._logger.warning("请求限流,等待 %ds 后重试", wait)
                time.sleep(wait)

            except CloudAPIServerError as e:
                last_error = e
                wait = self._retry_delay * (attempt + 1)
                self._logger.warning("服务端错误,等待 %ds 后重试", wait)
                time.sleep(wait)

            except requests.RequestException as e:
                last_error = e
                wait = self._retry_delay * (attempt + 1)
                self._logger.warning("网络错误,等待 %ds 后重试: %s", wait, e)
                time.sleep(wait)

        raise CloudAPIError(f"请求失败,已重试 {self._retry_count} 次: {last_error}")

    def _handle_response(self, response: requests.Response) -> dict[str, Any]:
        if response.status_code == 401:
            raise CloudAPIAuthError("认证失败,请重新登录")
        if response.status_code == 429:
            raise CloudAPIRateLimitError("请求过于频繁,请稍后重试")
        if response.status_code >= 500:
            raise CloudAPIServerError(f"服务端错误: {response.status_code}")
        if response.status_code >= 400:
            raise CloudAPIError(f"请求错误: {response.status_code} - {response.text}")

        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}
