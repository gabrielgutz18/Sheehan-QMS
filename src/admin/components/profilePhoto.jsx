import { useRef, useState } from 'react';

import Avatar from './avatar.jsx';
import { removeMyPhoto, uploadMyPhoto } from '../api/accountController.js';

// photos are cropped to a square this many pixels wide before uploading, so they're small and all the same shape
const PHOTO_SIZE = 400;
// larger originals are refused before the browser tries to open them
const MAX_ORIGINAL_MB = 15;

// the middle square of the picture, shrunk to PHOTO_SIZE, as a JPEG
async function squarePhoto(file) {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    canvas
        .getContext("2d")
        .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

// the signed-in account's photo, with upload and remove; onChange gets the updated account
export default function ProfilePhoto({ account, onChange }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const run = async (action) => {
        setBusy(true);
        setError("");
        try {
            onChange(await action());
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const pick = (file) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError("Choose a picture (JPEG, PNG or WebP).");
            return;
        }
        if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) {
            setError(`That picture is over ${MAX_ORIGINAL_MB} MB. Choose a smaller one.`);
            return;
        }
        run(async () => {
            let photo;
            try {
                photo = await squarePhoto(file);
            } catch {
                throw new Error("This browser can't open that picture. Try a JPEG or PNG.");
            }
            return uploadMyPhoto(photo);
        });
    };

    return (
        <div className="profile-photo">
            <Avatar account={account} size={120} />
            <div className="profile-photo-actions">
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="visually-hidden"
                    onChange={(e) => {
                        pick(e.target.files[0]);
                        e.target.value = "";
                    }}
                />
                <button type="button" className="admin-btn" disabled={busy} onClick={() => inputRef.current.click()}>
                    {busy ? "Saving..." : account.photo ? "Change photo" : "Upload photo"}
                </button>
                {account.photo && (
                    <button type="button" className="admin-btn admin-btn-danger" disabled={busy} onClick={() => run(removeMyPhoto)}>
                        Remove
                    </button>
                )}
            </div>
            <p className="video-hint">A clear photo of your face. It's cropped to a square.</p>
            {error && <p className="field-error" role="alert">{error}</p>}
        </div>
    );
}
