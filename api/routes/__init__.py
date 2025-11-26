from .jobs import router as jobs_router
from .libraries import router as libraries_router
from .papers import router as papers_router

__all__ = ["jobs_router", "libraries_router", "papers_router"]
