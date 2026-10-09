import http from './http.js';

// public queue board: { serving: [{ queueNum, purpose }], upcoming: [{ queueNum, purpose }] }, both sorted by queueNum
export const getQueue = (options) => http.get("/queue", options);
