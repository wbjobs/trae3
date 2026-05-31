class OceanKernelError(Exception):
    def __init__(self, message: str = "Ocean kernel error occurred"):
        self.message = message
        super().__init__(self.message)


class ParameterValidationError(OceanKernelError):
    def __init__(self, param_name: str, message: str = ""):
        self.param_name = param_name
        full_message = f"Parameter validation failed for '{param_name}'"
        if message:
            full_message += f": {message}"
        super().__init__(full_message)


class BoundaryConditionError(OceanKernelError):
    def __init__(self, boundary_type: str, message: str = ""):
        self.boundary_type = boundary_type
        full_message = f"Boundary condition error for '{boundary_type}'"
        if message:
            full_message += f": {message}"
        super().__init__(full_message)


class NumericalError(OceanKernelError):
    def __init__(self, method: str, message: str = ""):
        self.method = method
        full_message = f"Numerical error in '{method}'"
        if message:
            full_message += f": {message}"
        super().__init__(full_message)


class DimensionMismatchError(OceanKernelError):
    def __init__(self, expected_shape: tuple, actual_shape: tuple, context: str = ""):
        self.expected_shape = expected_shape
        self.actual_shape = actual_shape
        full_message = f"Dimension mismatch: expected {expected_shape}, got {actual_shape}"
        if context:
            full_message += f" ({context})"
        super().__init__(full_message)


class ConvergenceError(OceanKernelError):
    def __init__(self, iterations: int, tolerance: float, message: str = ""):
        self.iterations = iterations
        self.tolerance = tolerance
        full_message = f"Failed to converge after {iterations} iterations (tolerance: {tolerance})"
        if message:
            full_message += f": {message}"
        super().__init__(full_message)


class NodeManagerException(OceanKernelError):
    pass


class NodeNotFoundException(NodeManagerException):
    def __init__(self, node_id: str):
        self.node_id = node_id
        super().__init__(f"Node '{node_id}' not found")


class NodeAlreadyRegisteredException(NodeManagerException):
    def __init__(self, node_id: str):
        self.node_id = node_id
        super().__init__(f"Node '{node_id}' is already registered")


class NodeOfflineException(NodeManagerException):
    def __init__(self, node_id: str):
        self.node_id = node_id
        super().__init__(f"Node '{node_id}' is offline")


class HeartbeatTimeoutException(NodeManagerException):
    def __init__(self, node_id: str, timeout: int):
        self.node_id = node_id
        self.timeout = timeout
        super().__init__(f"Heartbeat timed out for node '{node_id}' after {timeout}s")


class InsufficientResourcesException(NodeManagerException):
    def __init__(self, node_id: str, resource_type: str, required: float, available: float):
        self.node_id = node_id
        self.resource_type = resource_type
        self.required = required
        self.available = available
        super().__init__(
            f"Insufficient {resource_type} on node '{node_id}': "
            f"required={required}, available={available}"
        )


class TaskExecutionException(NodeManagerException):
    def __init__(self, task_id: str, error: str):
        self.task_id = task_id
        self.error = error
        super().__init__(f"Task '{task_id}' execution failed: {error}")


class NodeIsolationException(NodeManagerException):
    def __init__(self, node_id: str, reason: str):
        self.node_id = node_id
        self.reason = reason
        super().__init__(f"Node '{node_id}' is isolated: {reason}")
