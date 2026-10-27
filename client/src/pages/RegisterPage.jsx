import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { BrandIcon } from '../components/layout/BrandLogo';
import { Lock, Mail, User, Phone, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Pre-validate email format with domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      const msg =
        'Please enter a valid email address with a domain extension (e.g. prabhakar@example.com or test@gmail.com).';
      setError(msg);
      toast.error(msg);
      setIsLoading(false);
      return;
    }

    // Pre-validate password criteria
    if (
      formData.password.length < 8 ||
      !/[A-Z]/.test(formData.password) ||
      !/[0-9]/.test(formData.password)
    ) {
      const msg =
        'Password must be at least 8 characters long and contain at least one uppercase letter and one number (e.g. Password@123).';
      setError(msg);
      toast.error(msg);
      setIsLoading(false);
      return;
    }

    if (formData.phone.trim().length < 7) {
      const msg = 'Phone number must be at least 7 digits.';
      setError(msg);
      toast.error(msg);
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        name: `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone.trim(),
      };

      await register(payload);
      toast.success('Registration successful! Welcome to Aura Stays.');
      navigate('/explore');
    } catch (err) {
      const msg = getErrorMessage(err, 'Registration failed. Please check your inputs.');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <BrandIcon size="lg" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Create an Account
          </h1>
          <p className="text-xs text-muted-foreground">
            Join Aura Stays for member perks, saved itineraries and exclusive seasonal coupons.
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">First Name</label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="Karan"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Last Name</label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Mehta"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="karan@example.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="e.g. Password@123"
                  className="pl-10"
                  required
                  minLength={8}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Minimum 8 characters with at least 1 uppercase letter and 1 number
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="pl-10"
                  required
                  minLength={7}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              disabled={isLoading}
              className="w-full rounded-2xl font-bold h-12 shadow-soft mt-2"
            >
              {isLoading ? 'Creating Account...' : 'Register'}
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
