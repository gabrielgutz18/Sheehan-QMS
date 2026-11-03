import { useRef } from 'react';

import Avatar from '../common/avatar.jsx';
import { removeMyPhoto, uploadMyPhoto } from '../../api/accountController.js';
import usePictureUpload from '../../hooks/usePictureUpload.js';

// photos are cropped to a square this many pixels wide before uploading, so they're small and all the same shape
const PHOTO_SIZE = 400;

// the signed-in account's photo, with upload and remove; onChange gets the updated account
export default function ProfilePhoto({ account, onChange }) {
    const inputRef = useRef(null);
    const { busy, error, pick, remove } = usePictureUpload({
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        upload: uploadMyPhoto,
        remove: removeMyPhoto,
        onChange,
    });

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
                    <button type="button" className="admin-btn admin-btn-danger" disabled={busy} onClick={remove}>
                        Remove
                    </button>
                )}
            </div>
            <p className="video-hint">A clear photo of your face. It's cropped to a square.</p>
            {error && <p className="field-error" role="alert">{error}</p>}
        </div>
    );
}
