import http from '../../api/http.js';

// the Loading page: one shared line, so the loading crew calls any customer sales has handed over to one of the
// order's areas, marks that area done (the order then waits for its next area, or goes on to the security check
// after the last), or sends them back to waiting
// each returns the order; a call while a sales counter is serving the customer again is refused (409,
// "Please wait until Maria Santos finishes.")

// area: one of the order's areas still to load, the next one when left out
export const callAtLoading = (queueNum, remarks, area) =>
    http.post(`/admin/loading/${encodeURIComponent(queueNum)}/call`, { remarks, area });

export const finishAtLoading = (queueNum) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/done`);

export const sendBackFromLoading = (queueNum) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/back`);
