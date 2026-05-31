import asyncio
import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.schemas.common import TenantContext
from app.utils.config import get_config

logger = logging.getLogger(__name__)


class ThirdPartyService:

    @staticmethod
    async def register_device_to_manager(
        tenant_ctx: TenantContext,
        device_id: str,
        device_sn: str,
        device_type: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        cfg = get_config().get("thirdparty", {})
        url = cfg.get("device_manager_url")
        if not url:
            logger.warning("Third-party device manager URL not configured, skipping sync")
            return {"status": "skipped", "reason": "not_configured"}

        endpoint = f"{url.rstrip('/')}/api/v1/devices"
        payload = {
            "device_id": device_id,
            "tenant_id": tenant_ctx.tenant_id,
            "device_sn": device_sn,
            "device_type": device_type or "",
            "metadata_json": metadata,
        }
        headers = _build_auth_headers(cfg)

        return await _request_with_retry(
            "POST", endpoint, json=payload, headers=headers,
            timeout=cfg.get("timeout", 10),
            retry_times=cfg.get("retry_times", 3),
            retry_delay=cfg.get("retry_delay", 1),
        )

    @staticmethod
    async def notify_permission_change(
        tenant_ctx: TenantContext,
        event: str,
        device_id: str,
        subject_id: str,
        permission_level: int | None = None,
        resource_scope: str | None = None,
    ) -> dict[str, Any]:
        cfg = get_config().get("thirdparty", {})
        url = cfg.get("device_manager_url")
        if not url:
            return {"status": "skipped", "reason": "not_configured"}

        endpoint = f"{url.rstrip('/')}/api/v1/permissions/notify"
        payload = {
            "tenant_id": tenant_ctx.tenant_id,
            "event": event,
            "device_id": device_id,
            "subject_id": subject_id,
            "permission_level": permission_level if permission_level is not None else 0,
            "resource_scope": resource_scope or "*",
        }
        headers = _build_auth_headers(cfg)

        return await _request_with_retry(
            "POST", endpoint, json=payload, headers=headers,
            timeout=cfg.get("timeout", 10),
            retry_times=cfg.get("retry_times", 3),
            retry_delay=cfg.get("retry_delay", 1),
        )

    @staticmethod
    async def verify_device_with_manager(
        tenant_ctx: TenantContext,
        device_sn: str,
    ) -> dict[str, Any] | None:
        cfg = get_config().get("thirdparty", {})
        url = cfg.get("device_manager_url")
        if not url:
            return None

        encoded_tenant = quote(tenant_ctx.tenant_id, safe="")
        encoded_sn = quote(device_sn, safe="")
        endpoint = f"{url.rstrip('/')}/api/v1/devices/{encoded_tenant}/{encoded_sn}"
        headers = _build_auth_headers(cfg)

        return await _request_with_retry(
            "GET", endpoint, headers=headers,
            timeout=cfg.get("timeout", 10),
            retry_times=cfg.get("retry_times", 3),
            retry_delay=cfg.get("retry_delay", 1),
        )


def _build_auth_headers(cfg: dict) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    api_key = cfg.get("auth_api_key")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


async def _request_with_retry(
    method: str,
    url: str,
    retry_times: int = 3,
    retry_delay: float = 1.0,
    **kwargs,
) -> dict[str, Any]:
    effective_retries = max(1, retry_times)
    last_error = None
    async with httpx.AsyncClient() as client:
        for attempt in range(effective_retries):
            try:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code < 500 and attempt == 0:
                    logger.error(
                        f"Third-party client error (non-retryable): "
                        f"status={e.response.status_code}, url={url}"
                    )
                    return {
                        "status": "client_error",
                        "status_code": e.response.status_code,
                        "error": str(e),
                    }
                logger.error(
                    f"Third-party request failed (attempt {attempt + 1}/{effective_retries}): "
                    f"status={e.response.status_code}, url={url}"
                )
                last_error = e
            except httpx.RequestError as e:
                logger.error(
                    f"Third-party request error (attempt {attempt + 1}/{effective_retries}): {e}"
                )
                last_error = e

            if attempt < effective_retries - 1:
                await asyncio.sleep(retry_delay * (attempt + 1))

    return {
        "status": "error",
        "error": str(last_error),
        "attempts": effective_retries,
    }
