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
    js_path = "/static/plugins/airflow_calendar/calendar_bundle.iife.js"

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Airflow Calendar</title>
        <style>
            body {{ margin: 0; background-color: #f0f2f5; font-family: sans-serif; }}
            #root {{ height: 100vh; }}
        </style>
    </head>
    <body>
        <div id="root"></div>
        <script src="{js_path}"></script>
    </body>
    </html>
    """


app.include_router(router)
