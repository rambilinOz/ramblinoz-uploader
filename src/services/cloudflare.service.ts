export const CloudflareService = {
  
  async uploadToVault(blob: Blob, exif: any, fileName: string) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing");

    const token = localStorage.getItem('oz_token');
    
    // --- DEBUGGING: THIS LETS YOU SEE THE TRUTH ---
    console.log("EXIF Data extracted from image:", exif);

    // 1. Better Date & Time Extraction
    let folderDate = new Date().toISOString().split('T')[0];
    let photoTime = null;

    // Check for common Date tag names
    const rawDate = exif.DateTimeOriginal || exif.CreateDate || exif.DateTime;

    if (rawDate) {
      if (rawDate instanceof Date) {
        folderDate = rawDate.toISOString().split('T')[0];
        photoTime = rawDate.toTimeString().split(' ')[0]; 
      } else if (typeof rawDate === 'string') {
        const parts = rawDate.split(' ');
        if (parts.length === 2) {
          folderDate = parts[0].replace(/:/g, '-');
          photoTime = parts[1]; 
        }
      }
    }

    // 2. Better GPS Extraction (Check both common naming styles)
    const lat = exif.latitude || exif.GPSLatitude || null;
    const lon = exif.longitude || exif.GPSLongitude || null;

    const newFileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";

    const formData = new FormData();
    formData.append('date', folderDate);
    formData.append('file_0', blob, newFileName);
    formData.append('replaces_0', fileName);
    
    // 3. Package the metadata for your D1 database
    formData.append('metadata', JSON.stringify({
      lat: lat,
      lon: lon,
      make: exif.Make || exif.make || 'Unknown',
      model: exif.Model || exif.model || 'Unknown',
      photo_time: photoTime 
    }));

    const response = await fetch(`${baseUrl}/api/vault/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Worker Error: ${err}`);
    }

    return response.json();
  },

  async generateDraft(prompt: string, contextData: any = {}) {
    // ... (rest of your generateDraft code is fine) ...
    return "AI logic stays same"; 
  }
};
