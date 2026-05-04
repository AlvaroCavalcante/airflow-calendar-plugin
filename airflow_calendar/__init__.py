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
        from airflow_calendar.api import app as calendar_api_app

        fastapi_apps = [{
            "app": calendar_api_app,
            "url_prefix": "/calendar",
            "name": "Airflow Calendar API"
        }]

        external_views = [{
            "name": "Calendar",
            "url_route": "airflow_calendar",
            "destination": "nav",
            "href": "/calendar/",
            "icon": "/calendar/static/calendar-days.svg",
            "icon_dark_mode": "/calendar/static/calendar-days.svg",
        }]
