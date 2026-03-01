import os
import hashlib
from croniter import croniter
from datetime import datetime, timedelta

from flask_appbuilder import BaseView, expose
from airflow import __version__ as airflow_version
from sqlalchemy import and_, desc
from airflow.models import DagModel, DagRun
from airflow.models.dagbag import DagBag
from airflow.models.serialized_dag import SerializedDagModel
from airflow.utils.session import provide_session
from airflow.utils import timezone

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

IS_AIRFLOW_3 = airflow_version.startswith('3')
IGNORED_DAGS = ["airflow_monitoring"]


class CalendarView(BaseView):
    default_view = "index"
    template_folder = os.path.join(CURRENT_DIR, 'templates')
    route_base = "/airflow_calendar"
    base_permissions = ['can_list', 'menu_access']

    def _get_color_from_tag(self, tag_name):
        hash_object = hashlib.md5(tag_name.encode())
        return "#" + hash_object.hexdigest()[:6]

    @expose("/")
    @provide_session
    def index(self, session=None):
        if IS_AIRFLOW_3:
            date_col = DagRun.logical_date
            date_attr = 'logical_date'
        else:
            date_col = DagRun.execution_date
            date_attr = 'execution_date'

        query = session.query(DagModel).filter(DagModel.is_paused == False)
        if hasattr(DagModel, 'is_active'):
            query = query.filter(DagModel.is_active == True)

        dags = query.all()
        dagbag = DagBag(read_dags_from_db=True)

        events = []
        now = timezone.utcnow()
        start_search = now - timedelta(days=7)
        end_search = now + timedelta(days=7)

        for dag in dags:
            if dag.dag_id in IGNORED_DAGS:
                continue

            task_count = self.get_dag_task_count(session, dagbag, dag)
            schedule = self.get_schedule_info(dag)

            dag_runs = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id,
                date_col >= start_search,
                date_col <= end_search
            ).all()

            run_history = {
                getattr(run, date_attr).isoformat(): run.state for run in dag_runs
            }

            recent_runs = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id
            ).order_by(desc(date_col)).limit(15).all()

            recent_success_runs = [
                run for run in recent_runs if run.state == 'success' and run.end_date][:5]
            avg_seconds = self.get_avg_execution_time(recent_success_runs)

            bg_color = "#3788d8"
            # if hasattr(dag, 'tags') and dag.tags:
            #     tag_name = dag.tags[0].name if hasattr(
            #         dag.tags[0], 'name') else str(dag.tags[0])
            #     bg_color = self._get_color_from_tag(tag_name)

            recent_execution_history = reversed(recent_runs[:5])

            history_data = []
            for run in recent_execution_history:
                exec_date = getattr(run, date_attr)

                history_data.append({
                    "state": run.state,
                    "date": exec_date.strftime('%d/%m/%Y %H:%M')
                })

            if schedule and isinstance(schedule, str) and croniter.is_valid(schedule):
                try:
                    cron = croniter(schedule, start_search)

                    for _ in range(200):
                        event_time = cron.get_next(datetime)

                        if event_time > end_search:
                            break

                        current_iso = event_time.isoformat()
                        status = run_history.get(current_iso, "no_run")

                        border_color = "#808080"
                        if event_time <= now:
                            if status == 'success':
                                border_color = "#28a745"
                            elif status == 'failed':
                                border_color = "#dc3545"

                        events.append({
                            "title": dag.dag_id,
                            "start": current_iso,
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

        return self.render_template("calendar.html", events=events)

    def get_avg_execution_time(self, recent_success_runs):
        avg_seconds = 300
        if recent_success_runs:
            durations = [(run.end_date - run.start_date).total_seconds()
                         for run in recent_success_runs if run.start_date]
            if durations:
                avg_seconds = sum(durations) / len(durations)

        avg_seconds = max(avg_seconds, 300)
        return avg_seconds

    def get_schedule_info(self, dag):
        schedule = getattr(dag, 'schedule_interval', None)
        if schedule is None:
            schedule = getattr(dag, 'timetable_summary', None)

        if schedule is None and hasattr(dag, 'schedule'):
            schedule = dag.schedule
        return schedule

    def get_dag_task_count(self, session, dagbag, dag):
        ser_dag = SerializedDagModel.get(dag.dag_id, session=session)
        if ser_dag:
            task_count = len(ser_dag.dag.tasks)
        else:
            loaded_dag = dagbag.get_dag(dag.dag_id)
            task_count = len(loaded_dag.tasks) if loaded_dag else 0
        return task_count
