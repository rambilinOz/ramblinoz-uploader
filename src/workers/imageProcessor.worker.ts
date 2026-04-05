import exifr from 'exifr';

self.onmessage = async (e: MessageEvent) => {
  try {
    const file = e.data as File;

    // 1. Extract EXIF
    let exifData = {
      lat: null as number | null,
      lon: null as number | null,
      time: null as string | null,
      make: null as string | null,
      model: null as string | null,
    };
    try {
      const parsed = await exifr.parse(file);
      if (parsed) {
        if (parsed.latitude && parsed.longitude) {
          exifData.lat = parsed.latitude;
          exifData.lon = parsed.longitude;
        }
        if (parsed.DateTimeOriginal) {
          const d = new Date(parsed.DateTimeOriginal);
          if (!isNaN(d.getTime()))
            exifData.time = d.toTimeString().split(' ')[0];
        }
        if (parsed.Make) exifData.make = parsed.Make;
        if (parsed.Model) exifData.model = parsed.Model;
      }
    } catch (err) {
      console.warn('EXIF extraction failed', err);
    }

    // 2. Compress Image
    const bitmap = await createImageBitmap(file);
    const MAX_W = 1200;
    const scale = bitmap.width > MAX_W ? MAX_W / bitmap.width : 1;
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;

    const canvas = new OffscreenCanvas(width, height);

    // FIX 1: Explicitly tell TypeScript this is a 2D context
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, 0, 0, width, height);

    // FIX 2: Explicitly bypass TypeScript's strict canvas interface for convertToBlob
    const blob = await (canvas as any).convertToBlob({
      type: 'image/webp',
      quality: 0.82,
    });

    const newName = file.name.replace(/\.[^/.]+$/, '') + '.webp';

    self.postMessage({
      success: true,
      blob: blob,
      originalName: file.name,
      newName: newName,
      exif: exifData,
    });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message });
  }
};
