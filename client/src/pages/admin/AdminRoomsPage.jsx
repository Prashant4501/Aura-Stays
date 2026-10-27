import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { BedDouble, Plus, Search, Edit2, CalendarX2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminRoomsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [properties, setProperties] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);

  const [formData, setFormData] = useState({
    property_id: '',
    room_type_id: '',
    room_number: '',
    floor: 1,
    max_guests: 2,
    status: 'ACTIVE',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [roomsRes, propsRes, typesRes] = await Promise.all([
        api.get('/admin/rooms'),
        api.get('/admin/properties'),
        api.get('/admin/room-types'),
      ]);
      setRooms(roomsRes.data.rooms || []);
      setProperties(propsRes.data.properties || []);
      setRoomTypes(typesRes.data.room_types || []);

      if (propsRes.data.properties?.length > 0 && !formData.property_id) {
        setFormData((prev) => ({
          ...prev,
          property_id: propsRes.data.properties[0].property_id,
          room_type_id: typesRes.data.room_types?.[0]?.room_type_id || '',
        }));
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to fetch room management data.'));
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
      await api.post('/admin/rooms', {
        ...formData,
        floor: Number(formData.floor),
        max_guests: Number(formData.max_guests),
      });
      toast.success('Room created successfully!');
      setCreateModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create room.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!selectedRoom) return;
    setIsSubmitting(true);
    try {
      await api.patch(`/admin/rooms/${selectedRoom.room_id}`, {
        room_number: formData.room_number,
        floor: Number(formData.floor),
        max_guests: Number(formData.max_guests),
        status: formData.status,
      });
      toast.success('Room updated successfully! Existing confirmed reservations remain intact.');
      setEditModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update room.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (room) => {
    setSelectedRoom(room);
    setFormData({
      property_id: room.property_id,
      room_type_id: room.room_type_id,
      room_number: room.room_number,
      floor: room.floor,
      max_guests: room.max_guests,
      status: room.status,
    });
    setEditModalOpen(true);
  };

  const filteredRooms = rooms.filter((r) => {
    const matchesSearch =
      r.room_number.includes(searchQuery) ||
      r.room_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProp = selectedPropertyId ? r.property_id === selectedPropertyId : true;
    return matchesSearch && matchesProp;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            Rooms Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure room inventory, operational statuses (ACTIVE, INACTIVE, MAINTENANCE), and date blocking.
          </p>
        </div>

        <Button
          variant="gold"
          onClick={() => {
            setFormData({
              property_id: properties[0]?.property_id || '',
              room_type_id: roomTypes[0]?.room_type_id || '',
              room_number: '',
              floor: 1,
              max_guests: 2,
              status: 'ACTIVE',
            });
            setCreateModalOpen(true);
          }}
          className="rounded-xl font-bold flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Room
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search room number or ID..."
            className="pl-10 h-10 rounded-xl"
          />
        </div>

        <select
          value={selectedPropertyId}
          onChange={(e) => setSelectedPropertyId(e.target.value)}
          className="h-10 px-3 rounded-xl border border-input bg-card text-xs font-semibold focus:outline-none"
        >
          <option value="">All Managed Properties</option>
          {properties.map((p) => (
            <option key={p.property_id} value={p.property_id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
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
                  <th className="py-3.5 px-4">Room #</th>
                  <th className="py-3.5 px-4">Property</th>
                  <th className="py-3.5 px-4">Room Type</th>
                  <th className="py-3.5 px-4">Floor</th>
                  <th className="py-3.5 px-4">Max Guests</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No rooms found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((room) => (
                    <tr key={room.room_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-foreground block">
                          Room {room.room_number}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {room.room_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">{room.property_id}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{room.room_type_id}</td>
                      <td className="py-3.5 px-4">{room.floor}</td>
                      <td className="py-3.5 px-4">{room.max_guests}</td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            ['ACTIVE', 'AVAILABLE'].includes(room.status)
                              ? 'success'
                              : room.status === 'MAINTENANCE'
                              ? 'warning'
                              : 'destructive'
                          }
                        >
                          {room.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(room)}
                          className="h-8 w-8 p-0"
                          title="Edit Room & Status"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            navigate(`/admin/availability?property_id=${room.property_id}&room_id=${room.room_id}`)
                          }
                          className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-500/10"
                          title="Block / Unblock Dates"
                        >
                          <CalendarX2 className="h-3.5 w-3.5" />
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

      {/* Create Room Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Room to Property</DialogTitle>
            <DialogDescription>
              Assign a physical room number, floor, and room category.
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
              <label className="font-semibold text-foreground">Room Type</label>
              <select
                value={formData.room_type_id}
                onChange={(e) => setFormData({ ...formData, room_type_id: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                required
              >
                {roomTypes
                  .filter((rt) => rt.property_id === formData.property_id)
                  .map((rt) => (
                    <option key={rt.room_type_id} value={rt.room_type_id}>
                      {rt.name} ({rt.room_type_id})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Room Number</label>
                <Input
                  value={formData.room_number}
                  onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                  placeholder="302"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Floor</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Room'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Room Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Room #{selectedRoom?.room_number}</DialogTitle>
            <DialogDescription>
              Update operational status or specifications. Rule: Deactivating a room does not affect existing confirmed reservations.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Room Number</label>
                <Input
                  value={formData.room_number}
                  onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Floor</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background font-semibold focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="AVAILABLE">AVAILABLE</option>
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
