// a new order half filled in on Customer order is kept for a short while after sales leave the page, so going to
// another menu and straight back finds it as it was; it lives in this browser tab only (sessionStorage), under the
// signed-in staff member, and is dropped once the order is served or it's been left longer than DRAFT_TTL
const DRAFT_TTL = 60 * 1000;

const draftKey = (userId) => `orderDraft:${userId ?? "anyone"}`;

// the fields as they were left, or null when there's none or it's too old
export const readOrderDraft = (userId) => {
    try {
        const draft = JSON.parse(sessionStorage.getItem(draftKey(userId)));
        if (!draft?.fields) return null;
        if (Date.now() - draft.savedAt > DRAFT_TTL) {
            sessionStorage.removeItem(draftKey(userId));
            return null;
        }
        return draft.fields;
    } catch {
        return null;
    }
};

// stamped with the time it's saved, so the minute counts from when the page was left
export const saveOrderDraft = (userId, fields) => {
    try {
        sessionStorage.setItem(draftKey(userId), JSON.stringify({ savedAt: Date.now(), fields }));
    } catch {
        // storage blocked; the form just starts empty next time
    }
};

export const clearOrderDraft = (userId) => {
    try {
        sessionStorage.removeItem(draftKey(userId));
    } catch {
        // storage blocked; nothing was kept
    }
};
