import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { formatPaise, formatDate } from '../lib/utils';
import {
  User,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form inputs
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    city: '',
    country: 'India',
  });

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const [meRes, paymentsRes, refundsRes] = await Promise.all([
          api.get('/guests/me'),
          api.get('/payments'),
          api.get('/refunds'),
        ]);

        const guestProfile = meRes.data.guest;
        setProfile(guestProfile);
        setPayments(paymentsRes.data.payments || []);
        setRefunds(refundsRes.data.refunds || []);

        setFormData({
          first_name: guestProfile.first_name || '',
          last_name: guestProfile.last_name || '',
          phone: guestProfile.phone || '',
          address: guestProfile.address || '',
          city: guestProfile.city || '',
          country: guestProfile.country || 'India',
        });
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to load profile details.'));
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.patch('/guests/me', formData);
      setProfile(res.data.guest);
      updateUser({
        first_name: res.data.guest.first_name,
        last_name: res.data.guest.last_name,
        phone: res.data.guest.phone,
      });
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <Skeleton className="h-12 w-64 rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
          Guest Account & Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal information, contact details, and transaction history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Profile Card & Edit Form */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="rounded-3xl border-border p-6 sm:p-8 bg-card shadow-soft space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl">
                {formData.first_name ? formData.first_name[0].toUpperCase() : 'U'}
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {formData.first_name} {formData.last_name}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3.5 w-3.5" /> {profile?.email}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="default">Guest ID: {profile?.guest_id}</Badge>
                  <Badge variant="gold">Aura Rewards Member</Badge>
                </div>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4 pt-4 border-t border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">First Name</label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Last Name</label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Phone Number</label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground">Address</label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Apartment, Street name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">City</label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Mumbai"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Country</label>
                  <Input
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="India"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button variant="gold" type="submit" disabled={isSaving} className="rounded-xl px-8 font-bold">
                  {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Payment History */}
          <Card className="rounded-3xl border-border p-6 sm:p-8 bg-card shadow-soft space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Payment History
            </h3>
            <p className="text-xs text-muted-foreground">
              All transactions charged for confirmed reservations.
            </p>

            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No payment transactions found.</p>
            ) : (
              <div className="space-y-3 pt-2">
                {payments.map((pay) => (
                  <div
                    key={pay.payment_id}
                    className="p-3.5 rounded-2xl bg-muted/30 border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{pay.payment_reference}</span>
                        <Badge variant="success">SUCCESS</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Reservation: {pay.reservation_id} • {pay.payment_method} • {formatDate(pay.created_at)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">{formatPaise(pay.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Refund History */}
          <Card className="rounded-3xl border-border p-6 sm:p-8 bg-card shadow-soft space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Refund History
            </h3>
            <p className="text-xs text-muted-foreground">
              Refunds processed back to your original payment method.
            </p>

            {refunds.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No refund records found.</p>
            ) : (
              <div className="space-y-3 pt-2">
                {refunds.map((ref) => (
                  <div
                    key={ref.refund_id}
                    className="p-3.5 rounded-2xl bg-muted/30 border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{ref.refund_reference}</span>
                        <Badge variant={ref.status === 'PROCESSED' ? 'success' : 'warning'}>
                          {ref.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Reservation: {ref.reservation_id} • {formatDate(ref.created_at)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatPaise(ref.refund_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Security & Session Info */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-border p-6 bg-card shadow-soft space-y-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Account Security
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your session is authenticated with short-lived tokens and cryptographic httpOnly refresh cookies.
            </p>
            <div className="p-3 rounded-2xl bg-muted/40 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Account Role:</span>
                <span className="font-semibold text-foreground uppercase">{user?.role}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>User ID:</span>
                <span className="font-mono text-foreground text-[10px]">{user?.user_id}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
