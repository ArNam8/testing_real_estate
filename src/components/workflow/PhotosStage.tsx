import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ArrowRight, Camera, X, AlertCircle, ImageOff, Loader2, Star } from 'lucide-react';
import { propertiesService, getDocumentSignedUrl } from '../../services/supabase';
import type { OutputType, RoomPhoto, RoomPhotoCollection } from '../../services/supabase';

interface PhotosStageProps {
  propertyId: string;
  userId: string;
  selectedOutputs: OutputType[];
  onComplete: () => void;
  onBack: () => void;
}

const ROOM_PHOTO_OUTPUT: OutputType = 'listing_pack';
const MAX_PHOTOS_PER_ROOM = 5;

type PhotoMap = Record<string, RoomPhoto[]>;

function slugifyRoomName(name: string, index: number): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug ? `${index}-${slug}` : `room-${index}`;
}

function extractRoomNames(extractionData: Record<string, unknown> | null | undefined): string[] {
  try {
    const rooms = (extractionData as Record<string, unknown> | undefined)?.rooms as { value?: unknown } | undefined;
    if (!Array.isArray(rooms?.value)) return [];
    return rooms.value
      .map((room) => ((room as Record<string, unknown> | undefined)?.name as { value?: unknown } | undefined)?.value)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0 && name !== 'not mentioned')
      .map((name) => name.trim());
  } catch (err) {
    console.warn('[PhotosStage] could not read room names:', err);
    return [];
  }
}

/** Converts both the legacy room -> photo shape and the new room -> photos shape. */
function normalizePhotoMap(raw: RoomPhotoCollection | null | undefined): PhotoMap {
  const result: PhotoMap = {};
  for (const [room, value] of Object.entries(raw ?? {})) {
    const list = Array.isArray(value) ? value : [value];
    result[room] = list.filter((photo): photo is RoomPhoto =>
      !!photo && typeof photo.path === 'string' && typeof photo.width === 'number' && typeof photo.height === 'number'
    );
  }
  return result;
}

function makePhotoId(photo: RoomPhoto, index: number): string {
  return photo.id ?? `${photo.path}-${index}`;
}

