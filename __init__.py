from airflow.plugins_manager import AirflowPlugin
from global_calendar.calendar_view import CalendarView

# Instanciando a view
v_appbuilder_view = CalendarView()
v_appbuilder_package = {
    "name": "Global Schedule",     # Nome que aparece no sub-menu
    "category": "Plugins",         # Nome que aparece no menu principal (topo)
    "view": v_appbuilder_view,
}

class GlobalSchedulePlugin(AirflowPlugin):
    name = "global_schedule"
    appbuilder_views = [v_appbuilder_package] # Isso registra a interface