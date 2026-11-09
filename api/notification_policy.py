import re


MAX_DELIVERY_ATTEMPTS = 5
MAX_RETRY_DELAY_SECONDS = 6 * 60 * 60


def retry_delay_seconds(attempt_number: int) -> int | None:
    """Return the delay after a failed attempt; stop after five attempts."""
    if attempt_number < 1:
        raise ValueError("attempt_number must be positive")
    if attempt_number >= MAX_DELIVERY_ATTEMPTS:
        return None
    return min(60 * (2 ** (attempt_number - 1)), MAX_RETRY_DELAY_SECONDS)


def sanitize_delivery_error(message: str) -> str:
    """Remove common credential forms before persisting provider errors."""
    sanitized = re.sub(
        r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+",
        "Bearer [REDACTED]",
        message,
    )
    sanitized = re.sub(
        r"(?i)\b(password|token|api[_-]?key|secret|authorization)\s*[:=]\s*[^\s,;]+",
        r"\1=[REDACTED]",
        sanitized,
    )
    return sanitized[:1000]