function RoomPhotoRow({
  roomName, photos, onUpload, onRemove, onSetPrimary,
}: {
  roomName: string;
  photos: RoomPhoto[];
  onUpload: (file: File) => void;
  onRemove: (photo: RoomPhoto) => void;
  onSetPrimary: (photo: RoomPhoto) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, string> = {};
      await Promise.all(photos.map(async (photo, index) => {
        try {
          next[makePhotoId(photo, index)] = await getDocumentSignedUrl(photo.path);
        } catch (err) {
          console.warn('[PhotosStage] thumbnail unavailable:', roomName, err);
          if (!cancelled) setThumbErrors((prev) => ({ ...prev, [makePhotoId(photo, index)]: true }));
        }
      }));
      if (!cancelled) setThumbUrls(next);
    };
    setThumbUrls({});
    setThumbErrors({});
    if (photos.length > 0) load();
    return () => { cancelled = true; };
  }, [photos, roomName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await onUpload(file); } finally { setBusy(false); }
  };

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: '#1a2e45' }}>{roomName}</p>
          <p className="text-xs mt-0.5" style={{ color: '#9a9488' }}>
            {photos.length === 0 ? 'No photos — optional' : `${photos.length}/${MAX_PHOTOS_PER_ROOM} photo${photos.length === 1 ? '' : 's'} attached`}
          </p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <button onClick={() => inputRef.current?.click()} disabled={busy || photos.length >= MAX_PHOTOS_PER_ROOM} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5" style={{ background: '#1e3a5f', color: 'white' }} title={photos.length >= MAX_PHOTOS_PER_ROOM ? 'Maximum of 5 photos per room' : undefined}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          {busy ? 'Uploading…' : photos.length >= MAX_PHOTOS_PER_ROOM ? '5/5 photos' : photos.length > 0 ? 'Add photo' : 'Upload'}
        </button>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo, index) => {
            const id = makePhotoId(photo, index);
            const isPrimary = index === 0;
            return (
              <div key={id} className="relative overflow-hidden rounded-xl border" style={{ borderColor: isPrimary ? '#6FAF9A' : 'rgba(226,220,210,0.8)' }}>
                <div className="h-24 bg-slate-100 flex items-center justify-center">
                  {thumbUrls[id] && !thumbErrors[id] ? <img src={thumbUrls[id]} alt={`${roomName} photo ${index + 1}`} className="w-full h-full object-cover" /> : thumbErrors[id] ? <ImageOff size={18} style={{ color: '#9a9488' }} /> : <Loader2 size={16} className="animate-spin text-slate-300" />}
                </div>
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  {isPrimary && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.92)', color: '#1F7A52' }}>Primary</span>}
                </div>
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  {!isPrimary && <button onClick={() => onSetPrimary(photo)} className="w-6 h-6 rounded-md flex items-center justify-center" aria-label={`Make photo ${index + 1} primary`} style={{ background: 'rgba(255,255,255,0.92)', color: '#1e3a5f' }}><Star size={12} /></button>}
                  <button onClick={() => onRemove(photo)} className="w-6 h-6 rounded-md flex items-center justify-center" aria-label={`Remove photo ${index + 1}`} style={{ background: 'rgba(255,255,255,0.92)', color: '#dc2626' }}><X size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PhotosStage({ propertyId, userId, selectedOutputs, onComplete, onBack }: PhotosStageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoMap>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const needsPhotos = selectedOutputs.includes(ROOM_PHOTO_OUTPUT);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!needsPhotos) { setLoading(false); return; }
      setLoading(true); setLoadError(null);
      try {
        const prop = await propertiesService.getById(propertyId);
        if (cancelled) return;
        setRooms(extractRoomNames(prop.extraction_data));
        setPhotos(normalizePhotoMap(prop.room_photos));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? `Could not load room details: ${err.message}` : 'Could not load room details.');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [propertyId, needsPhotos]);

  const persistPhotos = useCallback(async (next: PhotoMap) => {
    await propertiesService.update(propertyId, { room_photos: next });
  }, [propertyId]);

  const commit = useCallback(async (next: PhotoMap) => {
    setPhotos(next);
    try { await persistPhotos(next); }
    catch (err) { setActionError(err instanceof Error ? `Photo change could not be saved: ${err.message}` : 'Photo change could not be saved. Please try again.'); }
  }, [persistPhotos]);

  const handleUpload = useCallback(async (roomName: string, index: number, file: File) => {
    setActionError(null);
    const existing = photos[roomName] ?? [];
    if (existing.length >= MAX_PHOTOS_PER_ROOM) {
      setActionError(`A room can have up to ${MAX_PHOTOS_PER_ROOM} photos. Remove one before adding another.`);
      return;
    }
    try {
      const photo = await propertiesService.uploadRoomPhoto(propertyId, userId, slugifyRoomName(roomName, index), file);
      await commit({ ...photos, [roomName]: [...existing, photo] });
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Photo upload failed. Please try again.'); }
  }, [propertyId, userId, photos, commit]);

  const handleRemove = useCallback(async (roomName: string, photo: RoomPhoto) => {
    setActionError(null);
    const nextList = (photos[roomName] ?? []).filter((item) => item.path !== photo.path);
    const next = { ...photos, [roomName]: nextList };
    await commit(next);
    await propertiesService.removeRoomPhoto(photo.path);
  }, [photos, commit]);

  const handleSetPrimary = useCallback(async (roomName: string, photo: RoomPhoto) => {
    const list = photos[roomName] ?? [];
    const nextList = [photo, ...list.filter((item) => item.path !== photo.path)];
    await commit({ ...photos, [roomName]: nextList });
  }, [photos, commit]);

  if (loading) return <div className="flex flex-col items-center justify-center py-16 gap-3"><Loader2 size={24} className="animate-spin" style={{ color: '#1e3a5f' }} /><p className="text-sm" style={{ color: '#9a9488' }}>Loading room details…</p></div>;

  if (!needsPhotos) return (
    <div className="animate-fade-in"><div className="mb-6"><h1 className="text-2xl font-bold mb-1" style={{ color: '#1a2e45' }}>Photos</h1><p className="text-sm" style={{ color: '#7a8899' }}>No photos needed for the documents you selected</p></div><div className="card p-5 mb-6 flex items-start gap-3"><Camera size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#9a9488' }} /><p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>Only the Property Listing Pack includes room photos. You did not select it this time, so there is nothing to add here.</p></div><button onClick={onComplete} className="btn-primary w-full">Continue <ArrowRight size={16} /></button><button onClick={onBack} className="btn-ghost w-full mt-2"><ChevronLeft size={16} /> Back</button></div>
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-6"><h1 className="text-2xl font-bold mb-1" style={{ color: '#1a2e45' }}>Add photos (optional)</h1><p className="text-sm" style={{ color: '#7a8899' }}>Add as many photos as you like for each room. The first photo is used as the primary image.</p></div>
      {loadError && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2"><AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" /><p className="text-amber-700 text-xs leading-relaxed">{loadError} You can still continue without photos.</p></div>}
      {actionError && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2"><AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" /><p className="text-red-700 text-xs leading-relaxed">{actionError}</p></div>}
      {rooms.length === 0 && !loadError ? <div className="card p-5 mb-6 flex items-start gap-3"><Camera size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#9a9488' }} /><p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>No individual rooms were detected, so there is nothing to attach photos to. You can continue.</p></div> : <div className="space-y-3 mb-6">{rooms.map((roomName, i) => <RoomPhotoRow key={`${roomName}-${i}`} roomName={roomName} photos={photos[roomName] ?? []} onUpload={(file) => handleUpload(roomName, i, file)} onRemove={(photo) => handleRemove(roomName, photo)} onSetPrimary={(photo) => handleSetPrimary(roomName, photo)} />)}</div>}
      <button onClick={onComplete} className="btn-primary w-full">Continue <ArrowRight size={16} /></button><button onClick={onBack} className="btn-ghost w-full mt-2"><ChevronLeft size={16} /> Back</button>
    </div>
  );
}
