from airflow.plugins_manager import AirflowPlugin
from my_calendar_plugin.calendar_view import CalendarView

v_appbuilder_view = CalendarView()
v_appbuilder_package = {
    "name": "Global Schedule",
    "category": "Plugins", # Ele aparecerá no menu 'Plugins'
    "view": v_appbuilder_view
}

class AirflowCalendarPlugin(AirflowPlugin):
    name = "global_calendar"
    appbuilder_views = [v_appbuilder_package]