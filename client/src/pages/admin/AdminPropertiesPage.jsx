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
import { Building, Plus, Search, Edit2, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPropertiesPage() {
  const { user, isAdmin } = useAuth();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProp, setSelectedProp] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    property_type: 'HOTEL',
    address: '',
    city: '',
    state: '',
    country: 'India',
    manager_user_id: user?.user_id || 'USR-002',
    status: 'ACTIVE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProperties = async () => {
    try {
      const res = await api.get('/admin/properties');
      setProperties(res.data.properties || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch properties.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/admin/properties', formData);
      toast.success('Property created successfully!');
      setCreateModalOpen(false);
      fetchProperties();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create property.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedProp) return;
    setIsSubmitting(true);
    try {
      await api.patch(`/admin/properties/${selectedProp.property_id}`, formData);
      toast.success('Property updated successfully!');
      setEditModalOpen(false);
      fetchProperties();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update property.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (propId) => {
    if (!window.confirm(`Are you sure you want to delete property ${propId}?`)) return;
    try {
      await api.delete(`/admin/properties/${propId}`);
      toast.success('Property deleted successfully.');
      fetchProperties();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete property.'));
    }
  };

  const openEditModal = (prop) => {
    setSelectedProp(prop);
    setFormData({
      name: prop.name || '',
      description: prop.description || '',
      property_type: prop.property_type || 'HOTEL',
      address: prop.address || '',
      city: prop.city || '',
      state: prop.state || '',
      country: prop.country || 'India',
      manager_user_id: prop.manager_user_id || '',
      status: prop.status || 'ACTIVE',
    });
    setEditModalOpen(true);
  };

  const filteredProperties = properties.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.property_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Property Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAdmin ? 'All properties across the network' : 'Properties assigned to your manager profile'}
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="gold"
            onClick={() => {
              setFormData({
                name: '',
                description: '',
                property_type: 'HOTEL',
                address: '',
                city: '',
                state: '',
                country: 'India',
                manager_user_id: user?.user_id || 'USR-002',
                status: 'ACTIVE',
              });
              setCreateModalOpen(true);
            }}
            className="rounded-xl font-bold flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Property
          </Button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, city or ID..."
            className="pl-10 h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Properties Table */}
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
                  <th className="py-3.5 px-4">Property</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Manager ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredProperties.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No properties found.
                    </td>
                  </tr>
                ) : (
                  filteredProperties.map((p) => (
                    <tr key={p.property_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-foreground block">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.property_id}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="outline">{p.property_type}</Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-foreground">{p.city}</span>
                        <span className="text-muted-foreground block text-[10px]">{p.address}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground">{p.manager_user_id}</td>
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
                          title="Edit Property"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(p.property_id)}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            title="Delete Property"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Property Modal (ADMIN only) */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Boutique Property</DialogTitle>
            <DialogDescription>
              Register a new hotel, resort or villa to the platform portfolio.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Property Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Grand Heritage Palace"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Property Type</label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="RESORT">Resort</option>
                  <option value="VILLA">Villa</option>
                  <option value="APARTMENT">Apartment</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Manager User ID</label>
                <Input
                  value={formData.manager_user_id}
                  onChange={(e) => setFormData({ ...formData, manager_user_id: e.target.value })}
                  placeholder="USR-002"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Street Address</label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Marine Drive, Nariman Point"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">City</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Mumbai"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-foreground">State</label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="Maharashtra"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Property'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Property Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Property Details</DialogTitle>
            <DialogDescription>
              Update property specifications, status, or location details.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Property Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Property Type</label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="RESORT">Resort</option>
                  <option value="VILLA">Villa</option>
                  <option value="APARTMENT">Apartment</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-xs font-semibold focus:outline-none"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Address</label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">City</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-foreground">State</label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
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
