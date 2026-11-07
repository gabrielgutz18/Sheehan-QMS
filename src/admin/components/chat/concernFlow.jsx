import { CONCERN_KINDS, areaLabel } from "../../../data/concerns.js";
import Icon from "../common/icon.jsx";
import { concernTranscript } from "./concernSteps.js";

// the bot's face: a small robot, so its messages read apart from people's
const BOT =
    "M12 4v3M6 7h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9 12v1M15 12v1M9 16h6M2 12v3M22 12v3";

// one of the bot's messages, in the middle of the thread: a question it asks, or a report's status change
/** @param {{ children: import('react').ReactNode, sentAt?: string }} props */
export function BotBubble({ children, sentAt }) {
    return (
        <li className="chat-message chat-bot-message">
            <div className="chat-bot-bubble">
                <Icon d={BOT} className="line-icon chat-bot-icon" />
                <p className="chat-body">{children}</p>
                {sentAt && <time dateTime={sentAt}>{new Date(sentAt).toLocaleString()}</time>}
            </div>
        </li>
    );
}

// the three buttons above the thread that start a report; disabled while one is being answered
/** @param {{ onStart: (kind: string) => void, disabled?: boolean }} props */
export function ConcernButtons({ onStart, disabled = false }) {
    return (
        <div className="concern-buttons" role="group" aria-label="Start a report">
            {Object.entries(CONCERN_KINDS).map(([kind, { label, icon }]) => (
                <button
                    key={kind}
                    type="button"
                    className="admin-btn concern-start"
                    onClick={() => onStart(kind)}
                    disabled={disabled}
                >
                    <Icon d={icon} className="line-icon concern-icon" />
                    {label}
                </button>
            ))}
        </div>
    );
}

// the guided chat in the thread, after the real messages: each question with the answer given, the one being asked,
// and once all are answered, the report to send; onSend: Send report
/**
 * @param {{ draft: import('./concernSteps.js').ConcernDraft, done: boolean, sending: boolean, error: string,
 *   onSend: () => void }} props
 */
export function ConcernBot({ draft, done, sending, error, onSend }) {
    const kind = CONCERN_KINDS[draft.kind];
    const { area, details, extra, impact, screenshot } = draft.answers;
    return (
        <>
            {concernTranscript(draft).map((line, i) =>
                line.from === "bot" ? (
                    <BotBubble key={i}>{line.text}</BotBubble>
                ) : (
                    <li key={i} className="chat-message is-mine">
                        <div className="chat-bubble">
                            <p className="chat-body">{line.text}</p>
                        </div>
                    </li>
                ),
            )}
            {done && (
                <>
                    <BotBubble>Here's your report. Send it to the developers?</BotBubble>
                    <li className="chat-message chat-bot-message">
                        <div className="concern-summary">
                            <p className="concern-card-kind">
                                <Icon d={kind.icon} className="line-icon concern-icon" />
                                {kind.label}
                            </p>
                            <dl className="concern-card-facts">
                                <div>
                                    <dt>
                                        {draft.kind === "bug"
                                            ? "Page"
                                            : draft.kind === "concern"
                                              ? "About"
                                              : "Department"}
                                    </dt>
                                    <dd>{areaLabel(draft.kind, area)}</dd>
                                </div>
                                <div>
                                    <dt>{draft.kind === "feature" ? "Would help" : "How bad"}</dt>
                                    <dd>{kind.impacts[impact]}</dd>
                                </div>
                                {draft.kind === "bug" && (
                                    <div>
                                        <dt>Screenshot</dt>
                                        <dd>{screenshot ? "Attached" : "None"}</dd>
                                    </div>
                                )}
                            </dl>
                            <p className="concern-card-details">{details}</p>
                            {extra && (
                                <p className="concern-card-details">
                                    <strong>How it would help:</strong> {extra}
                                </p>
                            )}
                            <button
                                type="button"
                                className="admin-btn admin-btn-primary"
                                onClick={onSend}
                                disabled={sending}
                            >
                                {sending ? "Sending..." : "Send report"}
                            </button>
                            {error && (
                                <p className="field-error" role="alert">
                                    {error}
                                </p>
                            )}
                        </div>
                    </li>
                </>
            )}
        </>
    );
}

// over the composer while a report is being answered: the question's tap choices, Skip for the screenshot, and
// Cancel, always there, which throws the report away
/**
 * @param {{ label: string, choices: { value: string, label: string }[] | null, picture: boolean,
 *   onAnswer: (value: string) => void, onSkip: () => void, onCancel: () => void, sending: boolean }} props
 */
export function ConcernChoices({ label, choices, picture, onAnswer, onSkip, onCancel, sending }) {
    return (
        <div className="concern-choices">
            <p className="concern-choices-label">{label}</p>
            {choices && (
                <div className="concern-choice-list" role="group" aria-label="Choices">
                    {choices.map((c) => (
                        <button
                            key={c.value}
                            type="button"
                            className="concern-choice"
                            onClick={() => onAnswer(c.value)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            )}
            <span className="concern-choices-end">
                {picture && (
                    <button type="button" className="admin-btn" onClick={onSkip}>
                        Skip
                    </button>
                )}
                <button type="button" className="admin-btn" onClick={onCancel} disabled={sending}>
                    Cancel
                </button>
            </span>
        </div>
    );
}
