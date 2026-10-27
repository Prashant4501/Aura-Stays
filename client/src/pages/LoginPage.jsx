import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { BrandIcon } from '../components/layout/BrandLogo';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const loggedUser = await login(email, password);
      toast.success(`Welcome back, ${loggedUser.first_name || 'Guest'}!`);

      if (from) {
        navigate(from, { replace: true });
      } else if (loggedUser.role === 'ADMIN' || loggedUser.role === 'PROPERTY_MANAGER') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/explore', { replace: true });
      }
    } catch (err) {
      const msg = getErrorMessage(err, 'Invalid email or password.');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick fill helper for testing & demoing
  const quickLogin = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Password@123');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <BrandIcon size="lg" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Sign In to Aura Stays
          </h1>
          <p className="text-xs text-muted-foreground">
            Access your reservations, curated rewards, or administration console.
          </p>
        </div>

        <Card className="rounded-3xl border-border bg-card shadow-soft-lg p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-2xl bg-destructive/20 border border-destructive/40 text-red-400 text-xs font-semibold flex items-center gap-2.5 animate-fade-in shadow-soft">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-foreground">Password</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              disabled={isLoading}
              className="w-full rounded-2xl font-bold h-12 shadow-soft mt-2"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          {/* Demo User Fast-Access Pills */}
          <div className="mt-6 pt-6 border-t border-border space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block text-center">
              Quick Demo Accounts (Password: Password@123)
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => quickLogin('guest1@example.com')}
                className="p-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-left transition-colors"
              >
                <strong className="block text-foreground text-[11px]">Guest 1</strong>
                <span className="text-[10px] text-muted-foreground">guest1@example.com</span>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('guest2@example.com')}
                className="p-2 rounded-xl border border-border bg-muted/40 hover:bg-muted text-left transition-colors"
              >
                <strong className="block text-foreground text-[11px]">Guest 2</strong>
                <span className="text-[10px] text-muted-foreground">guest2@example.com</span>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('manager1@example.com')}
                className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-left transition-colors"
              >
                <strong className="block text-amber-600 dark:text-amber-400 text-[11px]">
                  Manager 1 (Mumbai)
                </strong>
                <span className="text-[10px] text-muted-foreground">manager1@example.com</span>
              </button>
              <button
                type="button"
                onClick={() => quickLogin('admin@example.com')}
                className="p-2 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-left transition-colors"
              >
                <strong className="block text-primary text-[11px]">Administrator</strong>
                <span className="text-[10px] text-muted-foreground">admin@example.com</span>
              </button>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/register" className="font-bold text-primary hover:underline">
            Create an Account
          </Link>
        </p>
      </div>
    </div>
  );
}
