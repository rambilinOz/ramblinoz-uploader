export const CloudflareService = {
  
  // ---------------------------------------------------------
  // 1. VAULT UPLOAD SERVICE (Already Tested & Working)
  // ---------------------------------------------------------
  async uploadToVault(blob: Blob, exif: any, fileName: string) {
    const baseUrl = import.meta.env.VITE_API_URL;
    if (!baseUrl) throw new Error("VITE_API_URL is missing from .env configuration");

    const token = localStorage.getItem('oz_token');
    if (!token) throw new Error("Security Violation: Missing oz_token in local storage");

    let folderDate = new Date().toISOString().split('T')[0];
    let photoTime = null;

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
    }

    const newFileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";

    const formData = new FormData();
    formData.append('date', folderDate);
    formData.append('file_0', blob, newFileName);
    formData.append('replaces_0', fileName);
    
    formData.append('metadata', JSON.stringify({
      lat: exif.latitude || null,
      lon: exif.longitude || null,
      make: exif.Make || 'Unknown',
      model: exif.Model || 'Unknown',
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
