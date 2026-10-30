import { useEffect, useState } from 'react';

import { listDevelopers } from '../../api/chatController.js';
import { seenAgo } from '../../data/lastSeen.js';
import Avatar from '../common/avatar.jsx';

// who's online changes as developers come and go, so it checks again now and then
const REFRESH_MS = 15000;

// the developer team as a row of chat heads, a green dot on each one online, online ones first
// meId: the signed-in developer, marked You on the Chat page
export default function DeveloperHeads({ meId }) {
    const [team, setTeam] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        // a failed check keeps the heads it has; they're a help, not the page
        const load = () => listDevelopers({ signal }).then(setTeam).catch(() => {});
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    if (!team) return null;
    const online = team.filter((d) => d.online).length;

    return (
        <div className="chat-heads">
            <p className="chat-heads-summary" role="status">
                {team.length === 0
                    ? "No developer accounts yet."
                    : online === 0 && meId === undefined
                        ? "No developer is online right now. They'll see your message when they're back."
                        : `${online} of ${team.length} developer${team.length === 1 ? "" : "s"} online`}
            </p>
            {team.length > 0 && (
                <ul className="chat-heads-list">
                    {team.map((d) => (
                        <li key={d.id} className={`chat-head${d.online ? " is-online" : ""}`}>
                            <span className={`chat-head-photo${d.online ? " is-online" : ""}`}>
                                <Avatar account={d} size={40} />
                                <span className="chat-head-dot" aria-hidden="true" />
                            </span>
                            <span className="chat-head-name">{d.id === meId ? "You" : d.firstName || d.name}</span>
                            <span className="chat-head-status">
                                {d.online ? "Online" : seenAgo(d.lastSeen)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
