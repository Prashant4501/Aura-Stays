import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { formatPaise, formatDate, toUtcDateString } from '../../lib/utils';
import { TicketPercent, Plus, Search, Trash2, Tag, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminCouponsPage() {
  const { user, isAdmin } = useAuth();

  const [coupons, setCoupons] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'PERCENTAGE',
    discount_value: 15,
    maximum_discount_rupees: 1500,
    minimum_booking_rupees: 3000,
    usage_limit: 50,
    per_customer_limit: 1,
    valid_from: toUtcDateString(new Date()),
    valid_until: toUtcDateString(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)),
    applicable_property_id: '',
    status: 'ACTIVE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchData = async () => {
    try {
      const [couponsRes, propsRes] = await Promise.all([
        api.get('/admin/coupons'),
        api.get('/admin/properties'),
      ]);
      setCoupons(couponsRes.data.coupons || []);
      const propList = propsRes.data.properties || [];
      setProperties(propList);

      if (propList.length > 0 && !formData.applicable_property_id) {
        setFormData((prev) => ({
          ...prev,
          applicable_property_id: propList[0].property_id,
        }));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch coupons.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');
    try {
      await api.post('/admin/coupons', {
        code: formData.code.trim().toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: Number(formData.discount_value),
        maximum_discount: Math.round(Number(formData.maximum_discount_rupees) * 100),
        minimum_booking_amount: Math.round(Number(formData.minimum_booking_rupees) * 100),
        usage_limit: Number(formData.usage_limit),
        per_customer_limit: Number(formData.per_customer_limit),
        valid_from: formData.valid_from,
        valid_until: formData.valid_until,
        applicable_property_id: formData.applicable_property_id || null,
        status: formData.status,
      });
      toast.success('Coupon created successfully!');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create coupon.');
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (couponId) => {
    if (!window.confirm(`Are you sure you want to delete coupon ${couponId}?`)) return;
    try {
      await api.delete(`/admin/coupons/${couponId}`);
      toast.success('Coupon removed.');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete coupon.'));
    }
  };

  const filtered = coupons.filter(
    (c) =>
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.coupon_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Coupons & Marketing Offers
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure promotional percentage and fixed discounts, redemption caps, and validity windows.
          </p>
        </div>

        <Button
          variant="gold"
          onClick={() => {
            setFormError('');
            setFormData({
              code: '',
              discount_type: 'PERCENTAGE',
              discount_value: 15,
              maximum_discount_rupees: 1500,
              minimum_booking_rupees: 3000,
              usage_limit: 50,
              per_customer_limit: 1,
              valid_from: toUtcDateString(new Date()),
              valid_until: toUtcDateString(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)),
              applicable_property_id: properties[0]?.property_id || '',
              status: 'ACTIVE',
            });
            setCreateModalOpen(true);
          }}
          className="rounded-xl font-bold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Coupon
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code or ID..."
            className="pl-10 h-10 rounded-xl"
          />
        </div>
      </div>

      <Card className="rounded-3xl border-border overflow-hidden shadow-soft">
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Coupon Code</th>
                  <th className="py-3.5 px-4">Discount</th>
                  <th className="py-3.5 px-4">Max Cap / Min Spend</th>
                  <th className="py-3.5 px-4">Usage (Used / Limit)</th>
                  <th className="py-3.5 px-4">Validity</th>
                  <th className="py-3.5 px-4">Target Property</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No coupons found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.coupon_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-foreground text-sm block">
                          {c.code}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">{c.coupon_id}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="gold">
                          {c.discount_type === 'PERCENTAGE'
                            ? `${c.discount_value}% OFF`
                            : `${formatPaise(c.discount_value)} FLAT`}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-foreground block">
                          Cap: {formatPaise(c.maximum_discount)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          Min: {formatPaise(c.minimum_booking_amount)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {c.used_count || 0} / {c.usage_limit}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-muted-foreground block text-[10px]">
                          {formatDate(c.valid_from)} to {formatDate(c.valid_until)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {c.applicable_property_id || <span className="text-muted-foreground">Global</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={c.status === 'ACTIVE' ? 'success' : 'destructive'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(c.coupon_id)}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          title="Delete Coupon"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Promotional Coupon</DialogTitle>
            <DialogDescription>
              Create a percentage or fixed discount code with server-side validation rules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2 text-xs">
            {formError && (
              <div className="p-3 rounded-xl bg-destructive/10 text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Coupon Code</label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="SUMMER20"
                className="uppercase font-bold tracking-wider"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Discount Type</label>
                <select
                  value={formData.discount_type}
                  onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                >
                  <option value="PERCENTAGE">PERCENTAGE (%)</option>
                  <option value="FIXED">FIXED AMOUNT (₹)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">
                  {formData.discount_type === 'PERCENTAGE' ? 'Discount %' : 'Discount (₹)'}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Max Cap (₹)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.maximum_discount_rupees}
                  onChange={(e) => setFormData({ ...formData, maximum_discount_rupees: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Min Booking (₹)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.minimum_booking_rupees}
                  onChange={(e) => setFormData({ ...formData, minimum_booking_rupees: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Total Usage Limit</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.usage_limit}
                  onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Target Property</label>
                <select
                  value={formData.applicable_property_id}
                  onChange={(e) => setFormData({ ...formData, applicable_property_id: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                  required={!isAdmin}
                >
                  {isAdmin && <option value="">Global (All Properties)</option>}
                  {properties.map((p) => (
                    <option key={p.property_id} value={p.property_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Valid From</label>
                <Input
                  type="date"
                  value={formData.valid_from}
                  onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Valid Until</label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  min={formData.valid_from}
                  onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Coupon'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
