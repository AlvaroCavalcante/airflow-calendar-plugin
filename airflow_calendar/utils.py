import re
import hashlib
from datetime import datetime, timedelta

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


def _utc_naive(dt):
    """Normalize any datetime to a naive UTC wall-clock (no microseconds)."""
    if dt is None:
        return None
    if getattr(dt, 'tzinfo', None) is None:
        dt = timezone.make_aware(dt, timezone.utc)
    utc_dt = timezone.convert_to_utc(dt)
    return datetime(
        utc_dt.year, utc_dt.month, utc_dt.day,
        utc_dt.hour, utc_dt.minute, utc_dt.second,
    )


def _utc_iso_z(dt):
    naive = _utc_naive(dt)
    return naive.isoformat() + 'Z'


def _resolve_dag_timezone(session, dagbag, dag):
    tz = getattr(dag, 'timezone', None)
    if tz is not None:
        return tz

    ser_dag = SerializedDagModel.get(dag.dag_id, session=session)
    if ser_dag:
        tz = getattr(ser_dag.dag, 'timezone', None)
        if tz is not None:
            return tz

    loaded_dag = dagbag.get_dag(dag.dag_id) if dagbag else None
    if loaded_dag:
        tz = getattr(loaded_dag, 'timezone', None)
        if tz is not None:
            return tz

    return timezone.utc


def _build_history_data(recent_runs, date_attr, limit=5):
    history = []
    for run in reversed(recent_runs[:limit]):
        run_date = getattr(run, date_attr, None)
        if run_date is None:
            continue
        history.append({
            "state": run.state,
            "date": _utc_iso_z(run_date),
        })
    return history


def _make_calendar_event(dag, event_time, avg_seconds, bg_color, border_color,
                         status, schedule, task_count, history_data):
    start = _utc_naive(event_time)
    return {
        "title": dag.dag_id,
        "start": start.isoformat() + 'Z',
        "end": (start + timedelta(seconds=avg_seconds)).isoformat() + 'Z',
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
                     avg_seconds, bg_color, task_count, history_data, dag_tz):
    start_utc = timezone.make_aware(cron_start, timezone.utc)
    cron_start_local = timezone.make_naive(start_utc, dag_tz)
    cron = croniter(schedule, cron_start_local)
    for _ in range(RUNS_COUNT):
        event_local = cron.get_next(datetime)
        event_aware = timezone.make_aware(event_local, dag_tz)
        event_time = _utc_naive(event_aware)
        if event_time > cron_end:
            break

        current_iso = event_time.isoformat()
        status = run_history.get(current_iso, "no_run")
        events.append(_make_calendar_event(
            dag, event_time, avg_seconds, bg_color,
            get_border_color(status), status, schedule,
            task_count, history_data,
        ))


def _timedelta_anchor_time(dag, recent_runs, date_attr):
    """Pick a reference instant to project timedelta slots (like cron uses cron_start)."""
    now_naive = _utc_naive(timezone.utcnow())

    for run in recent_runs:
        run_date = getattr(run, date_attr, None)
        if run_date is None:
            continue
        run_time = _utc_naive(run_date)
        if run_time <= now_naive:
            return run_time

    for run in reversed(recent_runs):
        run_date = getattr(run, date_attr, None)
        if run_date is None:
            continue
        # Airflow 2 may only have the next scheduled run before the first execution.
        return _utc_naive(run_date)

    next_dagrun = getattr(dag, 'next_dagrun', None)
    if next_dagrun is not None:
        return _utc_naive(next_dagrun)

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
        current_iso = _utc_naive(current_event_time).isoformat()
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

    cron_start = _utc_naive(start_search)
    cron_end = _utc_naive(end_search)
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

        run_history = {}
        for run in dag_runs:
            run_date = getattr(run, date_attr, None)
            if run_date is None:
                continue
            run_history[_utc_naive(run_date).isoformat()] = run.state

        recent_runs = session.query(DagRun).filter(
            DagRun.dag_id == dag.dag_id,
            date_col.isnot(None),
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
                dag_tz = _resolve_dag_timezone(session, dagbag, dag)
                _add_cron_events(
                    events, dag, schedule, cron_start, cron_end,
                    run_history, avg_seconds, bg_color,
                    task_count, history_data, dag_tz,
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
