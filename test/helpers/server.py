from __future__ import annotations

import socket
import subprocess
import time
from contextlib import AbstractContextManager
from pathlib import Path


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class StaticServer(AbstractContextManager):
    """Serve the repository root over HTTP for integration tests."""

    def __init__(self, root: Path, port: int | None = None) -> None:
        self.root = root
        self.port = port or free_port()
        self._process: subprocess.Popen[str] | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def __enter__(self) -> StaticServer:
        self._process = subprocess.Popen(
            ["python3", "-m", "http.server", str(self.port), "--bind", "127.0.0.1"],
            cwd=self.root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        self._wait_until_ready()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None

    def _wait_until_ready(self) -> None:
        import urllib.error
        import urllib.request

        url = f"{self.base_url}/"
        for _ in range(50):
            if self._process and self._process.poll() is not None:
                raise RuntimeError("Static test server failed to start.")
            try:
                with urllib.request.urlopen(url, timeout=0.5) as response:
                    if response.status == 200:
                        return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.1)
        raise RuntimeError(f"Static test server did not become ready at {url}")