import { useState } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "../../auth/authContext.js";
import StaffProfileDialog from "../chat/staffProfileDialog.jsx";
import { ProfileViewerContext } from "./profileViewerContext.js";

// SheeChat's Staff tab, where anyone chats with anyone on the staff, one conversation per person
const SHEECHAT = "/staff/sheechat?tab=staff";

// the profile window SheeChat has, for every staff page: a photo or name in a ProfileLink opens that person's profile
// over whatever page it's on (the Dashboard's In charge list, Accounts, the Crew tab, the developer chats); Send a
// message opens your conversation with them on SheeChat, the way a message pop-up does (not on your own profile)
export default function ProfileViewer({ children }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [person, setPerson] = useState(null);

    return (
        <ProfileViewerContext.Provider value={setPerson}>
            {children}
            {person && (
                // keyed by who it's for, so each one fetches its own
                <StaffProfileDialog
                    key={person.id}
                    person={person}
                    onClose={() => setPerson(null)}
                    onMessage={
                        person.id === user?.id
                            ? null
                            : (who) => {
                                  setPerson(null);
                                  navigate(SHEECHAT, { state: { open: who } });
                              }
                    }
                />
            )}
        </ProfileViewerContext.Provider>
    );
}
