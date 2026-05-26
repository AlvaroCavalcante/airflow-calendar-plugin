import re
import hashlib
from datetime import datetime, timedelta, timezone as dt_timezone

from croniter import croniter
from sqlalchemy import desc

from airflow.models import DagRun
from airflow.models.serialized_dag import SerializedDagModel
from airflow.utils import timezone

from airflow_calendar.dag_colors import get_dag_color, load_dag_colors

IGNORED_DAGS = ["airflow_monitoring"]
RUNS_COUNT = 5000


def parse_timedelta_schedule(schedule):
    """
    Return a timedelta if schedule is a timedelta object or a timedelta string
    like '1 day, 6:00:00' or '30:00:00'. Returns None otherwise.
    """
    if isinstance(schedule, timedelta):
        return schedule

    if not isinstance(schedule, str):
        return None

    cleaned_schedule = schedule.strip()

    match_with_days = re.match(
        r'^(\d+)\s+days?,\s*(\d+):(\d+):(\d+)$', cleaned_schedule)
    if match_with_days:
        days = int(match_with_days.group(1))
        hours = int(match_with_days.group(2))
        minutes = int(match_with_days.group(3))
        seconds = int(match_with_days.group(4))
        return timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)

    match_time_only = re.match(r'^(\d+):(\d+):(\d+)$', cleaned_schedule)
    if match_time_only:
        hours = int(match_time_only.group(1))
        minutes = int(match_time_only.group(2))
        seconds = int(match_time_only.group(3))
        parsed_timedelta = timedelta(
            hours=hours, minutes=minutes, seconds=seconds)
        if parsed_timedelta.total_seconds() > 0:
            return parsed_timedelta

    return None


def get_color_from_tag(tag_name):
    hash_object = hashlib.md5(tag_name.encode())
    return "#" + hash_object.hexdigest()[:6]


def get_border_color(status):
    if status == 'success':
        return "#28a745"
    if status == 'failed':
        return "#dc3545"
    if status == 'running':
        return "#017cee"
    return "#808080"


def get_avg_execution_time(recent_success_runs):
    default_avg_seconds = 300
    if recent_success_runs:
        durations = [(run.end_date - run.start_date).total_seconds()
                     for run in recent_success_runs if run.start_date]
        if durations:
            return max((sum(durations) / len(durations)), default_avg_seconds)
    return default_avg_seconds


def get_schedule_info(dag):
    schedule = getattr(dag, 'schedule_interval', None)
    if schedule is None:
        schedule = getattr(dag, 'timetable_summary', None)
    if schedule is None and hasattr(dag, 'schedule'):
        schedule = dag.schedule
    return schedule


def get_dag_task_count(session, dagbag, dag):
    ser_dag = SerializedDagModel.get(dag.dag_id, session=session)
    if ser_dag:
        return len(ser_dag.dag.tasks)
    loaded_dag = dagbag.get_dag(dag.dag_id)
    return len(loaded_dag.tasks) if loaded_dag else 0


def _format_duration(avg_seconds):
    return f"{int(avg_seconds / 60)}m {int(avg_seconds % 60)}s"


def _build_history_data(recent_runs, date_attr, limit=5):
    return [
        {
            "state": run.state,
            "date": getattr(run, date_attr).strftime('%d/%m/%Y %H:%M'),
        }
        for run in reversed(recent_runs[:limit])
    ]


def _make_calendar_event(dag, event_time, avg_seconds, bg_color, border_color,
                         status, schedule, task_count, history_data):
    return {
        "title": dag.dag_id,
        "start": event_time.isoformat() + 'Z',
        "end": (event_time + timedelta(seconds=avg_seconds)).isoformat() + 'Z',
        "backgroundColor": bg_color,
        "borderColor": border_color,
        "borderWidth": "3px",
        "extendedProps": {
            "status": status,
            "cron": schedule if isinstance(schedule, str) else str(schedule),
            "duration": _format_duration(avg_seconds),
            "dag_id": dag.dag_id,
            "task_count": int(task_count),
            "history": history_data,
        },
    }


