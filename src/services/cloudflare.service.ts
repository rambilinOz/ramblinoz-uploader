// cloudflare.service.ts
export const CloudflareService = {
  
  // ---------------------------------------------------------
  // 1. VAULT UPLOAD SERVICE (Legacy Single Upload)
  // ---------------------------------------------------------
  async uploadToVault(blob: Blob, exif: any, fileName: string) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    let folderDate = new Date().toISOString().split('T')[0];
    let photoTime = exif.time || null; 

    if (exif.DateTimeOriginal) {
      if (exif.DateTimeOriginal instanceof Date) {
        folderDate = exif.DateTimeOriginal.toISOString().split('T')[0];
        photoTime = exif.DateTimeOriginal.toTimeString().split(' ')[0]; 
      } else if (typeof exif.DateTimeOriginal === 'string') {
        const parts = exif.DateTimeOriginal.split(' ');
        if (parts.length === 2) {
          folderDate = parts[0].replace(/:/g, '-');
          photoTime = parts[1]; 
        }
      }
    } else if (exif.date) {
        folderDate = exif.date; 
    }

    const newFileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";

    const formData = new FormData();
    formData.append('date', folderDate); 
    formData.append('file_0', blob, newFileName);
    formData.append('replaces_0', fileName);
    
    formData.append('metadata', JSON.stringify({
      lat: exif.lat || null,
      lon: exif.lon || null,
      camera_make: exif.make || 'Unknown',   
      camera_model: exif.model || 'Unknown', 
      photo_time: photoTime,                 
      folder_date: folderDate                
    }));

    const response = await fetch(`${baseUrl}/api/vault/upload`, {
      method: 'POST',
      body: formData,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Worker Error [${response.status}]: ${err}`);
    }

    return response.json();
  },

  // ---------------------------------------------------------
  // 2. VAULT BATCH UPLOAD SERVICE (New Edge Optimizer)
  // ---------------------------------------------------------
  async uploadBatchToVault(batch: Array<{blob: Blob, exif: any, originalName: string, newName: string, date: string}>) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    const formData = new FormData();
    
    // The entire batch shares the same primary folder date for R2 organization
    formData.append('date', batch[0].date);

    // Map each file securely to its numbered index
    batch.forEach((item, index) => {
      formData.append(`file_${index}`, item.blob, item.newName);
      formData.append(`replaces_${index}`, item.originalName);

      if (item.exif.lat) formData.append(`lat_${index}`, String(item.exif.lat));
      if (item.exif.lon) formData.append(`lon_${index}`, String(item.exif.lon));
      if (item.exif.make) formData.append(`make_${index}`, item.exif.make);
      if (item.exif.model) formData.append(`model_${index}`, item.exif.model);
      if (item.exif.time) formData.append(`time_${index}`, item.exif.time);
    });

    const response = await fetch(`${baseUrl}/api/vault/upload`, {
      method: 'POST',
      body: formData,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Worker Error [${response.status}]: ${err}`);
    }

    return response.json();
  },

  // ---------------------------------------------------------
  // 3. AI DRAFTER SERVICE 
  // ---------------------------------------------------------
  async generateDraft(prompt: string, contextData: any = {}) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    let contextString = "Context: I am writing a travel blog. ";
    if (contextData.lat && contextData.lon) {
      contextString += `The photo was taken at GPS coordinates [${contextData.lat}, ${contextData.lon}]. `;
    }

    const payload = {
      contents: [{ role: "user", parts: [{ text: `${contextString}\n\nUser Prompt: ${prompt}` }] }]
    };

    const response = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to connect to AI Proxy");
    }

    const data = await response.json();
    return data.text; 
  }
};