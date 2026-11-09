import "../style/chat.css";

import { useState } from "react";

import { listMyMessages, listMyTyping, noteMyTyping, sendMyImage, sendMyMessage } from "../api/chatController.js";
import { ROLE_LABELS } from "../auth/roles.js";
import { useAuth } from "../auth/authContext.js";
import { BotBubble, ConcernBot, ConcernButtons, ConcernChoices } from "../components/chat/concernFlow.jsx";
import DeveloperHeads from "../components/chat/developerHeads.jsx";
import MessageThread from "../components/chat/messageThread.jsx";
import { navFor } from "../data/navItems.js";
import useConcernFlow from "../hooks/useConcernFlow.js";
import { useViewingConversation } from "../hooks/useMessageToasts.js";
import useMessages from "../hooks/useMessages.js";
import useTyping from "../hooks/useTyping.js";

// Message developer, for every role but the developers: when something doesn't go well in the system, write to the
// team that builds it, and their answers come back here; their chat heads show which of them are online
// the three buttons above the thread start a short guided chat that sends a bug, a system concern or a feature for
// their department as one report the developers track; each change to it comes back here as the bot's message
export default function MessageDeveloperPage() {
    const { user } = useAuth();
    const { messages, loading, error, added } = useMessages(listMyMessages);
    const { typing, typed } = useTyping(listMyTyping, noteMyTyping);
    useViewingConversation("developer");
    const flow = useConcernFlow({
        // a bug's page: one of their own sidebar's
        pages: navFor(user.role).map(({ label }) => label),
        area: user.department || ROLE_LABELS[user.role] || user.role,
        sent: added,
    });
    const { draft, question } = flow;
    // the developer team as the chat heads last read it, or null until then
    const [team, setTeam] = useState(null);
    // with none of them on, the bot says so as soon as the tab opens, so nobody waits on an answer that isn't coming yet
    const offline = team !== null && !team.some((d) => d.online);

    // while a report is being answered, the box answers the bot instead of writing to the developers
    const bot = draft && {
        after: (
            <ConcernBot draft={draft} done={!question} sending={flow.sending} error={flow.error} onSend={flow.send} />
        ),
        above: (
            <ConcernChoices
                label={question ? "Answering the report's questions" : "Check the report, then send it"}
                choices={question?.choices ?? null}
                picture={Boolean(question?.picture)}
                onAnswer={flow.answer}
                onSkip={flow.skip}
                onCancel={flow.cancel}
                sending={flow.sending}
            />
        ),
        placeholder: !question
            ? "Press Send report above, or Cancel."
            : question.choices
              ? "Tap one of the choices above."
              : question.picture
                ? "Attach or paste a picture, then Send, or Skip."
                : "Type your answer...",
        locked: !question || Boolean(question.choices),
        step: draft.step,
    };

    return (
        <section className="admin-page">
            <div>
                <h1 className="admin-title">Message developer</h1>
                <p className="tab-hint">
                    Something not working, or looking wrong? Say what you were doing and what happened, and a developer
                    answers here. Or start a report below, and a few questions make sure nothing is missed.
                </p>
            </div>

            <div className="admin-panel chat-panel">
                <DeveloperHeads onTeam={setTeam} />
                <ConcernButtons onStart={flow.start} disabled={Boolean(draft)} />
                {!draft && flow.error && (
                    <p className="field-error" role="alert">
                        {flow.error}
                    </p>
                )}
                <MessageThread
                    messages={messages}
                    loading={loading}
                    error={error}
                    mine={(m) => m.fromStaff}
                    typing={typing}
                    // answering the bot isn't writing to the developers
                    onTyping={draft ? () => {} : typed}
                    onSend={async (body, image) => {
                        if (draft) return flow.answer(question?.picture ? image : body);
                        added(await (image ? sendMyImage(image, body) : sendMyMessage(body)));
                    }}
                    empty="No messages yet. Write the first one below."
                    label="Message to the developers"
                    bot={bot}
                    note={
                        offline && (
                            <BotBubble pop>
                                The developers are currently offline. Please leave a message and we'll get back to you.
                            </BotBubble>
                        )
                    }
                />
            </div>
        </section>
    );
}
