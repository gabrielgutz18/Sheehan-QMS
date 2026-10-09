import http from './http.js';

// public queue board: { serving: [{ queueNum, name, purpose }], upcoming: [...same] }
// serving is most recently called first; upcoming is in queue order
export const getQueue = (options) => http.get("/queue", options);
