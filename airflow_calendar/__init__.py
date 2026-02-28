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
            "name": "calendar_api"
        }]

        react_apps = [{
            "name": "Calendar",
            "bundle_url": "/calendar/static/airflow_calendar/calendar_bundle.iife.js",
            "url_route": "calendar" 
        }]

        appbuilder_menu_items = [{
            "name": "Calendar",
            "category": "Browse",
            "href": "/plugins/calendar",
            "label": "Calendar"
        }]
