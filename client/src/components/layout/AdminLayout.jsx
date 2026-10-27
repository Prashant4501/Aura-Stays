import React, { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/button';
import BrandLogo from './BrandLogo';
import {
  LayoutDashboard,
  Building2,
  BedDouble,
  Tag,
  CalendarDays,
  CalendarCheck2,
  RotateCcw,
  TicketPercent,
  History,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export default function AdminLayout() {
  const { user, isAdmin, isManager, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { label: 'Overview', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Properties', to: '/admin/properties', icon: Building2 },
    { label: 'Rooms', to: '/admin/rooms', icon: BedDouble },
    { label: 'Room Types', to: '/admin/room-types', icon: Tag },
    { label: 'Seasonal Pricing', to: '/admin/pricing', icon: CalendarDays },
    { label: 'Availability & Blocks', to: '/admin/availability', icon: CalendarCheck2 },
    { label: 'Reservations', to: '/admin/reservations', icon: CalendarDays },
    { label: 'Refunds Queue', to: '/admin/refunds', icon: RotateCcw },
    { label: 'Coupons', to: '/admin/coupons', icon: TicketPercent },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: History },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden flex h-16 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-foreground hover:bg-muted"
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <span className="font-bold text-base">
            {isAdmin ? 'Admin Console' : 'Manager Portal'}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={toggleTheme} className="p-2 rounded-lg text-muted-foreground">
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link to="/" className="text-xs text-primary font-semibold flex items-center gap-1">
            Exit <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card flex flex-col transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-20 border-b border-border/80 flex items-center justify-between px-6">
          <BrandLogo
            size="sm"
            subtitle={isAdmin ? 'Admin Console' : 'Manager Portal'}
          />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Badge */}
        <div className="p-4 mx-4 my-3 rounded-2xl bg-muted/50 border border-border/60 flex items-center space-x-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
            {user?.first_name ? user.first_name[0].toUpperCase() : 'A'}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-bold truncate leading-tight">
              {user?.first_name} {user?.last_name || ''}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                {user?.role.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-border space-y-2">
          <Link
            to="/"
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-colors"
          >
            <span className="flex items-center gap-2">
              <ChevronLeft className="h-3.5 w-3.5" />
              Return to Guest Site
            </span>
            <ExternalLink className="h-3 w-3" />
          </Link>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
