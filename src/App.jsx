import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import './App.css'

import NotFound from './pages/notFound.jsx'
import QueueDisplay from './display/queueDisplay.jsx'

// admin code is split into its own bundle, so the display screen never downloads it
const AdminApp = lazy(() => import('./admin/adminApp.jsx'))

// the staff pages' old address (/admin/...), so bookmarks and open tabs land on the same page under /staff
function OldStaffAddress() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/admin/, "/staff") + search} replace />
}

function App() {
  return (
    // BASE_URL follows Vite's --base, so routes work at / or under a sub-path
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* the queue display; orders are taken by staff under Customer order in the staff pages, not at a kiosk */}
        <Route path="/" element={<QueueDisplay />} />
        {/* the display's old address, so screens opened with it still work */}
        <Route path="/queue" element={<Navigate to="/" replace />} />
        {/* short address for sales staff: their counter, by way of the sign-in page if needed */}
        <Route path="/sales" element={<Navigate to="/staff/counter" replace />} />
        <Route path="/admin/*" element={<OldStaffAddress />} />
        <Route
          path="/staff/*"
          element={
            <Suspense fallback={<p className="admin-status">Loading...</p>}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
