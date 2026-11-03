import { coverUrl } from "../../api/accountController.js";

// the banner at the top of a profile: their cover photo, or the brand's dark red when they haven't picked one
// account: { id, coverPhoto }; children: anything that sits on the banner, like an edit button
export default function ProfileCover({ account, children = null }) {
    const url = coverUrl(account);

    return (
        <div className={`profile-summary-cover${url ? " has-photo" : ""}`}>
            {url && <img className="profile-summary-cover-img" src={url} alt="" />}
            {children}
        </div>
    );
}
