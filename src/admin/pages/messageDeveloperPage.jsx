import '../style/chat.css';

import { listMyMessages, sendMyMessage } from '../api/chatController.js';
import MessageThread from '../components/chat/messageThread.jsx';
import useMessages from '../hooks/useMessages.js';

// Message developer, for every role but the developers: when something doesn't go well in the system, write to the
// team that builds it, and their answers come back here
export default function MessageDeveloperPage() {
    const { messages, loading, error, added } = useMessages(listMyMessages);

    return (
        <section className="admin-page">
            <div>
                <h1 className="admin-title">Message developer</h1>
                <p className="tab-hint">
                    Something not working, or looking wrong? Say what you were doing and what happened, and a developer
                    answers here.
                </p>
            </div>

            <div className="admin-panel chat-panel">
                <MessageThread
                    messages={messages}
                    loading={loading}
                    error={error}
                    mine={(m) => m.fromStaff}
                    onSend={async (body) => added(await sendMyMessage(body))}
                    empty="No messages yet. Write the first one below."
                    label="Message to the developers"
                />
            </div>
        </section>
    );
}
