import PageTabs from "../components/common/pageTabs.jsx";
import { useAuth } from "../auth/authContext.js";
import ChatPage from "./chatPage.jsx";
import MessageDeveloperPage from "./messageDeveloperPage.jsx";
import SheeChatPage from "./sheeChatPage.jsx";

// SheeChat: chatting with coworkers and the developer channel are both just sending a message, so they're one menu
// item with a tab each: the staff chat with anyone and write to the developers on Message developer, and the
// developers chat with anyone and answer what staff wrote there on Staff concerns
export default function MessagesPage() {
    const { user } = useAuth();
    if (user.role === "developer") {
        return (
            <PageTabs
                label="Messages"
                tabs={[
                    { key: "staff", label: "Staff", page: <SheeChatPage /> },
                    { key: "concerns", label: "Staff concerns", page: <ChatPage /> },
                ]}
            />
        );
    }
    return (
        <PageTabs
            label="Messages"
            tabs={[
                { key: "staff", label: "Staff", page: <SheeChatPage /> },
                { key: "developer", label: "Message developer", page: <MessageDeveloperPage /> },
            ]}
        />
    );
}
