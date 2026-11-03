import '../style/chat.css';

import { listMyMessages, listMyTyping, noteMyTyping, sendMyImage, sendMyMessage } from '../api/chatController.js';
import DeveloperHeads from '../components/chat/developerHeads.jsx';
import MessageThread from '../components/chat/messageThread.jsx';
import { useViewingConversation } from '../hooks/useMessageToasts.js';
import useMessages from '../hooks/useMessages.js';
import useTyping from '../hooks/useTyping.js';

// Message developer, for every role but the developers: when something doesn't go well in the system, write to the
// team that builds it, and their answers come back here; their chat heads show which of them are online
export default function MessageDeveloperPage() {
    const { messages, loading, error, added } = useMessages(listMyMessages);
    const { typing, typed } = useTyping(listMyTyping, noteMyTyping);
    useViewingConversation("developer");

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
                <DeveloperHeads />
                <MessageThread
                    messages={messages}
                    loading={loading}
                    error={error}
                    mine={(m) => m.fromStaff}
                    typing={typing}
                    onTyping={typed}
                    onSend={async (body, image) => added(await (image ? sendMyImage(image, body) : sendMyMessage(body)))}
                    empty="No messages yet. Write the first one below."
                    label="Message to the developers"
                />
            </div>
        </section>
    );
}
