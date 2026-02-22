"""SKAD Desktop Launcher — starts the server and opens the browser."""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import traceback
import webbrowser


def _get_log_path() -> str:
    """Return a path for the crash log next to the exe."""
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(os.path.dirname(sys.executable), "skad_crash.log")
    return os.path.join(os.path.dirname(__file__), "skad_crash.log")


def find_free_port() -> int:
    """Find a free TCP port to avoid conflicts."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def open_browser(port: int) -> None:
    """Wait for the server to start, then open the browser."""
    url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                break
        except OSError:
            time.sleep(0.1)
    webbrowser.open(url)


def main() -> None:
    port = find_free_port()
    print(f"Starting SKAD on http://127.0.0.1:{port}")
    print("Close this window or press Ctrl+C to stop.\n")

    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    try:
        import uvicorn
        main()
    except Exception:
        err = traceback.format_exc()
        # Print to console
        print(err)
        # Also write to a crash log file next to the exe
        try:
            with open(_get_log_path(), "w") as f:
                f.write(err)
            print(f"\nCrash log saved to: {_get_log_path()}")
        except Exception:
            pass
        print("\n--- SKAD crashed. Press Enter to close. ---")
        try:
            input()
        except EOFError:
            pass
        sys.exit(1)
