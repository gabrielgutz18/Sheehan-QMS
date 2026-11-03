import { useRef } from "react";

import { removeMyCover, uploadMyCover } from "../../api/accountController.js";
import usePictureUpload from "../../hooks/usePictureUpload.js";
import ProfileCover from "./profileCover.jsx";

// covers are cropped to this wide banner before uploading: sharp on a big screen, and still a small file
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 400;

// the signed-in account's cover photo on My account, with upload and remove; onChange gets the updated account
export default function CoverPhotoField({ account, onChange }) {
    const inputRef = useRef(null);
    const { busy, error, pick, remove } = usePictureUpload({
        width: COVER_WIDTH,
        height: COVER_HEIGHT,
        upload: uploadMyCover,
        remove: removeMyCover,
        onChange,
    });

    return (
        <div className="profile-photo cover-photo-field">
            <ProfileCover account={account} />
            <div className="profile-photo-actions">
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Cover photo file"
                    className="visually-hidden"
                    onChange={(e) => {
                        pick(e.target.files[0]);
                        e.target.value = "";
                    }}
                />
                <button type="button" className="admin-btn" disabled={busy} onClick={() => inputRef.current.click()}>
                    {busy ? "Saving..." : account.coverPhoto ? "Change cover" : "Upload cover"}
                </button>
                {account.coverPhoto && (
                    <button type="button" className="admin-btn admin-btn-danger" disabled={busy} onClick={remove}>
                        Remove cover
                    </button>
                )}
            </div>
            <p className="video-hint">
                Shown on your Dashboard and your SheeChat profile. It's cropped to a wide banner.
            </p>
            {error && (
                <p className="field-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
