//func
import { useEffect, useState } from 'react';
import '../style/clock.css';

const timeFormat = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const dateFormat = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

export default function Clock() {
    const [now, setNow] = useState(() => new Date());

    // tick every second; clear the timer when the component unmounts
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <time className="clock" dateTime={now.toISOString()}>
            <span className="clock-time">{now.toLocaleTimeString(undefined, timeFormat)}</span>
            <span className="clock-date">{now.toLocaleDateString(undefined, dateFormat)}</span>
        </time>
    );
}
