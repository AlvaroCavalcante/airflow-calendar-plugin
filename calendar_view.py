import os
import hashlib
from croniter import croniter
from datetime import datetime, timedelta

from flask_appbuilder import BaseView, expose
from airflow.models import DagModel, DagRun, DagTag
from airflow.utils.session import provide_session
from airflow.utils import timezone

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))


class CalendarView(BaseView):
    default_view = "index"
    template_folder = os.path.join(CURRENT_DIR, 'templates')
    route_base = "/global_calendar"
    base_permissions = ['can_list', 'menu_access']

    def _get_color_from_tag(self, tag_name):
        hash_object = hashlib.md5(tag_name.encode())
        return "#" + hash_object.hexdigest()[:6]

    @expose("/")
    @provide_session
    def index(self, session=None):
        dags = session.query(DagModel).filter(
            DagModel.is_paused == False, DagModel.is_active == True).all()

        events = []
        now = timezone.utcnow()

        lookback_days = 7
        lookahead_days = 7
        start_search = now - timedelta(days=lookback_days)
        end_search = now + timedelta(days=lookahead_days)

        for dag in dags:
            dag_runs = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id,
                DagRun.execution_date >= start_search,
                DagRun.execution_date <= end_search
            ).all()

            run_history = {
                run.execution_date.isoformat(): run.state for run in dag_runs}

            tags = session.query(DagTag).filter(
                DagTag.dag_id == dag.dag_id).all()

            bg_color = self._get_color_from_tag(
                tags[0].name) if tags else "#3788d8"

            if dag.schedule_interval and isinstance(dag.schedule_interval, str):
                try:
                    cron = croniter(dag.schedule_interval, start_search)

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
                            "end": (event_time + timedelta(minutes=10)).isoformat(),
                            "backgroundColor": bg_color,
                            "borderColor": border_color,
                            "borderWidth": "3px",
                            "extendedProps": {
                                "status": status
                            }
                        })
                except Exception:
                    continue

        return self.render_template("calendar.html", events=events)
