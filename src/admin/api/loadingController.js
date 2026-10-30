import http from '../../api/http.js';

// the Loading and Hardware pages (department: "loading" or "hardware", src/data/loadingAreas.js): each is one shared
// line, so the department's crew calls any customer sales has handed over to one of the order's areas it works, marks
// that area done (the order then waits for its next area, here or at the other department, or goes on to the security
// check after the last), or sends them back to waiting
// each returns the order; a call while a sales counter or the other department is serving the customer is refused
// (409, "Please wait until Maria Santos finishes.")

// area: one of the order's areas still to load here, the next one when left out
export const callAtLoading = (department, queueNum, remarks, area) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/call`, { remarks, area });

// Loading: the truck is at the area they were called to; until that area is done no other area can take them, and
// Done is refused before it (409)
export const startLoading = (department, queueNum) => http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/start`);

export const finishAtLoading = (department, queueNum) => http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/done`);

export const sendBackFromLoading = (department, queueNum) =>
    http.post(`/admin/${department}/${encodeURIComponent(queueNum)}/back`);
