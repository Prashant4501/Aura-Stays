import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/button';
import BrandLogo from './BrandLogo';
import {
  Compass,
  CalendarDays,
  User,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  LayoutDashboard,
  Shield,
} from 'lucide-react';

export default function Navbar() {
  const { user, isAuthenticated, isManager, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md transition-colors">
      <div className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <BrandLogo />

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
          <Link
            to="/explore"
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isActive('/explore')
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Compass className="h-4 w-4" />
            Explore Stays
          </Link>

          {isAuthenticated && (
            <Link
              to="/my-bookings"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isActive('/my-bookings')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              My Bookings
            </Link>
          )}

          {(isManager || isAdmin) && (
            <Link
              to="/admin/dashboard"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                location.pathname.startsWith('/admin')
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              {isAdmin ? 'Admin Console' : 'Manager Portal'}
            </Link>
          )}
        </nav>

        {/* Right Actions: Theme Toggle & User Auth */}
        <div className="hidden md:flex items-center space-x-3">
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
          </button>

          {isAuthenticated ? (
            <div className="flex items-center space-x-2 pl-2">
              <Link
                to="/profile"
                className="flex items-center space-x-2.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                  {user.first_name ? user.first_name[0].toUpperCase() : 'U'}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold leading-tight truncate max-w-[110px]">
                    {user.first_name || user.email.split('@')[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {user.role.toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Log out"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button variant="default" onClick={() => navigate('/register')}>
                Register
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center space-x-2">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-input text-muted-foreground"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-foreground hover:bg-muted"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background px-4 py-6 space-y-4">
          <nav className="flex flex-col space-y-2">
            <Link
              to="/explore"
              onClick={() => setMobileMenuOpen(false)}
              className="px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-muted"
            >
              Explore Stays
            </Link>
            {isAuthenticated && (
              <Link
                to="/my-bookings"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-muted"
              >
                My Bookings
              </Link>
            )}
            {(isManager || isAdmin) && (
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-amber-600 bg-amber-500/10"
              >
                {isAdmin ? 'Admin Console' : 'Manager Portal'}
              </Link>
            )}
            {isAuthenticated && (
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-muted"
              >
                My Profile
              </Link>
            )}
          </nav>

          <div className="pt-4 border-t border-border flex flex-col space-y-2">
            {isAuthenticated ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full"
              >
                Log Out
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/login');
                  }}
                  className="w-full"
                >
                  Sign In
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/register');
                  }}
                  className="w-full"
                >
                  Create Account
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
