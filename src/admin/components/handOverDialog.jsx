import { useEffect, useRef, useState } from 'react';

import { teamsOf } from '../data/loadingTeams.js';
import formatQueueNum from '../../data/queueNum.js';
import { splitList } from '../../data/list.js';
import teams from '../../data/teams.js';

const teamNames = teams.map((t) => t.name);

// the order's own teams from Customer order, or if it has none, the teams named like its types of order
// (a Roofings and Steel order goes to both)
const startingTeams = (order) => {
    const picked = teamsOf(order);
    if (picked.length) return picked;
    const types = splitList(order.purpose);
    return teamNames.filter((name) => types.includes(name));
};

// modal for handing the customer a sales counter is serving over to the loading crews; the teams can be changed
// here before handing over, and at least one is needed
export default function HandOverDialog({ order, busy, error, onHandOver, onClose }) {
    const dialogRef = useRef(null);
    const [picked, setPicked] = useState(() => startingTeams(order));

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog.open) dialog.showModal();
    }, []);

    // kept in the list's order, whatever order they're ticked in
    const toggle = (name) =>
        setPicked((prev) => teamNames.filter((n) => (n === name ? !prev.includes(n) : prev.includes(n))));

    const submit = (e) => {
        e.preventDefault();
        onHandOver(picked);
    };

    return (
        <dialog
            ref={dialogRef}
            className="admin-dialog"
            aria-labelledby="handover-title"
            onClose={onClose}
            // don't let Esc close it halfway through
            onCancel={(e) => busy && e.preventDefault()}
        >
            <form className="admin-dialog-body" onSubmit={submit}>
                <h2 id="handover-title" className="admin-dialog-title">
                    Hand over <strong>{formatQueueNum(order.queueNum, order.purpose)}</strong> to loading
                </h2>
                <p className="admin-dialog-sub">{order.name} · {order.purpose}</p>

                <fieldset className="handover-teams">
                    <legend>Loading teams</legend>
                    {teamNames.map((name) => (
                        <label key={name} className="sale-check">
                            <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} />
                            {name}
                        </label>
                    ))}
                </fieldset>

                <p className="admin-dialog-hint">
                    The customer waits in line for each team on the Loading page, and counts as a customer you served.
                </p>

                {error && <p className="field-error" role="alert">{error}</p>}

                <div className="admin-dialog-actions">
                    <button type="button" className="admin-btn" onClick={() => dialogRef.current.close()} disabled={busy}>
                        Cancel
                    </button>
                    <button type="submit" className="admin-btn admin-btn-primary" disabled={busy || picked.length === 0}>
                        {busy ? "Handing over..." : picked.length ? `Hand over to ${picked.join(", ")}` : "Pick a team"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
