import os
from flask_appbuilder import BaseView, expose
from airflow.models import DagModel
from airflow.utils.session import provide_session
from croniter import croniter
from datetime import datetime, timedelta

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

class CalendarView(BaseView):
    default_view = "index"
    template_folder = os.path.join(CURRENT_DIR, 'templates')
    route_base = "/global_calendar"
    base_permissions = ['can_list', 'menu_access']

    @expose("/")
    @provide_session
    def index(self, session=None):
        # 1. Buscar todas as DAGs ativas e que não estão pausadas
        dags = session.query(DagModel).filter(DagModel.is_paused == False, DagModel.is_active == True).all()
        
        events = []
        now = datetime.now()
        lookahead_days = 7 # Quantos dias para frente você quer ver

        for dag in dags:
            if dag.schedule_interval and isinstance(dag.schedule_interval, str):
                try:
                    cron = croniter(dag.schedule_interval, now)
                    # Gerar as próximas execuções no período
                    for _ in range(100): # Limite de iterações por DAG
                        next_run = cron.get_next(datetime)
                        if next_run > now + timedelta(days=lookahead_days):
                            break
                        events.append({
                            "title": dag.dag_id,
                            "start": next_run.isoformat(),
                            "allDay": False
                        })
                except Exception:
                    continue # Pula DAGs com schedules complexos (ex: datasets)

        return self.render_template("calendar.html", events=events)
