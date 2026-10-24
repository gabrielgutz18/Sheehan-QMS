import { useCallback, useSyncExternalStore } from 'react';

// whether a media query matches, e.g. "(min-width: 1280px)", kept up to date as the window is resized
export default function useMediaQuery(query) {
    const subscribe = useCallback((onChange) => {
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
    }, [query]);

    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
