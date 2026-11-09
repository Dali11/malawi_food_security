"""Bearer-token dependency for private automation endpoints."""

import hmac
import os

from fastapi import Header, HTTPException, status


def require_automation_token(authorization: str | None = Header(default=None)) -> None:
    """Fail closed unless the caller presents the configured service token."""
    expected = os.getenv("AUTOMATION_API_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Automation API is not configured",
        )

    scheme, separator, supplied = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not supplied
        or not hmac.compare_digest(supplied, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid automation credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
