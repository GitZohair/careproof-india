from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


TrustTier = Literal["STRONG", "MODERATE", "WEAK", "INSUFFICIENT", "NEEDS_REVIEW"]


class ReviewCreate(BaseModel):
    facility_id: str = Field(min_length=1, max_length=200)
    capability: str = Field(min_length=2, max_length=40)
    decision: Literal["CONFIRM", "VERIFY", "OVERRIDE"]
    override_tier: TrustTier | None = None
    note: str = Field(min_length=10, max_length=2000)

    @model_validator(mode="after")
    def validate_override(self):
        if self.decision == "OVERRIDE" and self.override_tier is None:
            raise ValueError("override_tier is required for an override")
        if self.decision != "OVERRIDE":
            self.override_tier = None
        return self

