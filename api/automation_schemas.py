from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PipelineRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    trigger: str = Field(default="scheduler", min_length=1, max_length=40)


class FieldObservationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    market_name: str = Field(min_length=1, max_length=160)
    district: str = Field(min_length=1, max_length=120)
    commodity: str = Field(min_length=1, max_length=160)
    unit: str = Field(min_length=1, max_length=40)
    price: Decimal = Field(gt=0, le=Decimal("1000000000"))
    observation_date: date
    data_collector: str | None = Field(default=None, max_length=160)
    source: str = Field(default="field", min_length=1, max_length=80)
    review_status: Literal["pending"] = "pending"

    @field_validator("market_name", "district", "commodity", "unit", "source")
    @classmethod
    def reject_blank_strings(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("observation_date")
    @classmethod
    def reject_future_observations(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("observation_date cannot be in the future")
        return value


class HeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component: Literal["node-red"] = "node-red"
    status: Literal["healthy", "degraded", "unavailable"] = "healthy"
    details: str | None = Field(default=None, max_length=500)


class DeliveryAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt_id: UUID
    delivered: bool
    external_reference: str | None = Field(default=None, max_length=256)
    error: str | None = Field(default=None, max_length=1000)


class WorkflowFailureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workflow_name: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("workflow_name", "message")
    @classmethod
    def reject_blank_failure_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class WeeklyReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report_id: UUID
    period_start: date
    period_end: date
    content: str = Field(min_length=1, max_length=80_000)
    evidence: dict = Field(default_factory=dict)
    model: str | None = Field(default=None, max_length=160)

    @field_validator("content")
    @classmethod
    def reject_blank_report(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value

    @model_validator(mode="after")
    def validate_period(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        return self
