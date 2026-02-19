from airflow.plugins_manager import AirflowPlugin
from airflow import __version__ as airflow_version

IS_AIRFLOW_3 = airflow_version.startswith('3')


class GlobalSchedulePlugin(AirflowPlugin):
    name = "airflow_calendar"

    if not IS_AIRFLOW_3:
        from airflow_calendar.calendar_view import CalendarView
        appbuilder_views = [{
            "name": "Calendar",
            "category": "Browse",
            "view": CalendarView()
        }]
    else:
        from airflow_calendar.api import router

        fastapi_apps = [{
            "router": router,
            "url_prefix": "/calendar",
            "name": "Calendar API"
        }]

        ui_components = [{
            "name": "Calendar",
            "component": "CalendarComponent",
            "path": "/static/airflow_calendar/calendar_bundle.js",
        }]
