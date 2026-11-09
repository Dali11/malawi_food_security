"""Shared, fail-closed database settings for the API and maintenance jobs."""

from collections.abc import Mapping
import os


_REQUIRED = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
_VALID_SSL_MODES = {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}


def build_db_config(driver: str = "asyncpg", env: Mapping[str, str] | None = None) -> dict[str, object]:
    """Build asyncpg or psycopg2 settings; never use credentials from source defaults."""
    if driver not in {"asyncpg", "psycopg2"}:
        raise ValueError(f"Unsupported database driver: {driver}")

    values = os.environ if env is None else env
    missing = [key for key in _REQUIRED if not values.get(key)]
    if missing:
        raise ValueError("Missing required database environment variables: " + ", ".join(missing))

    try:
        port = int(values.get("DB_PORT", "5432"))
    except ValueError as exc:
        raise ValueError("DB_PORT must be an integer") from exc
    if not 1 <= port <= 65535:
        raise ValueError("DB_PORT must be between 1 and 65535")

    local_hosts = {"localhost", "127.0.0.1", "::1"}
    default_ssl_mode = "disable" if values["DB_HOST"].lower() in local_hosts else "require"
    ssl_mode = values.get("DB_SSL", default_ssl_mode).strip().lower()
    if ssl_mode not in _VALID_SSL_MODES:
        raise ValueError("DB_SSL must be one of: " + ", ".join(sorted(_VALID_SSL_MODES)))

    config: dict[str, object] = {
        "host": values["DB_HOST"],
        "port": port,
        "user": values["DB_USER"],
        "password": values["DB_PASSWORD"],
    }
    if driver == "asyncpg":
        config["database"] = values["DB_NAME"]
        if ssl_mode != "disable":
            config["ssl"] = ssl_mode
    else:
        config["dbname"] = values["DB_NAME"]
        config["sslmode"] = ssl_mode
    return config
