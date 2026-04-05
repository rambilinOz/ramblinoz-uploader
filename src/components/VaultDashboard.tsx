import React, { useState, useRef } from 'react';
import ImageWorker from '../workers/imageProcessor.worker?worker';
import { CloudflareService } from '../services/cloudflare.service';

// Added 'cancelled' to the status options
interface QueuedFile {
  id: string;
  file: File;
  status:
    | 'pending'
    | 'processing'
    | 'success'
    | 'skipped'
    | 'error'
    | 'cancelled';
  message?: string;
}

export const VaultDashboard: React.FC = () => {
  // ---------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const cancelRef = useRef<boolean>(false); // Tracks if the user clicked Cancel

  // ---------------------------------------------------------
  // DRAG AND DROP HANDLERS
  // ---------------------------------------------------------
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const newQueueItems: QueuedFile[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
    }));
    setQueue((prev) => [...prev, ...newQueueItems]);
  };

  const clearQueue = () => {
    if (isProcessing) return;
    setQueue([]);
  };

  // ---------------------------------------------------------
  // CORE PROCESSING ENGINE
  // ---------------------------------------------------------
  const processSingleFile = (file: File): Promise<any> => {
    return new Promise((resolve) => {
      if (!workerRef.current) workerRef.current = new ImageWorker();
      workerRef.current.onmessage = (e: MessageEvent) => resolve(e.data);
      workerRef.current.onerror = (err) =>
        resolve({ success: false, error: err.message });
      workerRef.current.postMessage(file);
    });
  };

  const startBatchProcess = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);
    cancelRef.current = false; // Reset cancel flag before starting

    for (let i = 0; i < queue.length; i++) {
      // 1. Check if user clicked Cancel
      if (cancelRef.current) {
        setQueue((prev) =>
          prev.map((item) =>
            item.status === 'pending'
              ? { ...item, status: 'cancelled', message: 'Cancelled by user' }
              : item
          )
        );
        break; // Stop the loop entirely
      }

      const currentItem = queue[i];
      if (currentItem.status !== 'pending') continue;

      setQueue((prev) =>
        prev.map((item) =>
          item.id === currentItem.id ? { ...item, status: 'processing' } : item
        )
      );

      try {
        const workerResult = await processSingleFile(currentItem.file);
        if (!workerResult.success)
          throw new Error(workerResult.error || 'Worker failed');

        const dbResponse = await CloudflareService.uploadToVault(
          workerResult.blob,
          workerResult.exif,
          workerResult.originalName
        );

        if (
          dbResponse.skipped &&
          dbResponse.skipped.includes(workerResult.originalName)
        ) {
          setQueue((prev) =>
            prev.map((item) =>
              item.id === currentItem.id
                ? {
                    ...item,
                    status: 'skipped',
                    message: 'Duplicate found in D1',
                  }
                : item
            )
          );
        } else {
          setQueue((prev) =>
            prev.map((item) =>
              item.id === currentItem.id
                ? { ...item, status: 'success', message: 'Saved to Vault' }
                : item
            )
          );
        }
      } catch (error: any) {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === currentItem.id
              ? { ...item, status: 'error', message: error.message }
              : item
          )
        );
      }
    }

    setIsProcessing(false);
  };

  const cancelUpload = () => {
    cancelRef.current = true;
  };

  const handleCloseModal = () => {
    // This sends the signal up to the Vanilla JS Main Dashboard
    if (window.parent) {
      window.parent.postMessage({ action: 'RAMBLINOZ_UPLOAD_COMPLETE' }, '*');
    } else {
      console.log('No parent window found to send close signal to.');
    }
  };

  // ---------------------------------------------------------
  // UI RENDERING
  // ---------------------------------------------------------
  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const successCount = queue.filter((q) => q.status === 'success').length;
  const skippedCount = queue.filter((q) => q.status === 'skipped').length;

  return (
    <div
      style={{
        width: '100%',
        padding: '20px 30px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui',
        color: '#333',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h2>RamblinOz Portal</h2>
        <div>
          {isProcessing ? (
            <button
              onClick={cancelUpload}
              style={{
                padding: '8px 16px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Stop / Cancel
            </button>
          ) : (
            <>
              <button
                onClick={clearQueue}
                disabled={queue.length === 0}
                style={{
                  padding: '8px 16px',
                  marginRight: '10px',
                  background: '#f1f1f1',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: queue.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Clear Queue
              </button>
              <button
                onClick={startBatchProcess}
                disabled={pendingCount === 0}
                style={{
                  padding: '8px 16px',
                  marginRight: '10px',
                  background: pendingCount === 0 ? '#ccc' : '#007BFF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pendingCount === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Start Upload ({pendingCount})
              </button>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: '8px 16px',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Done / Close
              </button>
            </>
          )}
        </div>
      </div>

      {/* DRAG AND DROP ZONE */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragActive ? '#007BFF' : '#ccc'}`,
          backgroundColor: dragActive ? '#f0f8ff' : '#fafafa',
          padding: '40px',
          textAlign: 'center',
          borderRadius: '8px',
          marginBottom: '20px',
          transition: 'all 0.2s ease',
          opacity: isProcessing ? 0.5 : 1,
          pointerEvents: isProcessing ? 'none' : 'auto',
        }}
      >
        <p style={{ fontSize: '18px', margin: '0 0 10px 0' }}>
          Drag & Drop months of photos here
        </p>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="file-upload"
          disabled={isProcessing}
        />
        <label
          htmlFor="file-upload"
          style={{
            background: '#333',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Or Browse Files
        </label>
      </div>

      {/* STATS ROW */}
      {queue.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '20px',
            marginBottom: '15px',
            fontSize: '14px',
            padding: '10px',
            background: '#eef2f5',
            borderRadius: '6px',
          }}
        >
          <strong>Queue: {queue.length}</strong>
          <span style={{ color: 'blue' }}>Pending: {pendingCount}</span>
          <span style={{ color: 'green' }}>Success: {successCount}</span>
          <span style={{ color: 'orange' }}>Skipped: {skippedCount}</span>
        </div>
      )}

      {/* LIST VIEW OF PROCESSING FILES */}
      {queue.length > 0 && (
        <div
          style={{
            border: '1px solid #eee',
            borderRadius: '8px',
            maxHeight: '500px',
            overflowY: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
            }}
          >
            <thead
              style={{ background: '#f9f9f9', position: 'sticky', top: 0 }}
            >
              <tr>
                <th
                  style={{
                    padding: '10px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                  }}
                >
                  File Name
                </th>
                <th
                  style={{
                    padding: '10px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                  }}
                >
                  Size
                </th>
                <th
                  style={{
                    padding: '10px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd',
                  }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    background:
                      item.status === 'error' ? '#ffeeee' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                    {item.file.name}
                  </td>
                  <td style={{ padding: '10px', color: '#666' }}>
                    {(item.file.size / 1024 / 1024).toFixed(2)} MB
                  </td>
                  <td style={{ padding: '10px' }}>
                    {item.status === 'pending' && (
                      <span style={{ color: '#999' }}>⏳ Waiting</span>
                    )}
                    {item.status === 'processing' && (
                      <span style={{ color: '#007BFF', fontWeight: 'bold' }}>
                        ⚙️ Processing...
                      </span>
                    )}
                    {item.status === 'success' && (
                      <span style={{ color: 'green' }}>✅ {item.message}</span>
                    )}
                    {item.status === 'skipped' && (
                      <span style={{ color: 'orange' }}>⚠️ {item.message}</span>
                    )}
                    {item.status === 'error' && (
                      <span style={{ color: 'red' }}>❌ {item.message}</span>
                    )}
                    {item.status === 'cancelled' && (
                      <span style={{ color: '#666' }}>🛑 {item.message}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
