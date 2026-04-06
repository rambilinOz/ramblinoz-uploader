import React, { useState, useEffect, useRef } from 'react';
import ImageWorker from '../workers/imageProcessor.worker?worker';
import { CloudflareService } from '../services/cloudflare.service';

export const ImageVault: React.FC = () => {
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'success' | 'error'
  >('idle');
  const [log, setLog] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Mount the background worker
    workerRef.current = new ImageWorker();

    workerRef.current.onmessage = async (e: MessageEvent) => {
      const { success, blob, exif, error, originalName } = e.data;

      if (success) {
        setLog(
          (prev) => prev + `\n✅ Local Processing Complete: ${originalName}`
        );
        setLog(
          (prev) =>
            prev +
            `\n📍 GPS Found: [${exif.latitude || 'None'}, ${
              exif.longitude || 'None'
            }]`
        );

        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        try {
          setLog(
            (prev) => prev + `\n⏳ Transmitting to Cloudflare Light Server...`
          );
          // Note: This will throw a network error in StackBlitz until CORS and Auth are fully configured on your Worker
          await CloudflareService.uploadToVault(blob, exif, originalName);
          setLog(
            (prev) =>
              prev + `\n🚀 Synchronization Successful! Saved to vault_index.`
          );
          setStatus('success');
        } catch (uploadError: any) {
          setLog(
            (prev) => prev + `\n❌ Transmission Failed: ${uploadError.message}`
          );
          setStatus('error');
        }
      } else {
        setLog((prev) => prev + `\n❌ Worker Error: ${error}`);
        setStatus('error');
      }
    };

    return () => {
      workerRef.current?.terminate();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !workerRef.current) return;

    setStatus('processing');
    setLog(`Starting extraction for: ${file.name}...`);
    setPreviewUrl(null);

    // Dispatch to background thread
    workerRef.current.postMessage(file);
  };

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '100%',
        margin: '0 auto',
        fontFamily: 'system-ui',
      }}
    >
      <h2>RamblinOz Vault Sync</h2>

      <div style={{ marginBottom: '15px' }}>
        <input
          type="file"
          accept="image/jpeg, image/png, image/heic"
          onChange={handleFileUpload}
          disabled={status === 'processing'}
        />
      </div>

      <div
        style={{
          background: '#1e1e1e',
          color: '#4af626',
          padding: '15px',
          borderRadius: '6px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          minHeight: '100px',
        }}
      >
        {log || 'System Ready. Waiting for file payload...'}
      </div>

      {previewUrl && (
        <div style={{ marginTop: '20px' }}>
          <img
            src={previewUrl}
            alt="Processed Output"
            style={{
              maxWidth: '100%',
              borderRadius: '8px',
              border: '1px solid #ccc',
            }}
          />
        </div>
      )}
    </div>
  );
};
