import http, { apiUrl } from '../../api/http.js';

// the signed-in account's own details, for My account (admin or sales)
// account: { id, username, name, role, firstName, middleName, surname, employeeId, department, photo, coverPhoto }

// profile: { firstName, middleName, surname, employeeId, department } → the updated account
export const updateMyAccount = (profile) => http.patch("/admin/me", profile);

// photo: an image Blob (JPEG, PNG or WebP, up to 2 MB) → the updated account
export const uploadMyPhoto = (photo) => http.put("/admin/me/photo", photo);

export const removeMyPhoto = () => http.delete("/admin/me/photo");

// where an account's photo is shown from, or null; the version changes with every new photo
export const photoUrl = (account) =>
    account?.photo ? apiUrl(`/photos/${account.id}?v=${encodeURIComponent(account.photo)}`) : null;

// cover: an image Blob (JPEG, PNG or WebP, up to 2 MB) → the updated account
export const uploadMyCover = (cover) => http.put("/admin/me/cover", cover);

export const removeMyCover = () => http.delete("/admin/me/cover");

// where an account's cover photo is shown from, or null; the version changes with every new one
export const coverUrl = (account) =>
    account?.coverPhoto ? apiUrl(`/photos/${account.id}/cover?v=${encodeURIComponent(account.coverPhoto)}`) : null;
