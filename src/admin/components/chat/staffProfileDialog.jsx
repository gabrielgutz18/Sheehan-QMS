import { useEffect, useRef, useState } from "react";

import { getSheeChatProfile } from "../../api/sheechatController.js";
import { ROLE_LABELS } from "../../auth/roles.js";
import { seenAgo } from "../../data/lastSeen.js";
import ProfileCover from "../accounts/profileCover.jsx";
import Avatar from "../common/avatar.jsx";

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

// a coworker's profile opened over SheeChat: their cover photo, photo, name, whether they're on, and the details they
// keep on My account; a detail they haven't filled in is left out
// person: who it's for, as the list has them, shown until the rest arrives
// onMessage: opens a conversation with them, or null when theirs is already open; onClose: once it's closed
export default function StaffProfileDialog({ person, onMessage = null, onClose }) {
    const dialogRef = useRef(null);
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState("");
    const shown = profile ?? person;

    useEffect(() => {
        if (!dialogRef.current.open) dialogRef.current.showModal();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const { signal } = controller;
        getSheeChatProfile(person.id, { signal })
            .then(setProfile)
            .catch((err) => !signal.aborted && setError(err.message));
        return () => controller.abort();
    }, [person.id]);

    const facts = profile
        ? [
              { label: "Role", value: ROLE_LABELS[profile.role] ?? profile.role },
              { label: "Department", value: profile.department },
              { label: "Sales team", value: profile.team },
              { label: "Joined on", value: profile.createdAt && dayFormat.format(new Date(profile.createdAt)) },
          ].filter(({ value }) => value)
        : [];

    return (
        <dialog
            ref={dialogRef}
            className="staff-profile"
            aria-label={`${person.name}'s profile`}
            onClose={onClose}
            // a click on the dark area around the card closes it; clicks inside the card don't
            onClick={(e) => e.target === e.currentTarget && dialogRef.current.close()}
        >
            <div className="staff-profile-card">
                <ProfileCover account={shown}>
                    <button
                        type="button"
                        className="profile-summary-edit staff-profile-close"
                        aria-label="Close"
                        onClick={() => dialogRef.current.close()}
                        autoFocus
                    >
                        ✕
                    </button>
                </ProfileCover>
                <div className="profile-summary-body">
                    <Avatar account={shown} size={72} />
                    <h2 className="profile-summary-name">{shown.name}</h2>
                    {profile && (
                        <p className="profile-summary-username">
                            {profile.disabled
                                ? "Account switched off"
                                : profile.online
                                  ? "Online"
                                  : // someone who has never signed in has no time to show, so seenAgo says "Offline"
                                    profile.lastSeen === null
                                    ? seenAgo(profile.lastSeen)
                                    : `Last on ${seenAgo(profile.lastSeen)}`}
                        </p>
                    )}
                    {error && (
                        <p className="field-error" role="alert">
                            {error}
                        </p>
                    )}
                    {!profile && !error && <p className="admin-empty">Loading...</p>}
                    {facts.length > 0 && (
                        <dl className="profile-summary-facts">
                            {facts.map(({ label, value }) => (
                                <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {onMessage && !shown.disabled && (
                        <button
                            type="button"
                            className="admin-btn admin-btn-primary staff-profile-message"
                            onClick={onMessage}
                        >
                            Send a message
                        </button>
                    )}
                </div>
            </div>
        </dialog>
    );
}
