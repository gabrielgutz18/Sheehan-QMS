import { useEffect, useState } from "react";

import { getLoadingCrew } from "../../api/loadingController.js";
import { seenAgo } from "../../data/lastSeen.js";
import CrewAreaTabs from "../accounts/crewAreaTabs.jsx";
import Avatar from "../common/avatar.jsx";

// who's online keeps changing, so the crew refreshes while the tab is open
const REFRESH_MS = 30000;

// the Loading page's Crew tab, for the loading crew and admins: everyone on the crew, grouped by the area an admin set
// them to on Accounts, Roofings, Steel and Logistics, as the same browser-style tabs Accounts has; it opens on your own
// area; the crew is still one shared line, so this only shows who works where and who's in today
export default function LoadingCrew() {
    const [crew, setCrew] = useState(/** @type {any[] | null} */ (null));
    const [error, setError] = useState("");
    // "all", one of the crew's areas, or "" for the ones not assigned yet; null until the crew first loads, so it can
    // open on your own area
    const [area, setArea] = useState(/** @type {string | null} */ (null));

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        // only the first load reports errors; a failed refresh keeps the crew it has
        const load = (quiet) =>
            getLoadingCrew({ signal })
                .then((list) => {
                    setCrew(list);
                    setError("");
                })
                .catch((err) => !quiet && !signal.aborted && setError(err.message));

        load(false);
        const id = setInterval(() => load(true), REFRESH_MS);
        return () => {
            clearInterval(id);
            controller.abort();
        };
    }, []);

    if (error) {
        return (
            <p className="field-error" role="alert">
                {error}
            </p>
        );
    }
    if (!crew) return <p className="admin-empty">Loading...</p>;

    const mine = crew.find((member) => member.you)?.loadingArea;
    const picked = area ?? (mine || "all");
    // a tab whose last member moved goes back to All loading
    const shownArea = picked === "all" || crew.some((member) => member.loadingArea === picked) ? picked : "all";
    const shown = shownArea === "all" ? crew : crew.filter((member) => member.loadingArea === shownArea);
    const online = shown.filter((member) => member.online).length;

    return (
        <div className="loading-crew">
            <CrewAreaTabs accounts={crew} value={shownArea} onChange={setArea} />
            <section className="admin-panel" aria-labelledby="crew-title">
                <div className="employee-grid-head">
                    <h2 id="crew-title">{shownArea === "all" ? "Loading crew" : shownArea || "Not assigned"}</h2>
                    <span className="video-hint">
                        {online} of {shown.length} online
                    </span>
                </div>
                {shown.length === 0 ? (
                    <p className="admin-empty">No one on the loading crew yet.</p>
                ) : (
                    <ul className="employee-grid">
                        {shown.map((member) => (
                            <li key={member.id}>
                                <article className="profile-card" aria-label={member.name}>
                                    <Avatar account={member} size={72} />
                                    <h3 className="profile-card-name">
                                        {member.name}
                                        {member.you && <span className="profile-card-you"> (you)</span>}
                                    </h3>
                                    <p className={`profile-card-dept${member.loadingArea ? "" : " is-empty"}`}>
                                        {member.loadingArea || "Not assigned"}
                                    </p>
                                    <span
                                        className={`availability availability--${member.online ? "active" : "offline"}`}
                                    >
                                        {member.online ? "Online" : seenAgo(member.lastSeen)}
                                    </span>
                                </article>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
