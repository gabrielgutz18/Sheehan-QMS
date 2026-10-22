import http from '../../api/http.js';

// the Loading page: a crew calls a customer to its area, marks its part done, or sends them back to waiting
// a loading account always acts for its own team; an admin passes the team they're working as
// each returns the order; a call while another crew or counter is serving the customer is refused (409,
// "Please wait until Roofings finishes.")

export const callAtTeam = (queueNum, { team, remarks }) =>
    http.post(`/admin/loading/${encodeURIComponent(queueNum)}/call`, { team, remarks });

// the last crew on the order finishing marks the whole order done
export const finishAtTeam = (queueNum, team) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/done`, { team });

export const sendBackFromTeam = (queueNum, team) => http.post(`/admin/loading/${encodeURIComponent(queueNum)}/back`, { team });
