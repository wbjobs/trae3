class ConfigToolError(Exception):
    pass

class ConfigError(ConfigToolError):
    pass

class NetworkError(ConfigToolError):
    pass

class DatabaseError(ConfigToolError):
    pass

class ValidationError(ConfigToolError):
    pass

class RollbackError(ConfigToolError):
    pass
