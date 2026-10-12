import { photoUrl } from '../api/accountController.js';

// an account's profile photo in a circle, or its initials when it has none
// account: { id, name, firstName?, surname?, photo }
export default function Avatar({ account, size = 40 }) {
    const url = photoUrl(account);
    const initials = (
        account?.firstName || account?.surname
            ? `${account.firstName?.[0] ?? ""}${account.surname?.[0] ?? ""}`
            : (account?.name ?? "").split(/\s+/).map((word) => word[0]).slice(0, 2).join("")
    ).toUpperCase();

    return (
        <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
            {url ? <img src={url} alt="" /> : initials || "?"}
        </span>
    );
}
