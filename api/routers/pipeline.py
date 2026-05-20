"""
routers/pipeline.py
Latest pipeline run status endpoint.
Used by the dashboard header to show when data was last updated.
"""
from fastapi import APIRouter, HTTPException
from api.database import get_pool

router = APIRouter(prefix="/api/pipeline", tags=["Pipeline"])

@router.get("/latest")
async def get_pipeline_latest():
    """
    Returns the most recent pipeline_log entry.
    Powers the PipelineStatusBar in the dashboard header.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT run_at, new_records, new_spikes, new_critical,
                   latest_date, status, notes
            FROM pipeline_log
            ORDER BY run_at DESC
            LIMIT 1
        """)

    if not row:
        raise HTTPException(status_code=404, detail="No pipeline runs found")

    return {
        "run_at"      : row["run_at"].isoformat(),
        "new_records" : row["new_records"]  or 0,
        "new_spikes"  : row["new_spikes"]   or 0,
        "new_critical": row["new_critical"] or 0,
        "latest_date" : row["latest_date"]  or "",
        "status"      : row["status"]       or "success",
        "notes"       : row["notes"]        or "",
    }