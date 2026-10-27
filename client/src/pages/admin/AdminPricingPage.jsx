import React, { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
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
import { CalendarDays, Plus, Search, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPricingPage() {
  const [pricings, setPricings] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedPricing, setSelectedPricing] = useState(null);

  const [formData, setFormData] = useState({
    room_type_id: '',
    start_date: '',
    end_date: '',
    price_rupees: 7500,
    pricing_type: 'SEASONAL',
    status: 'ACTIVE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overlapError, setOverlapError] = useState('');

  const fetchData = async () => {
    try {
      const [pricingRes, typesRes] = await Promise.all([
        api.get('/admin/room-pricing'),
        api.get('/admin/room-types'),
      ]);
      setPricings(pricingRes.data.pricings || []);
      setRoomTypes(typesRes.data.room_types || []);

      if (typesRes.data.room_types?.length > 0 && !formData.room_type_id) {
        setFormData((prev) => ({
          ...prev,
          room_type_id: typesRes.data.room_types[0].room_type_id,
        }));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch pricing rules.'));
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
    setOverlapError('');
    try {
      await api.post('/admin/room-pricing', {
        room_type_id: formData.room_type_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        price_per_night: Math.round(Number(formData.price_rupees) * 100),
        pricing_type: formData.pricing_type,
        status: formData.status,
      });
      toast.success('Seasonal pricing period created successfully!');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create pricing period.');
      setOverlapError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedPricing) return;
    setIsSubmitting(true);
    setOverlapError('');
    try {
      await api.patch(`/admin/room-pricing/${selectedPricing.pricing_id}`, {
        start_date: formData.start_date,
        end_date: formData.end_date,
        price_per_night: Math.round(Number(formData.price_rupees) * 100),
        pricing_type: formData.pricing_type,
        status: formData.status,
      });
      toast.success('Pricing period updated successfully!');
      setEditModalOpen(false);
      fetchData();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update pricing period.');
      setOverlapError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (pricingId) => {
    if (!window.confirm(`Are you sure you want to delete seasonal pricing ${pricingId}?`)) return;
    try {
      await api.delete(`/admin/room-pricing/${pricingId}`);
      toast.success('Seasonal pricing rule removed.');
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete pricing rule.'));
    }
  };

  const openEditModal = (p) => {
    setSelectedPricing(p);
    setOverlapError('');
    setFormData({
      room_type_id: p.room_type_id,
      start_date: toUtcDateString(p.start_date),
      end_date: toUtcDateString(p.end_date),
      price_rupees: Math.round((p.price_per_night || 0) / 100),
      pricing_type: p.pricing_type || 'SEASONAL',
      status: p.status || 'ACTIVE',
    });
    setEditModalOpen(true);
  };

  const filtered = pricings.filter(
    (p) =>
      p.pricing_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.room_type_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.pricing_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Seasonal & Dynamic Pricing
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure seasonal dates, peak surcharges, and holiday price adjustments with overlap prevention.
          </p>
        </div>

        <Button
          variant="gold"
          onClick={() => {
            setOverlapError('');
            setFormData({
              room_type_id: roomTypes[0]?.room_type_id || '',
              start_date: '',
              end_date: '',
              price_rupees: 7500,
              pricing_type: 'SEASONAL',
              status: 'ACTIVE',
            });
            setCreateModalOpen(true);
          }}
          className="rounded-xl font-bold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Seasonal Period
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, room type or type..."
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
                  <th className="py-3.5 px-4">Rule ID</th>
                  <th className="py-3.5 px-4">Room Type</th>
                  <th className="py-3.5 px-4">Date Range (Inclusive - Exclusive)</th>
                  <th className="py-3.5 px-4">Seasonal Rate</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No seasonal pricing periods found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.pricing_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        {p.pricing_id}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">{p.room_type_id}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-foreground">
                          {formatDate(p.start_date)} – {formatDate(p.end_date)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-primary block">
                          {formatPaise(p.price_per_night)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {p.price_per_night} paise
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="outline">{p.pricing_type}</Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant={p.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(p)}
                          className="h-8 w-8 p-0"
                          title="Edit Pricing"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(p.pricing_id)}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          title="Delete Pricing"
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

      {/* Create Modal with Overlap Rejection */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Seasonal Pricing Period</DialogTitle>
            <DialogDescription>
              Define dates and override price. Overlapping active periods for the same room type will be rejected.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2 text-xs">
            {overlapError && (
              <div className="p-3 rounded-xl bg-destructive/10 text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{overlapError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Target Room Type</label>
              <select
                value={formData.room_type_id}
                onChange={(e) => setFormData({ ...formData, room_type_id: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                required
              >
                {roomTypes.map((rt) => (
                  <option key={rt.room_type_id} value={rt.room_type_id}>
                    {rt.name} ({rt.room_type_id} • {rt.property_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Start Date</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">End Date</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  min={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Nightly Rate (₹ INR)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.price_rupees}
                  onChange={(e) => setFormData({ ...formData, price_rupees: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Pricing Type</label>
                <select
                  value={formData.pricing_type}
                  onChange={(e) => setFormData({ ...formData, pricing_type: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                >
                  <option value="SEASONAL">SEASONAL</option>
                  <option value="WEEKEND">WEEKEND</option>
                  <option value="HOLIDAY">HOLIDAY</option>
                  <option value="BASE">BASE</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Validating & Creating...' : 'Save Pricing Rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Seasonal Pricing Rule</DialogTitle>
            <DialogDescription>
              Update rate or date interval. Overlap validation will be re-executed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 py-2 text-xs">
            {overlapError && (
              <div className="p-3 rounded-xl bg-destructive/10 text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{overlapError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Start Date</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">End Date</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  min={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Nightly Rate (₹ INR)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.price_rupees}
                  onChange={(e) => setFormData({ ...formData, price_rupees: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
