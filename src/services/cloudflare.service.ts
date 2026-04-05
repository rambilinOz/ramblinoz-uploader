export const CloudflareService = {
  
  // ---------------------------------------------------------
  // 1. VAULT UPLOAD SERVICE (Corrected for EXIF and D1 Schema)
  // ---------------------------------------------------------
  async uploadToVault(blob: Blob, exif: any, fileName: string) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    // 1. Determine Folder Date and Photo Time
    let folderDate = new Date().toISOString().split('T')[0];
    
    // Grab the time directly from the worker log output ('time')
    let photoTime = exif.time || null; 

    // Keep your original DateTimeOriginal logic just in case other cameras use it
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
        folderDate = exif.date; // Fallback if worker passes a simple 'date' string
    }

    const newFileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";

    const formData = new FormData();
    formData.append('date', folderDate); // Used for R2 storage folders
    formData.append('file_0', blob, newFileName);
    formData.append('replaces_0', fileName);
    
    // 2. Package the Metadata EXACTLY matching your D1 Schema columns
    // We use the exact keys from your console logs (exif.lat, exif.lon, etc.)
    formData.append('metadata', JSON.stringify({
      lat: exif.lat || null,
      lon: exif.lon || null,
      camera_make: exif.make || 'Unknown',   // Matches D1: camera_make
      camera_model: exif.model || 'Unknown', // Matches D1: camera_model
      photo_time: photoTime,                 // Matches D1: photo_time
      folder_date: folderDate                // Matches D1: folder_date
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
      throw new Error(`Worker Error [${response.status}]: ${err}`);
    }

    return response.json();
  },

  // ---------------------------------------------------------
  // 2. AI DRAFTER SERVICE (New)
  // ---------------------------------------------------------
  async generateDraft(prompt: string, contextData: any = {}) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    // Construct the context string from available GPS/Time data
    let contextString = "Context: I am writing a travel blog. ";
    if (contextData.lat && contextData.lon) {
      contextString += `The photo was taken at GPS coordinates [${contextData.lat}, ${contextData.lon}]. `;
    }

    // Format the payload exactly as Google Gemini expects
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${contextString}\n\nUser Prompt: ${prompt}` }]
        }
      ]
    };

    // Note: Verify this route perfectly matches your worker.js routing for handleAIGenerate
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
    return data.text; // Returns the generated string from your api_ai.js
  }
};
