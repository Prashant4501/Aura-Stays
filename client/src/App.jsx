import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout from './components/layout/AdminLayout';

// Guest Pages
import LandingPage from './pages/LandingPage';
import SearchResultsPage from './pages/SearchResultsPage';
import RoomDetailPage from './pages/RoomDetailPage';
import CheckoutPage from './pages/CheckoutPage';
import MyBookingsPage from './pages/MyBookingsPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Admin Pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminPropertiesPage from './pages/admin/AdminPropertiesPage';
import AdminRoomsPage from './pages/admin/AdminRoomsPage';
import AdminRoomTypesPage from './pages/admin/AdminRoomTypesPage';
import AdminPricingPage from './pages/admin/AdminPricingPage';
import AdminAvailabilityPage from './pages/admin/AdminAvailabilityPage';
import AdminReservationsPage from './pages/admin/AdminReservationsPage';
import AdminReservationDetailPage from './pages/admin/AdminReservationDetailPage';
import AdminRefundsPage from './pages/admin/AdminRefundsPage';
import AdminCouponsPage from './pages/admin/AdminCouponsPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';

// Layout wrapper for guest public pages
function GuestLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Guest Public & Protected Routes */}
      <Route
        path="/"
        element={
          <GuestLayout>
            <LandingPage />
          </GuestLayout>
        }
      />
      <Route
        path="/explore"
        element={
          <GuestLayout>
            <SearchResultsPage />
          </GuestLayout>
        }
      />
      <Route
        path="/rooms/:id"
        element={
          <GuestLayout>
            <RoomDetailPage />
          </GuestLayout>
        }
      />
      <Route
        path="/checkout/:reservationId"
        element={
          <ProtectedRoute>
            <GuestLayout>
              <CheckoutPage />
            </GuestLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-bookings"
        element={
          <ProtectedRoute>
            <GuestLayout>
              <MyBookingsPage />
            </GuestLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <GuestLayout>
              <ProfilePage />
            </GuestLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/login"
        element={
          <GuestLayout>
            <LoginPage />
          </GuestLayout>
        }
      />
      <Route
        path="/register"
        element={
          <GuestLayout>
            <RegisterPage />
          </GuestLayout>
        }
      />

      {/* Admin / Property Manager Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN', 'PROPERTY_MANAGER']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="properties" element={<AdminPropertiesPage />} />
        <Route path="rooms" element={<AdminRoomsPage />} />
        <Route path="room-types" element={<AdminRoomTypesPage />} />
        <Route path="pricing" element={<AdminPricingPage />} />
        <Route path="availability" element={<AdminAvailabilityPage />} />
        <Route path="reservations" element={<AdminReservationsPage />} />
        <Route path="reservations/:id" element={<AdminReservationDetailPage />} />
        <Route path="refunds" element={<AdminRefundsPage />} />
        <Route path="coupons" element={<AdminCouponsPage />} />
        <Route path="audit-logs" element={<AdminAuditLogsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
