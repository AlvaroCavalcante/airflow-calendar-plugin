from airflow.plugins_manager import AirflowPlugin
from airflow_calendar.calendar_view import CalendarView

# Instanciando a view
v_appbuilder_view = CalendarView()
v_appbuilder_package = {
    "name": "Airflow Calendar",
    "category": "Browse",
    "view": v_appbuilder_view,
}

class GlobalSchedulePlugin(AirflowPlugin):
    name = "airflow_calendar"
    appbuilder_views = [v_appbuilder_package]