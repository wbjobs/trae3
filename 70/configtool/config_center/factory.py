from typing import Optional
from .base import ConfigCenterBase
from .apollo import ApolloClient
from .nacos import NacosClient
from configtool.utils import ConfigError

def get_config_center(
    center_type: str = "apollo",
    env: str = "default",
) -> ConfigCenterBase:
    center_type = center_type.lower()

    if center_type == "apollo":
        return ApolloClient(env=env)
    elif center_type == "nacos":
        return NacosClient(env=env)
    else:
        raise ConfigError(
            f"不支持的配置中心类型: {center_type}. 支持的类型: apollo, nacos"
        )
