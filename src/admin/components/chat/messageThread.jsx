import { useEffect, useRef, useState } from 'react';

import { chatImageUrl } from '../../api/chatController.js';
import { ROLE_LABELS } from '../../auth/roles.js';
import Avatar from '../common/avatar.jsx';
import Icon from '../common/icon.jsx';
import ConcernCard from './concernCard.jsx';
import { BotBubble } from './concernFlow.jsx';
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
// under your own messages: one check once it has reached the server, two once the other side has opened it
const DELIVERED_TICK = "M20 6 9 17l-5-5";
const SEEN_TICKS = "M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16";

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
// typing: who else is writing right now, [{ id, name }]; onTyping(): called as you write a message (see useTyping)
// renderReport(message): a report's card (see concernCard.jsx); the Chat page passes one with the status buttons
// bot: while a report is being answered on Message developer: after (the guided chat, after the messages), above (its
// choices over the box), placeholder, locked (the box takes no words, e.g. while choices are asked) and step (to keep
// the newest question in view)
/**
 * @param {{ messages: any[], loading: boolean, error: string, mine: (message: any) => boolean,
 *   onSend: (body: string, image: Blob | null) => Promise<any>, empty: string, label: string,
 *   typing: { id: number, name: string }[], onTyping: () => void, imageUrl?: (message: any) => string,
 *   disabled?: string, renderReport?: (message: any) => import('react').ReactNode,
 *   bot?: { after: import('react').ReactNode, above: import('react').ReactNode, placeholder: string, locked: boolean,
 *     step: number } | null }} props
 */
export default function MessageThread({
    messages,
    loading,
    error,
    mine,
    onSend,
    empty,
    label,
    typing,
    onTyping,
    imageUrl = chatImageUrl,
    disabled = "",
    renderReport = (m) => <ConcernCard concern={m.concern} />,
    bot = null,
}) {
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
    }, [lastId, bot?.step]);

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
                {loading && messages.length === 0 && !bot ? (
                    <li className="admin-empty">Loading...</li>
                ) : messages.length === 0 && !bot ? (
                    <li className="admin-empty">{empty}</li>
                ) : (
                    messages.map((m) => m.kind === "status" ? (
                        // a developer moved a report along: the bot says so, in the middle
                        <BotBubble key={m.id} sentAt={m.sentAt}>{m.body}</BotBubble>
                    ) : (
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
                                {m.kind === "report" && m.concern ? renderReport(m) : m.body && <p className="chat-body">{m.body}</p>}
                                {mine(m) && (
                                    <p className={`chat-ticks${m.read ? " is-seen" : ""}`}>
                                        <span role="img" aria-label={m.read ? "Seen" : "Delivered"} title={m.read ? "Seen" : "Delivered"}>
                                            <Icon d={m.read ? SEEN_TICKS : DELIVERED_TICK} className="line-icon chat-ticks-icon" />
                                        </span>
                                    </p>
                                )}
                            </div>
                        </li>
                    ))
                )}
                {bot?.after}
            </ol>

            {/* always there, so the messages don't jump when someone starts or stops typing */}
            <p className="chat-typing" role="status">
                {typing.length > 0 && (
                    <>
                        <span className="chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                        {typing.map(({ name }) => name).join(", ")} {typing.length === 1 ? "is" : "are"} typing
                    </>
                )}
            </p>

            {error && <p className="field-error" role="alert">{error}</p>}

            {disabled ? (
                <p className="admin-empty">{disabled}</p>
            ) : (
                <form className="chat-compose" onSubmit={send}>
                    {bot?.above}
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
                        placeholder={bot?.placeholder ?? (image ? "Add a caption..." : "Write a message, or paste a picture...")}
                        disabled={bot?.locked}
                        value={draft}
                        onChange={(e) => {
                            setDraft(e.target.value);
                            // rubbing it all out isn't writing to anyone
                            if (e.target.value.trim()) onTyping();
                        }}
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
