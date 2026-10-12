import http, { apiUrl } from '../../api/http.js';

// the signed-in account's own details, for My account (admin or sales)
// account: { id, username, name, role, firstName, middleName, surname, employeeId, department, photo }

// profile: { firstName, middleName, surname, employeeId, department } → the updated account
export const updateMyAccount = (profile) => http.patch("/admin/me", profile);

// photo: an image Blob (JPEG, PNG or WebP, up to 2 MB) → the updated account
export const uploadMyPhoto = (photo) => http.put("/admin/me/photo", photo);

export const removeMyPhoto = () => http.delete("/admin/me/photo");

// where an account's photo is shown from, or null; the version changes with every new photo
export const photoUrl = (account) =>
    account?.photo ? apiUrl(`/photos/${account.id}?v=${encodeURIComponent(account.photo)}`) : null;
