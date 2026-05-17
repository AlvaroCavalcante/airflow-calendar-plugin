import os
import hashlib
from croniter import croniter
from datetime import datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from sqlalchemy import desc
from airflow.models import DagModel, DagRun
from airflow.models.dagbag import DagBag
from airflow.models.serialized_dag import SerializedDagModel
from airflow.utils.session import create_session
from airflow.utils import timezone

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
IGNORED_DAGS = ["airflow_monitoring"]

app = FastAPI(title="Airflow Calendar")
templates = Jinja2Templates(directory=os.path.join(CURRENT_DIR, 'templates'))

static_path = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_path), name="static")


def _get_color_from_tag(tag_name):
    hash_object = hashlib.md5(tag_name.encode())
    return "#" + hash_object.hexdigest()[:6]


def get_border_color(status):
    border_color = "#808080"
    if status == 'success':
        border_color = "#28a745"
    elif status == 'failed':
        border_color = "#dc3545"
    elif status == 'running':
        border_color = "#017cee"
    return border_color


def get_avg_execution_time(recent_success_runs):
    avg_seconds = 300
    if recent_success_runs:
        durations = [(run.end_date - run.start_date).total_seconds()
                     for run in recent_success_runs if run.start_date]
        if durations:
            avg_seconds = sum(durations) / len(durations)
    return max(avg_seconds, 300)


def get_schedule_info(dag):
    schedule = getattr(dag, 'schedule_interval', None)
    if schedule is None:
        schedule = getattr(dag, 'timetable_summary', None)
    if schedule is None and hasattr(dag, 'schedule'):
        schedule = dag.schedule
    return schedule


def get_dag_task_count(session, dagbag, dag):
    ser_dag = SerializedDagModel.get(dag.dag_id, session=session)
    if ser_dag:
        return len(ser_dag.dag.tasks)
    loaded_dag = dagbag.get_dag(dag.dag_id)
    return len(loaded_dag.tasks) if loaded_dag else 0


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

        events = []
        now = timezone.utcnow()
        start_search = now - timedelta(days=7)
        end_search = now + timedelta(days=7)

        for dag in dags:
            if dag.dag_id in IGNORED_DAGS:
                continue

            task_count = get_dag_task_count(session, dagbag, dag)
            schedule = get_schedule_info(dag)

            dag_runs = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id,
                date_col >= start_search,
                date_col <= end_search
            ).all()

            run_history = {
                getattr(run, date_attr).replace(tzinfo=None, microsecond=0).isoformat(): run.state
                for run in dag_runs
            }

            recent_runs = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id
            ).order_by(desc(date_col)).limit(15).all()

            recent_success_runs = [
                run for run in recent_runs if run.state == 'success' and run.end_date][:5]
            avg_seconds = get_avg_execution_time(recent_success_runs)

            bg_color = "#3788d8"

            recent_execution_history = reversed(recent_runs[:5])
            history_data = [
                {"state": run.state, "date": getattr(
                    run, date_attr).strftime('%d/%m/%Y %H:%M')}
                for run in recent_execution_history
            ]

            if schedule and isinstance(schedule, str) and croniter.is_valid(schedule):
                try:
                    cron = croniter(schedule, start_search)
                    for _ in range(200):
                        event_time = cron.get_next(datetime)
                        if event_time > end_search:
                            break

                        current_iso_normalized = event_time.replace(
                            tzinfo=None, microsecond=0).isoformat()
                        status = run_history.get(
                            current_iso_normalized, "no_run")
                        border_color = get_border_color(status)

                        events.append({
                            "title": dag.dag_id,
                            "start": event_time.isoformat(),
                            "end": (event_time + timedelta(seconds=avg_seconds)).isoformat(),
                            "backgroundColor": bg_color,
                            "borderColor": border_color,
                            "borderWidth": "3px",
                            "extendedProps": {
                                "status": status,
                                "cron": schedule,
                                "duration": f"{int(avg_seconds/60)}m {int(avg_seconds % 60)}s",
                                "dag_id": dag.dag_id,
                                "task_count": int(task_count),
                                "history": history_data
                            }
                        })
                except Exception:
                    continue

        try:
            template = templates.get_template("calendar_v3.html")
            html_content = template.render(
                {"request": request, "events": events})
            return HTMLResponse(content=html_content)
        except Exception as e:
            return HTMLResponse(content=f"<h1>Erro na renderização:</h1><p>{str(e)}</p>", status_code=500)
