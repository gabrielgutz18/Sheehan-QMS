import { useState } from "react";

import StaffProfileDialog from "../chat/staffProfileDialog.jsx";
import { ProfileViewerContext } from "./profileViewerContext.js";

// the profile window SheeChat has, for every staff page: a photo or name in a ProfileLink opens that person's profile
// over whatever page it's on (the Dashboard's In charge list, Accounts, the Crew tab, the developer chats)
export default function ProfileViewer({ children }) {
    const [person, setPerson] = useState(null);

    return (
        <ProfileViewerContext.Provider value={setPerson}>
            {children}
            {person && (
                // keyed by who it's for, so each one fetches its own
                <StaffProfileDialog key={person.id} person={person} onClose={() => setPerson(null)} />
            )}
        </ProfileViewerContext.Provider>
    );
}
