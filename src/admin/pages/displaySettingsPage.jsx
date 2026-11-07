import PageTabs from '../components/common/pageTabs.jsx';
import AnnouncerPage from './announcerPage.jsx';
import PrinterPage from './printerPage.jsx';
import VideoPage from './videoPage.jsx';

// Display & printer, for admins: the settings set once and rarely opened again, under one menu item instead of three
export default function DisplaySettingsPage() {
    return (
        <PageTabs
            label="Display and printer settings"
            tabs={[
                { key: "video", label: "Display video", page: <VideoPage /> },
                { key: "announcer", label: "Announcer", page: <AnnouncerPage /> },
                { key: "printer", label: "Printer", page: <PrinterPage /> },
            ]}
        />
    );
}
