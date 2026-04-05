import exifr from 'exifr';

self.onmessage = async (e: MessageEvent) => {
  try {
    const file = e.data as File;

    // 1. Extract EXIF
    let exifData = {
      lat: null as number | null,
      lon: null as number | null,
      time: null as string | null,
      date: null as string | null, // <--- Added this line
      make: null as string | null,
      model: null as string | null,
    };
    try {
      const parsed = await exifr.parse(file);
      if (parsed) {
        // 1. Extract GPS
        if (parsed.latitude && parsed.longitude) {
          exifData.lat = parsed.latitude;
          exifData.lon = parsed.longitude;
        }
        
        // 2. Extract Date AND Time
        if (parsed.DateTimeOriginal) {
          const d = new Date(parsed.DateTimeOriginal);
          if (!isNaN(d.getTime())) {
            // Keep the time exactly as you had it
            exifData.time = d.toTimeString().split(' ')[0];
            
            // Extract and save the date properly (Local time YYYY-MM-DD)
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            exifData.date = `${year}-${month}-${day}`;
          }
        }
        
        // 3. Extract Camera Make & Model
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