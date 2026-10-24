import http from '../../api/http.js';

// the Loading page: one shared line, so the loading crew calls any customer sales has handed over, marks them done,
// or sends them back to waiting
// each returns the order; a call while a sales counter is serving the customer again is refused (409,
// "Please wait until Maria Santos finishes.")

export const callAtLoading = (queueNum, remarks) =>
    http.post(`/admin/loading/${encodeURIComponent(queueNum)}/call`, { remarks });

export const finishAtLoading = (queueNum) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/done`);

export const sendBackFromLoading = (queueNum) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/back`);
