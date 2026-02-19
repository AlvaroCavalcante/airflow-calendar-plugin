// airflow_calendar/ui/CalendarComponent.tsx
import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const CalendarComponent = () => {
    const [events, setEvents] = useState([]);

    useEffect(() => {
        fetch('/calendar/events')
            .then(response => response.json())
            .then(data => setEvents(data))
            .catch(err => console.error("Erro ao carregar eventos:", err));
    }, []);

    const handleEventClick = (info) => {
        const dagId = info.event.extendedProps.dag_id;
        window.top.location.href = `/dags/${dagId}`;
    };

    return (
        <div style={{ padding: '20px', background: 'var(--canvas-default)' }}>
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                events={events}
                eventClick={handleEventClick}
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek'
                }}
                height="auto"
            />
        </div>
    );
};

export default CalendarComponent;