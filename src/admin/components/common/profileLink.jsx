import { useProfileViewer } from "./profileViewerContext.js";

// someone's photo and name, made into a button that opens their profile (profileViewer.jsx); the pointer turns into a
// hand over it, and it says whose profile it opens to screen readers; outside the staff layout it's just what it wraps
// person: { id, name, ... }; className: the look of what it wraps, e.g. "charge-person"; photo: a photo beside a name that's
// a ProfileLink too, clickable but left to the name for the keyboard and screen readers
/** @param {{ person: { id: number, name: string }, className?: string, photo?: boolean, children: import('react').ReactNode }} props */
export default function ProfileLink({ person, className = "", photo = false, children }) {
    const openProfile = useProfileViewer();
    if (!openProfile || !person?.id) return <span className={className}>{children}</span>;

    return (
        <button
            type="button"
            className={`profile-link${className ? ` ${className}` : ""}`}
            aria-label={`View ${person.name}'s profile`}
            title="View profile"
            onClick={() => openProfile(person)}
            {...(photo && { tabIndex: -1, "aria-hidden": true })}
        >
            {children}
        </button>
    );
}
