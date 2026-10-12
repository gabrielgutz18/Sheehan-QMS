// the call dialog starts with the last remarks used on this computer, since staff usually call to the same window
const LAST_REMARKS_KEY = "admin.lastRemarks";

export const readLastRemarks = () => {
    try {
        return localStorage.getItem(LAST_REMARKS_KEY) ?? "";
    } catch {
        return "";
    }
};

export const saveLastRemarks = (remarks) => {
    try {
        localStorage.setItem(LAST_REMARKS_KEY, remarks);
    } catch {
        // storage blocked; the dialog just starts empty next time
    }
};
