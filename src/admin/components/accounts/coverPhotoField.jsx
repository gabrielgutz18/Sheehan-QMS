import { useRef } from "react";

import { removeMyCover, uploadMyCover } from "../../api/accountController.js";
import usePictureUpload from "../../hooks/usePictureUpload.js";
import CoverAdjustDialog from "./coverAdjustDialog.jsx";
import ProfileCover from "./profileCover.jsx";

// covers are cropped to this wide banner before uploading: sharp on a big screen, and still a small file
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 400;

// the signed-in account's cover photo on My account, with upload and remove; onChange gets the updated account
// a new cover opens in a preview first, where it's dragged into place and saved with OK
export default function CoverPhotoField({ account, onChange }) {
    const inputRef = useRef(null);
    const { busy, error, draft, pick, save, cancel, remove } = usePictureUpload({
        width: COVER_WIDTH,
        height: COVER_HEIGHT,
        upload: uploadMyCover,
        remove: removeMyCover,
        onChange,
        adjust: true,
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
                Shown on your Dashboard and your SheeChat profile. After choosing a picture, drag it to choose the part
                of it that fits the wide banner.
            </p>
            {/* while the new cover is being placed, its dialog shows the error instead */}
            {error && !draft && (
                <p className="field-error" role="alert">
                    {error}
                </p>
            )}
            {draft && (
                <CoverAdjustDialog
                    picture={draft}
                    shape={COVER_WIDTH / COVER_HEIGHT}
                    busy={busy}
                    error={error}
                    onSave={save}
                    onClose={cancel}
                />
            )}
        </div>
    );
}
