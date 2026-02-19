from fastapi import APIRouter, Depends
from airflow.api_fastapi.common.db.common import get_session
from airflow_calendar.logic import get_calendar_events
from sqlalchemy.orm import Session

router = APIRouter(tags=["Calendar"])

@router.get("/events")
def calendar_events(session: Session = Depends(get_session)):
    return get_calendar_events(session)
