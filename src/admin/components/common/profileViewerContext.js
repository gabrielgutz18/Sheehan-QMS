import { createContext, useContext } from "react";

// opens a coworker's profile over any staff page (see profileViewer.jsx): openProfile({ id, name, photo, ... }) with
// what the page already has of them, shown until the rest arrives; null outside the staff area's layout
export const ProfileViewerContext = createContext(/** @type {((person: any) => void) | null} */ (null));

export const useProfileViewer = () => useContext(ProfileViewerContext);