def _add_cron_events(events, dag, schedule, cron_start, cron_end, run_history,
                     avg_seconds, bg_color, task_count, history_data):
    cron = croniter(schedule, cron_start)
    for _ in range(RUNS_COUNT):
        event_time = cron.get_next(datetime)
        if event_time > cron_end:
            break

        current_iso = event_time.replace(microsecond=0).isoformat()
        status = run_history.get(current_iso, "no_run")
        events.append(_make_calendar_event(
            dag, event_time, avg_seconds, bg_color,
            get_border_color(status), status, schedule,
            task_count, history_data,
        ))


def _timedelta_anchor_time(dag, recent_runs, date_attr):
    """Pick a reference instant to project timedelta slots (like cron uses cron_start)."""
    now_naive = datetime.now(dt_timezone.utc).replace(tzinfo=None)

    for run in recent_runs:
        run_time = getattr(run, date_attr).replace(tzinfo=None)
        if run_time <= now_naive:
            return run_time

    if recent_runs:
        # Airflow 2 may only have the next scheduled run before the first execution.
        return getattr(recent_runs[-1], date_attr).replace(tzinfo=None)

    next_dagrun = getattr(dag, 'next_dagrun', None)
    if next_dagrun is not None:
        return next_dagrun.replace(tzinfo=None)

    return None


def _add_timedelta_events(events, dag, schedule, schedule_delta, recent_runs,
                          date_attr, cron_start, cron_end, run_history,
                          avg_seconds, bg_color, task_count, history_data):

    anchor_time = _timedelta_anchor_time(dag, recent_runs, date_attr)
    if anchor_time is None:
        return
    current_event_time = anchor_time
    while current_event_time >= cron_start:
        current_event_time -= schedule_delta
    current_event_time += schedule_delta

    rendered_count = 0
    while current_event_time <= cron_end and rendered_count < RUNS_COUNT:
        current_iso = current_event_time.replace(microsecond=0).isoformat()
        status = run_history.get(current_iso, "no_run")
        events.append(_make_calendar_event(
            dag, current_event_time, avg_seconds, bg_color,
            get_border_color(status), status, schedule,
            task_count, history_data,
        ))
        current_event_time += schedule_delta
        rendered_count += 1


def build_calendar_events(session, dags, dagbag, date_col, date_attr):
    events = []
    now = timezone.utcnow()
    start_search = now - timedelta(days=7)
    end_search = now + timedelta(days=7)

    cron_start = start_search.replace(tzinfo=None)
    cron_end = end_search.replace(tzinfo=None)
    dag_colors = load_dag_colors()

    for dag in dags:
        if dag.dag_id in IGNORED_DAGS:
            continue

        task_count = get_dag_task_count(session, dagbag, dag)
        schedule = get_schedule_info(dag)

        dag_runs = session.query(DagRun).filter(
            DagRun.dag_id == dag.dag_id,
            date_col >= start_search,
            date_col <= end_search,
        ).all()

        run_history = {
            getattr(run, date_attr).replace(tzinfo=None, microsecond=0).isoformat(): run.state
            for run in dag_runs
        }

        recent_runs = session.query(DagRun).filter(
            DagRun.dag_id == dag.dag_id,
        ).order_by(desc(date_col)).limit(15).all()

        recent_success_runs = [
            run for run in recent_runs
            if run.state == 'success' and run.end_date
        ][:5]
        avg_seconds = get_avg_execution_time(recent_success_runs)
        history_data = _build_history_data(recent_runs, date_attr)
        bg_color = get_dag_color(dag.dag_id, dag_colors)

        if schedule and isinstance(schedule, str) and croniter.is_valid(schedule):
            try:
                _add_cron_events(
                    events, dag, schedule, cron_start, cron_end,
                    run_history, avg_seconds, bg_color,
                    task_count, history_data,
                )
            except Exception:
                continue
        else:
            schedule_delta = parse_timedelta_schedule(schedule)
            if schedule_delta:
                try:
                    _add_timedelta_events(
                        events, dag, schedule, schedule_delta, recent_runs,
                        date_attr, cron_start, cron_end, run_history,
                        avg_seconds, bg_color, task_count, history_data,
                    )
                except Exception:
                    continue

    return events
