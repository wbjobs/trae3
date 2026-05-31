import time
from typing import Any

import requests

from api.program_library.models import ProgramFile, ProgramInfo
from utils.config import ConfigManager
from utils.logger import setup_logger
from exceptions import (
    CloudAPIAuthError,
    CloudAPIError,
    CloudAPIRateLimitError,
    CloudAPIServerError,
)


class ProgramLibraryClient:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("api.program_library", config.logging.level, config.logging.file)
        self._base_url = config.cloud.program_library_url
        self._timeout = config.cloud.program_library_timeout
        self._retry_count = config.cloud.program_library_retry_count
        self._retry_delay = config.cloud.program_library_retry_delay
        self._token: str | None = None
        self._session = requests.Session()

    def set_auth_token(self, token: str) -> None:
        self._token = token
        self._session.headers.update({"Authorization": f"Bearer {token}"})

    def list_programs(
        self, category: str | None = None, page: int = 1, page_size: int = 20
    ) -> list[ProgramInfo]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if category:
            params["category"] = category

        response = self._request("GET", "/programs", params=params)
        items = response.get("items", [])
        return [ProgramInfo.from_dict(item) for item in items]

    def get_program(self, program_id: str) -> ProgramInfo:
        response = self._request("GET", f"/programs/{program_id}")
        return ProgramInfo.from_dict(response)

    def search_programs(self, query: str, page: int = 1, page_size: int = 20) -> list[ProgramInfo]:
        params = {"q": query, "page": page, "page_size": page_size}
        response = self._request("GET", "/programs/search", params=params)
        items = response.get("items", [])
        return [ProgramInfo.from_dict(item) for item in items]

    def download_program(self, program_id: str, version: str | None = None) -> dict[str, Any]:
        endpoint = f"/programs/{program_id}/download"
        params: dict[str, Any] = {}
        if version:
            params["version"] = version
        return self._request("GET", endpoint, params=params)

    def upload_program(self, program_info: ProgramInfo, files: list[ProgramFile]) -> dict[str, Any]:
        payload = {
            "program": program_info.to_dict(),
            "files": [f.to_dict() for f in files],
        }
        return self._request("POST", "/programs", json=payload)

    def delete_program(self, program_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/programs/{program_id}")

    def get_categories(self) -> list[dict[str, Any]]:
        response = self._request("GET", "/categories")
        return response.get("categories", [])

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
