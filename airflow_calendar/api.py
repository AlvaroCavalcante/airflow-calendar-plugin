from fastapi import APIRouter, Depends
from airflow_calendar.logic import get_calendar_events
from sqlalchemy.orm import Session
from airflow.utils.session import create_session

try:
    # Caminho mais provável nas versões recentes
    from airflow.api_fastapi.common.db.common import get_session
except ImportError:
    try:
        # Caminho alternativo
        from airflow.api_fastapi.core.db.common import get_session
    except ImportError:
        # Se tudo falhar, definimos o provedor de sessão manualmente
        # Isso é exatamente o que o Airflow faz internamente
        def get_session():
            with create_session() as session:
                yield session

router = APIRouter(tags=["Calendar"])


@router.get("/events")
def calendar_events(session: Session = Depends(get_session)):
    return get_calendar_events(session)
