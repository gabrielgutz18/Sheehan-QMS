import PageTabs from '../components/common/pageTabs.jsx';
import MessageDeveloperPage from './messageDeveloperPage.jsx';
import SheeChatPage from './sheeChatPage.jsx';

// SheeChat, for everyone but the developers: chatting with coworkers and writing to the developers are both just
// sending a message, so they're one menu item with a tab each
export default function MessagesPage() {
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
