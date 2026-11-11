import PageTabs from "../components/common/pageTabs.jsx";
import { useAuth } from "../auth/authContext.js";
import MessageDeveloperPage from "./messageDeveloperPage.jsx";
import SheeChatPage from "./sheeChatPage.jsx";

// SheeChat: chatting with coworkers and writing to the developers are both just sending a message, so for the staff
// they're one menu item with a tab each; the developers chat with one another here and answer staff on Chat, so
// theirs is SheeChat alone
export default function MessagesPage() {
    const { user } = useAuth();
    if (user.role === "developer") return <SheeChatPage />;
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
