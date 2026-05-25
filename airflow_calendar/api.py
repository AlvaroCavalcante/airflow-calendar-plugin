import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from airflow.models import DagModel, DagRun
from airflow.models.dagbag import DagBag
from airflow.utils.session import create_session

from airflow_calendar.dag_colors import load_dag_colors, save_dag_color
from airflow_calendar.utils import build_calendar_events


class DagColorUpdate(BaseModel):
    color: str


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Airflow Calendar")
templates = Jinja2Templates(directory=os.path.join(CURRENT_DIR, 'templates'))

static_path = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_path), name="static")


@app.get("/api/colors")
def get_colors():
    return load_dag_colors()


@app.put("/api/colors/{dag_id}")
def set_color(dag_id: str, body: DagColorUpdate):
    try:
        save_dag_color(dag_id, body.color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"dag_id": dag_id, "color": body.color}


@app.get("/", response_class=HTMLResponse)
def index(request: Request, session=None):
    date_col = DagRun.logical_date
    date_attr = 'logical_date'

    with create_session() as session:
        query = session.query(DagModel).filter(DagModel.is_paused == False)
        if hasattr(DagModel, 'is_active'):
            query = query.filter(DagModel.is_active == True)

        dags = query.all()
        dagbag = DagBag()
        events = build_calendar_events(
            session, dags, dagbag, date_col, date_attr)

        try:
            template = templates.get_template("calendar_v3.html")
            html_content = template.render({
                "request": request,
                "events": events,
                "colors_api_base": "/calendar/api/colors",
                "static_base": "/calendar/static",
            })
            return HTMLResponse(content=html_content)
        except Exception as e:
            return HTMLResponse(
                content=f"<h1>Erro na renderização:</h1><p>{str(e)}</p>",
                status_code=500,
            )
