import { useEffect, useState } from 'react';

// counts down from `seconds` once mounted and calls onDone at zero (or right away on Skip)
// remount it (e.g. with a new key) to start over
export default function Countdown({ seconds, onDone, label = "Starting a new order in" }) {
    const [left, setLeft] = useState(seconds);

    useEffect(() => {
        // measure against a deadline so a slow or throttled tab doesn't drift
        const deadline = Date.now() + seconds * 1000;
        const id = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setLeft(remaining);
            if (remaining === 0) {
                clearInterval(id);
                onDone();
            }
        }, 250);
        return () => clearInterval(id);
    }, [seconds, onDone]);

    return (
        <p className="countdown">
            {label} <strong>{left}s</strong>
            {/* an <a> so it reads as a quiet text link, not another big button */}
            <a
                href="#"
                className="countdown-skip"
                onClick={(e) => {
                    e.preventDefault();
                    onDone();
                }}
            >
                Skip
            </a>
        </p>
    );
}
