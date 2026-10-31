import { useEffect, useRef, useState } from 'react';

import { chatImageUrl } from '../../api/chatController.js';
import { ROLE_LABELS } from '../../auth/roles.js';
import Avatar from '../common/avatar.jsx';
import Icon from '../common/icon.jsx';
import ImageViewer from './imageViewer.jsx';

const MAX_MESSAGE = 1000;
const sentTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
// pictures the server keeps as they are; anything else, or anything bigger, is redrawn as a JPEG first
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIDE = 1600;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// a phone photo can be big; past this it isn't worth shrinking
const MAX_ORIGINAL_MB = 25;
// a paper clip, for the Attach button
const PAPER_CLIP = "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48";

// a picture small enough to send: kept as it is when it already is (screenshots stay sharp), or shrunk to fit
// MAX_IMAGE_SIDE as a JPEG
async function chatImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES) {
        bitmap.close();
        return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    // a see-through PNG goes on white, not black
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

// one conversation between a staff member and the developers, oldest at the top, with a box to write the next message;
// a picture can go with it, pasted (Ctrl+V) or attached from the computer
// mine(message): whether it's the signed-in side's, shown on the right; onSend(body, image) saves one and gives it
// back, image a Blob or null; empty: what shows before anyone has written; label: the box's name for screen readers
// imageUrl(message): where a picture is shown from (the developer chat's, unless SheeChat passes its own); disabled:
// why nothing can be sent, e.g. the other person's account is switched off, or empty when it can
export default function MessageThread({ messages, loading, error, mine, onSend, empty, label, imageUrl = chatImageUrl, disabled = "" }) {
    const [draft, setDraft] = useState("");
    // the picture waiting to go: { blob, url } (url for its preview), or null
    const [image, setImage] = useState(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    // the picture open full size: its message's id, or null
    const [viewing, setViewing] = useState(null);
    const listRef = useRef(null);
    const fileRef = useRef(null);
    const lastId = messages.at(-1)?.id;
    const pictures = messages.filter((m) => m.image);
    const viewIndex = pictures.findIndex((m) => m.id === viewing);

    // keep the newest message in view as they come in
    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [lastId]);

    // the preview's object URL is let go once it's replaced, sent or the page closes
    useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

    const attach = async (file) => {
        setSendError("");
        if (!file.type.startsWith("image/")) return setSendError("Only pictures can be attached.");
        if (file.size > MAX_ORIGINAL_MB * 1024 * 1024) return setSendError(`Pictures can be up to ${MAX_ORIGINAL_MB} MB.`);
        try {
            const blob = await chatImage(file);
            setImage({ blob, url: URL.createObjectURL(blob) });
        } catch {
            setSendError("That picture couldn't be opened. Try a JPEG or PNG.");
        }
    };

    // Ctrl+V with a picture on the clipboard attaches it; pasted text goes in the box as usual
    const paste = (e) => {
        const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        attach(file);
    };

    const send = async (e) => {
        e.preventDefault();
        const body = draft.trim();
        if ((!body && !image) || sending) return;
        setSending(true);
        setSendError("");
        try {
            await onSend(body, image?.blob ?? null);
            setDraft("");
            setImage(null);
        } catch (err) {
            setSendError(err.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="chat-thread">
            <ol ref={listRef} className="chat-messages" aria-live="polite">
                {loading && messages.length === 0 ? (
                    <li className="admin-empty">Loading...</li>
                ) : messages.length === 0 ? (
                    <li className="admin-empty">{empty}</li>
                ) : (
                    messages.map((m) => (
                        <li key={m.id} className={`chat-message${mine(m) ? " is-mine" : ""}`}>
                            <Avatar account={m.from} size={28} />
                            <div className="chat-bubble">
                                <p className="chat-meta">
                                    <strong>{m.from.name}</strong>
                                    <span>{ROLE_LABELS[m.from.role] ?? m.from.role}</span>
                                    <time dateTime={m.sentAt}>{sentTime.format(new Date(m.sentAt))}</time>
                                </p>
                                {m.image && (
                                    // opens full size over the page
                                    <button
                                        type="button"
                                        className="chat-image"
                                        aria-label={`Open picture from ${m.from.name}`}
                                        onClick={() => setViewing(m.id)}
                                    >
                                        <img
                                            src={imageUrl(m)}
                                            alt={m.body ? `Picture: ${m.body}` : `Picture from ${m.from.name}`}
                                            loading="lazy"
                                            onLoad={() => {
                                                // a picture loading late pushes the newest message out of view
                                                const list = listRef.current;
                                                if (list && m.id === lastId) list.scrollTop = list.scrollHeight;
                                            }}
                                        />
                                    </button>
                                )}
                                {m.body && <p className="chat-body">{m.body}</p>}
                                {mine(m) && m.read && <p className="chat-seen">Seen</p>}
                            </div>
                        </li>
                    ))
                )}
            </ol>

            {error && <p className="field-error" role="alert">{error}</p>}

            {disabled ? (
                <p className="admin-empty">{disabled}</p>
            ) : (
                <form className="chat-compose" onSubmit={send}>
                    {image && (
                        <div className="chat-attachment">
                            <img src={image.url} alt="Picture to send" />
                            <button type="button" className="admin-btn" onClick={() => setImage(null)} disabled={sending}>
                                Remove
                            </button>
                        </div>
                    )}
                    <textarea
                        aria-label={label}
                        rows={3}
                        maxLength={MAX_MESSAGE}
                        placeholder={image ? "Add a caption..." : "Write a message, or paste a picture..."}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onPaste={paste}
                        onKeyDown={(e) => {
                            // Enter sends, Shift+Enter starts a new line
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
                        }}
                    />
                    <div className="chat-compose-actions">
                        <span className="video-hint">{draft.length}/{MAX_MESSAGE} · Enter sends, Shift+Enter for a new line · Ctrl+V pastes a picture</span>
                        <span className="chat-compose-buttons">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const [file] = e.target.files;
                                    // cleared, so picking the same file again still counts
                                    e.target.value = "";
                                    if (file) attach(file);
                                }}
                            />
                            <button
                                type="button"
                                className="admin-btn chat-attach-btn"
                                aria-label={image ? "Change picture" : "Attach a picture"}
                                onClick={() => fileRef.current.click()}
                                disabled={sending}
                            >
                                <Icon d={PAPER_CLIP} className="line-icon chat-attach-icon" />
                                {image ? "Change" : "Attach"}
                            </button>
                            <button type="submit" className="admin-btn admin-btn-primary" disabled={sending || (!draft.trim() && !image)}>
                                {sending ? "Sending..." : "Send"}
                            </button>
                        </span>
                    </div>
                    {sendError && <p className="field-error" role="alert">{sendError}</p>}
                </form>
            )}

            {viewIndex !== -1 && (
                <ImageViewer
                    imageUrl={imageUrl}
                    pictures={pictures}
                    index={viewIndex}
                    onIndex={(i) => setViewing(pictures[i].id)}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
