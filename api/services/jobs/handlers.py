import logging
from typing import Any, Callable

from models import JobType
from services.parse import handle_parse_paper
from services.extract import handle_extract_elements

logger = logging.getLogger(__name__)


# Type alias for handler functions
HandlerFunc = Callable[[dict[str, Any]], dict[str, Any]]


class JobHandlers:
    """Registry of job type handlers."""

    def __init__(self):
        self._handlers: dict[JobType, HandlerFunc] = {}
        self._register_default_handlers()

    def _register_default_handlers(self):
        """Register built-in handlers."""
        self.register(JobType.PARSE_PAPER, handle_parse_paper)
        self.register(JobType.EXTRACT_CLAIMS, self._handle_extract_claims)
        self.register(JobType.EXTRACT_ELEMENTS, handle_extract_elements)

    def register(self, job_type: JobType, handler: HandlerFunc):
        """Register a handler for a job type."""
        self._handlers[job_type] = handler
        logger.info(f"Registered handler for {job_type.value}")

    def get(self, job_type: JobType) -> HandlerFunc | None:
        """Get the handler for a job type."""
        return self._handlers.get(job_type)

    def process(self, job_type: JobType, payload: dict[str, Any]) -> dict[str, Any]:
        """Process a job with the appropriate handler."""
        handler = self.get(job_type)
        if not handler:
            raise ValueError(f"No handler registered for job type: {job_type}")

        return handler(payload)

    # --- Default Handlers ---

    def _handle_extract_claims(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Handle extract_claims job.

        TODO: Implement your actual extraction logic here.
        """
        logger.info(f"Processing extract_claims job with payload: {payload}")

        # Placeholder - replace with actual implementation
        return {
            "status": "processed",
            "claims": [],
            "message": "Extraction complete"
        }
