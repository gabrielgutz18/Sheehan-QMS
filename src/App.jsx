import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import './App.css'

import CustomerOrder from './pages/customerOrder.jsx'
import NotFound from './pages/notFound.jsx'

// admin code is split into its own bundle, so the customer page never downloads it
const AdminApp = lazy(() => import('./admin/adminApp.jsx'))

function App() {
  return (
    // BASE_URL follows Vite's --base, so routes work at / or under a sub-path
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<CustomerOrder />} />
        <Route
          path="/admin/*"
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
