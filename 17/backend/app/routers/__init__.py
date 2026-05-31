from .data_query import router as data_query_router
from .data_cleaning import router as data_cleaning_router
from .fault_stats import router as fault_stats_router
from .array_group import router as array_group_router
from .report import router as report_router

__all__ = [
    "data_query_router",
    "data_cleaning_router",
    "fault_stats_router",
    "array_group_router",
    "report_router"
]
