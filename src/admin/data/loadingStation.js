// the station a Loading page works, remembered on this computer since each station's tablet stays at it: one of the
// department's areas (Roofings, Steel, TBA), or "" for all of them
const stationKey = (department) => `admin.station.${department}`;

export const readStation = (department) => {
    try {
        return localStorage.getItem(stationKey(department)) ?? "";
    } catch {
        return "";
    }
};

export const saveStation = (department, station) => {
    try {
        localStorage.setItem(stationKey(department), station);
    } catch {
        // storage blocked; the page just starts on all stations next time
    }
};
