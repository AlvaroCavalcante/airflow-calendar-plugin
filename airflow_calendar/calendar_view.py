import os

from flask import jsonify, request, send_from_directory
from flask_appbuilder import BaseView, expose
from airflow.models import DagModel, DagRun
from airflow.models.dagbag import DagBag
from airflow.utils.session import provide_session

from airflow_calendar.dag_colors import load_dag_colors, save_dag_color
from airflow_calendar.utils import build_calendar_events


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))


class CalendarView(BaseView):
    default_view = "index"
    template_folder = os.path.join(CURRENT_DIR, 'templates')
    route_base = "/airflow_calendar"
    base_permissions = ['can_list', 'menu_access']

    @expose("/static/<path:filename>")
    def serve_static(self, filename):
        return send_from_directory(
            os.path.join(CURRENT_DIR, 'static'), filename)

    @expose("/api/colors")
    def get_colors(self):
        return jsonify(load_dag_colors())

    @expose("/api/colors/<dag_id>", methods=["PUT"])
    def set_color(self, dag_id):
        payload = request.get_json(silent=True) or {}
        try:
            color = save_dag_color(dag_id, payload.get('color', ''))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"dag_id": dag_id, "color": color})

    @expose("/")
    @provide_session
    def index(self, session=None):
        date_col = DagRun.execution_date
        date_attr = 'execution_date'

        query = session.query(DagModel).filter(DagModel.is_paused == False)
        if hasattr(DagModel, 'is_active'):
            query = query.filter(DagModel.is_active == True)

        dags = query.all()
        dagbag = DagBag(read_dags_from_db=True)
        events = build_calendar_events(
            session, dags, dagbag, date_col, date_attr)

        return self.render_template(
            "calendar.html",
            events=events,
            colors_api_base="/airflow_calendar/api/colors",
            static_base="/airflow_calendar/static",
        )
