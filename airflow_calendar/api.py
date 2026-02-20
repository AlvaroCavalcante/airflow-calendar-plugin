from fastapi import FastAPI, APIRouter, Depends
from airflow_calendar.logic import get_calendar_events
from sqlalchemy.orm import Session
from airflow.utils.session import create_session

try:
    from airflow.api_fastapi.common.db.common import get_session
except ImportError:
    try:
        from airflow.api_fastapi.core.db.common import get_session
    except ImportError:
        def get_session():
            with create_session() as session:
                yield session

app = FastAPI(title="Calendar Plugin API")
router = APIRouter(tags=["Calendar"])

@router.get("/events")
def calendar_events(session: Session = Depends(get_session)):
    return get_calendar_events(session)

app.include_router(router)