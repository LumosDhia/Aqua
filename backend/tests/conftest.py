import os
import tempfile

# Throwaway database per run; set before the app is imported.
_fd, _path = tempfile.mkstemp(prefix="aqua-test-", suffix=".db")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_path}"
os.environ["DEVICE_API_KEY"] = "k"


def pytest_sessionfinish(session, exitstatus):
    from app.db import engine
    engine.dispose()
    if os.path.exists(_path):
        os.remove(_path)
