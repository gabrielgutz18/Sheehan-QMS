// where a staff member is right now: a switched-off account can't sign in at all, and someone who signed out
// with a ticket still on them isn't at the counter, so they're offline rather than serving
// account: from listUsers(), with disabled, servingNow and signedIn
export default function availabilityOf(account) {
    if (account.disabled) return { key: "off", label: "Switched off" };
    if (!account.signedIn) return { key: "offline", label: "Offline" };
    if (account.servingNow > 0) return { key: "serving", label: "Serving now" };
    return { key: "active", label: "Active" };
}
