import { useEffect, useRef } from 'react';

import { chatImageUrl } from '../../api/chatController.js';

const sentTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// a chat picture opened full size over the page, as Messenger or Telegram does, instead of in a new tab; the arrows
// (or the ← → keys) step through the conversation's other pictures; Esc, ✕ or a click beside the picture closes it
// pictures: the conversation's messages that carry one, oldest first; index: the one open; onIndex(i) opens another
export default function ImageViewer({ pictures, index, onIndex, onClose }) {
    const dialogRef = useRef(null);
    const message = pictures[index];
    const hasPrev = index > 0;
    const hasNext = index < pictures.length - 1;

    useEffect(() => {
        if (!dialogRef.current.open) dialogRef.current.showModal();
    }, []);

    const keyDown = (e) => {
        if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
        if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };

    return (
        <dialog
            ref={dialogRef}
            className="chat-viewer"
            aria-label={`Picture from ${message.from.name}`}
            onClose={onClose}
            onKeyDown={keyDown}
            // a click on the dark area around the picture closes it; clicks on the picture or the buttons don't
            onClick={(e) => e.target === e.currentTarget && dialogRef.current.close()}
        >
            <div className="chat-viewer-top">
                <p className="chat-viewer-meta">
                    <strong>{message.from.name}</strong>
                    <time dateTime={message.sentAt}>{sentTime.format(new Date(message.sentAt))}</time>
                    {pictures.length > 1 && <span>{index + 1} of {pictures.length}</span>}
                </p>
                <button type="button" className="chat-viewer-btn" aria-label="Close" onClick={() => dialogRef.current.close()} autoFocus>
                    ✕
                </button>
            </div>

            <div className="chat-viewer-stage" onClick={(e) => e.target === e.currentTarget && dialogRef.current.close()}>
                {hasPrev && (
                    <button type="button" className="chat-viewer-btn chat-viewer-prev" aria-label="Previous picture" onClick={() => onIndex(index - 1)}>
                        ‹
                    </button>
                )}
                <img key={message.id} src={chatImageUrl(message)} alt={message.body ? `Picture: ${message.body}` : `Picture from ${message.from.name}`} />
                {hasNext && (
                    <button type="button" className="chat-viewer-btn chat-viewer-next" aria-label="Next picture" onClick={() => onIndex(index + 1)}>
                        ›
                    </button>
                )}
            </div>

            {message.body && <p className="chat-viewer-caption">{message.body}</p>}
        </dialog>
    );
}
