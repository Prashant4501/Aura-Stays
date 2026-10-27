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
import { formatPaise } from '../../lib/utils';
import { Tag, Plus, Search, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRoomTypesPage() {
  const [roomTypes, setRoomTypes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRoomType, setSelectedRoomType] = useState(null);

  const [formData, setFormData] = useState({
    property_id: '',
    name: '',
    description: '',
    max_guests: 2,
    base_price_rupees: 5000,
    status: 'ACTIVE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [typesRes, propsRes] = await Promise.all([
        api.get('/admin/room-types'),
        api.get('/admin/properties'),
      ]);
      setRoomTypes(typesRes.data.room_types || []);
      setProperties(propsRes.data.properties || []);

      if (propsRes.data.properties?.length > 0 && !formData.property_id) {
        setFormData((prev) => ({
          ...prev,
          property_id: propsRes.data.properties[0].property_id,
        }));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch room types.'));
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
    try {
      await api.post('/admin/room-types', {
        property_id: formData.property_id,
        name: formData.name,
        description: formData.description,
        max_guests: Number(formData.max_guests),
        base_price_per_night: Math.round(Number(formData.base_price_rupees) * 100), // convert rupees to paise
        status: formData.status,
      });
      toast.success('Room type created successfully!');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create room type.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedRoomType) return;
    setIsSubmitting(true);
    try {
      await api.patch(`/admin/room-types/${selectedRoomType.room_type_id}`, {
        name: formData.name,
        description: formData.description,
        max_guests: Number(formData.max_guests),
        base_price_per_night: Math.round(Number(formData.base_price_rupees) * 100),
        status: formData.status,
      });
      toast.success('Room type updated successfully!');
      setEditModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update room type.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (rt) => {
    setSelectedRoomType(rt);
    setFormData({
      property_id: rt.property_id,
      name: rt.name,
      description: rt.description || '',
      max_guests: rt.max_guests,
      base_price_rupees: Math.round((rt.base_price_per_night || 0) / 100),
      status: rt.status,
    });
    setEditModalOpen(true);
  };

  const filtered = roomTypes.filter(
    (rt) =>
      rt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rt.room_type_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rt.property_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Room Types & Base Rates
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define suite classes, base overnight rates, and guest capacities for each property.
          </p>
        </div>

        <Button
          variant="gold"
          onClick={() => {
            setFormData({
              property_id: properties[0]?.property_id || '',
              name: '',
              description: '',
              max_guests: 2,
              base_price_rupees: 5000,
              status: 'ACTIVE',
            });
            setCreateModalOpen(true);
          }}
          className="rounded-xl font-bold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Room Type
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search room types or property..."
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
                  <th className="py-3.5 px-4">Room Type</th>
                  <th className="py-3.5 px-4">Property</th>
                  <th className="py-3.5 px-4">Base Rate (paise / ₹)</th>
                  <th className="py-3.5 px-4">Max Capacity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No room types found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((rt) => (
                    <tr key={rt.room_type_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-foreground block">{rt.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{rt.room_type_id}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">{rt.property_id}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-primary block">
                          {formatPaise(rt.base_price_per_night)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {rt.base_price_per_night} paise
                        </span>
                      </td>
                      <td className="py-3.5 px-4">{rt.max_guests} Guests</td>
                      <td className="py-3.5 px-4">
                        <Badge variant={rt.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {rt.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(rt)}
                          className="h-8 w-8 p-0"
                          title="Edit Room Type"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
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
            <DialogTitle>Add New Room Type</DialogTitle>
            <DialogDescription>
              Define room category specifications and standard nightly pricing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Property</label>
              <select
                value={formData.property_id}
                onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                required
              >
                {properties.map((p) => (
                  <option key={p.property_id} value={p.property_id}>
                    {p.name} ({p.property_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Room Type Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Royal Ocean Villa"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Spacious luxury suite with panoramic views..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Base Rate (₹ INR)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.base_price_rupees}
                  onChange={(e) => setFormData({ ...formData, base_price_rupees: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Max Guests</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.max_guests}
                  onChange={(e) => setFormData({ ...formData, max_guests: e.target.value })}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Room Type'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Room Type</DialogTitle>
            <DialogDescription>
              Update category name, description, capacity, or base pricing.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Room Type Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Base Rate (₹ INR)</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.base_price_rupees}
                  onChange={(e) => setFormData({ ...formData, base_price_rupees: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Max Guests</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.max_guests}
                  onChange={(e) => setFormData({ ...formData, max_guests: e.target.value })}
                  required
                />
              </div>
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
