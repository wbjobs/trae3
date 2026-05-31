class SimPlatformError(Exception):
    pass


class SimulatorError(SimPlatformError):
    pass


class SimulatorTimeoutError(SimulatorError):
    pass


class SimulatorTaskNotFoundError(SimulatorError):
    pass


class VersionError(SimPlatformError):
    pass


class VersionConflictError(VersionError):
    pass


class VersionNotFoundError(VersionError):
    pass


class SyncError(SimPlatformError):
    pass


class SyncConflictError(SyncError):
    pass


class SyncNetworkError(SyncError):
    pass


class SyncAuthenticationError(SyncError):
    pass


class CacheError(SimPlatformError):
    pass


class CacheFullError(CacheError):
    pass


class CacheKeyNotFoundError(CacheError):
    pass


class CloudAPIError(SimPlatformError):
    pass


class CloudAPIAuthError(CloudAPIError):
    pass


class CloudAPIRateLimitError(CloudAPIError):
    pass


class CloudAPIServerError(CloudAPIError):
    pass


class ConfigError(SimPlatformError):
    pass
