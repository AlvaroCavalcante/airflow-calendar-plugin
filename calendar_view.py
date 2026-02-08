import os
from croniter import croniter
from datetime import datetime, timedelta

from flask_appbuilder import BaseView, expose
from airflow.models import DagModel, DagRun
from airflow.utils.session import provide_session
from sqlalchemy import desc

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))


class CalendarView(BaseView):
    default_view = "index"
    template_folder = os.path.join(CURRENT_DIR, 'templates')
    route_base = "/global_calendar"
    base_permissions = ['can_list', 'menu_access']

    @expose("/")
    @provide_session
    def index(self, session=None):
        # 1. Buscar todas as DAGs ativas e não pausadas
        dags = session.query(DagModel).filter(
            DagModel.is_paused == False, DagModel.is_active == True).all()

        events = []
        now = datetime.now()
        lookahead_days = 7

        for dag in dags:
            # --- NOVO: Cálculo de Duração Média/Última ---
            # Buscamos a última execução bem-sucedida para estimar a duração
            last_run = session.query(DagRun).filter(
                DagRun.dag_id == dag.dag_id,
                DagRun.state == 'success'
            ).order_by(desc(DagRun.end_date)).first()

            if last_run and last_run.end_date and last_run.start_date:
                duration_seconds = (last_run.end_date -
                                    last_run.start_date).total_seconds()
            else:
                duration_seconds = 300  # Default: 5 minutos se nunca rodou

            # Garante uma duração mínima visual de 1 minuto no calendário
            duration_seconds = max(duration_seconds, 300)
            # ---------------------------------------------

            if dag.schedule_interval and isinstance(dag.schedule_interval, str):
                try:
                    cron = croniter(dag.schedule_interval, now)
                    for _ in range(100):
                        next_run = cron.get_next(datetime)
                        if next_run > now + timedelta(days=lookahead_days):
                            break

                        # Definimos o fim do evento baseado na duração estimada
                        end_run = next_run + \
                            timedelta(seconds=duration_seconds)

                        events.append({
                            "title": dag.dag_id,
                            "start": next_run.isoformat(),
                            "end": end_run.isoformat(),  # Adicionado o campo 'end'
                            "allDay": False,
                            "description": f"Duração estimada: {int(duration_seconds/60)}min"
                        })
                except Exception:
                    continue

        return self.render_template("calendar.html", events=events)
