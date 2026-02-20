from fastapi import FastAPI, APIRouter, Depends
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from airflow.utils.session import create_session
from sqlalchemy.orm import Session

from airflow_calendar.logic import get_calendar_events

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


@app.get("/", response_class=HTMLResponse)
def get_ui():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Airflow Calendar</title>
        <script type="module" src="/static/airflow_calendar/calendar_bundle.js"></script>
    </head>
    <body style="margin: 0; padding: 0; background: #f0f2f5;">
        <div id="root"></div>
        <script>
            // Pequeno script para garantir que o React monte no lugar certo
            // Se o seu bundle exporta uma função de renderização, chame-a aqui.
        </script>
    </body>
    </html>
    """


app.include_router(router)
