import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventClickArg } from '@fullcalendar/core';

const CalendarComponent: React.FC = () => {
    const [events, setEvents] = useState([]);

    useEffect(() => {
        fetch('/calendar/events')
            .then(response => response.json())
            .then(data => setEvents(data))
            .catch(err => console.error("Erro ao carregar eventos:", err));
    }, []);

    const handleEventClick = (info: EventClickArg) => {
        const dagId = info.event.extendedProps.dag_id;

        if (window.top) {
            window.top.location.href = `/dags/${dagId}`;
        } else {
            window.location.href = `/dags/${dagId}`;
        }
    };

    return (
        <div style={{ padding: '20px', background: 'white' }}>
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