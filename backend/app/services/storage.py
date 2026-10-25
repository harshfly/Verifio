"""
Storage service — Phase 2
Abstracts file save/retrieve so the backend can swap between local disk (dev)
and S3-compatible storage (prod) without touching endpoint code.
"""
import os
import shutil
import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Local-disk storage implementation.

    Files are stored under STORAGE_DIR/<submission_id>/<original_filename>.
    Swap this class for an S3StorageService in production.
    """

    def __init__(self, base_dir: str | None = None):
        self.base_dir = base_dir or settings.STORAGE_DIR
        os.makedirs(self.base_dir, exist_ok=True)

    def _submission_dir(self, submission_id: str) -> str:
        path = os.path.join(self.base_dir, submission_id)
        os.makedirs(path, exist_ok=True)
        return path

    async def save_file(self, submission_id: str, filename: str, content: bytes) -> str:
        """Save uploaded file bytes and return the full path on disk."""
        directory = self._submission_dir(submission_id)
        file_path = os.path.join(directory, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        logger.info(f"Saved file: {file_path} ({len(content)} bytes)")
        return file_path

    async def get_file_path(self, submission_id: str, filename: str) -> str | None:
        """Return the full path if the file exists, else None."""
        file_path = os.path.join(self._submission_dir(submission_id), filename)
        return file_path if os.path.exists(file_path) else None

    async def delete_submission_files(self, submission_id: str) -> bool:
        """Delete all files for a submission."""
        directory = os.path.join(self.base_dir, submission_id)
        if os.path.exists(directory):
            shutil.rmtree(directory)
            logger.info(f"Deleted storage for submission {submission_id}")
            return True
        return False


# Singleton instance
storage_service = StorageService()
