import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../ui/skeleton';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../ui/button';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="container mx-auto p-12 max-w-4xl space-y-6">
        <Skeleton className="h-12 w-64 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <div className="container mx-auto p-12 flex flex-col items-center justify-center text-center min-h-[60vh]">
        <div className="h-16 w-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mb-6">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md mb-6 text-sm">
          You do not have administrative privileges to access this portal with role{' '}
          <span className="font-semibold text-foreground uppercase">{role}</span>.
        </p>
        <Button onClick={() => window.history.back()} variant="outline">
          Return to Previous Page
        </Button>
      </div>
    );
  }

  return children;
}
