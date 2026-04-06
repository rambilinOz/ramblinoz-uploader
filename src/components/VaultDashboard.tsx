// VaultDashboard.tsx
import React, { useState, useRef } from 'react';
import ImageWorker from '../workers/imageProcessor.worker?worker';
import { CloudflareService } from '../services/cloudflare.service';

export const VaultDashboard: React.FC = () => {
  // ---------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------
  const [queue, setQueue] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // New UI Progress State
  const [progress, setProgress] = useState({
    percent: 0,
    activeFileName: '',
    activeFileSize: '',
    statusText: ''
  });
  const [failedFiles, setFailedFiles] = useState<string[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const cancelRef = useRef<boolean>(false); 

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
    setQueue((prev) => [...prev, ...imageFiles]);
    setCompleted(false);
    setFailedFiles([]);
    setProgress({ percent: 0, activeFileName: '', activeFileSize: '', statusText: '' });
  };

  const clearQueue = () => {
    if (isProcessing) return;
    setQueue([]);
    setFailedFiles([]);
    setCompleted(false);
  };

  // ---------------------------------------------------------
  // CORE PROCESSING ENGINE (The Chunking Architecture)
  // ---------------------------------------------------------
  const processSingleFile = (file: File): Promise<any> => {
    return new Promise((resolve) => {
      if (!workerRef.current) workerRef.current = new ImageWorker();
      workerRef.current.onmessage = (e: MessageEvent) => resolve(e.data);
      workerRef.current.onerror = (err) => resolve({ success: false, error: err.message });
      workerRef.current.postMessage(file);
    });
  };

  const startBatchProcess = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);
    cancelRef.current = false; 

    let currentBatch: any[] = [];
    let localFailed: string[] = [];

    // Helper function to safely transmit chunks to the Edge
    const sendBatch = async () => {
      if (currentBatch.length === 0) return;
      setProgress(prev => ({ ...prev, statusText: `Transmitting batch of ${currentBatch.length} images to Cloudflare...` }));
      
      try {
        const resp = await CloudflareService.uploadBatchToVault(currentBatch);
        if (resp.skipped && resp.skipped.length > 0) {
          localFailed.push(...resp.skipped.map((s: string) => `${s} (Duplicate in D1)`));
        }
      } catch (e: any) {
        localFailed.push(...currentBatch.map(f => `${f.originalName} (Network Error)`));
      }
      currentBatch = []; // Purge batch from RAM
    };

    // Sequential Extraction Loop
    for (let i = 0; i < queue.length; i++) {
      if (cancelRef.current) break;

      const file = queue[i];
      const percent = Math.round((i / queue.length) * 100);

      // 1. Update Single-Line UI
      setProgress({
        percent,
        activeFileName: file.name,
        activeFileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        statusText: 'Extracting EXIF & Optimizing WebP...'
      });

      try {
        // 2. Process locally via RAM
        const result = await processSingleFile(file);
        if (!result.success) {
          localFailed.push(`${file.name} (Worker Failed)`);
          continue;
        }

        const fileDate = result.exif.date || new Date().toISOString().split('T')[0];

        // 3. Batch Boundaries: 20 Items OR Date Change
        if (currentBatch.length >= 20 || (currentBatch.length > 0 && currentBatch[0].date !== fileDate)) {
          await sendBatch();
        }

        currentBatch.push({ ...result, date: fileDate });
      } catch(e) {
        localFailed.push(`${file.name} (Processing Error)`);
      }
    }

    // Wrap up remainder
    if (!cancelRef.current) {
      await sendBatch();
      setProgress({ percent: 100, activeFileName: '', activeFileSize: '', statusText: 'Upload Complete!' });
      setCompleted(true);
    } else {
      setProgress(prev => ({ ...prev, statusText: 'Cancelled by User.' }));
    }

    setFailedFiles(localFailed);
    setIsProcessing(false);
  };

  const cancelUpload = () => { cancelRef.current = true; };

  const handleCloseModal = () => {
    if (window.parent) {
      window.parent.postMessage({ action: 'RAMBLINOZ_UPLOAD_COMPLETE' }, '*');
    }
  };

  // ---------------------------------------------------------
  // UI RENDERING
  // ---------------------------------------------------------
  return (
    <div style={{ width: '100%', padding: '20px 30px', boxSizing: 'border-box', fontFamily: 'system-ui', color: '#333' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>RamblinOz Vault Portal</h2>
        <div>
          {isProcessing ? (
            <button onClick={cancelUpload} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Stop / Cancel
            </button>
          ) : (
            <>
              <button onClick={clearQueue} disabled={queue.length === 0} style={{ padding: '8px 16px', marginRight: '10px', background: '#f1f1f1', border: '1px solid #ccc', borderRadius: '4px', cursor: queue.length === 0 ? 'not-allowed' : 'pointer' }}>
                Clear
              </button>
              <button onClick={startBatchProcess} disabled={queue.length === 0 || completed} style={{ padding: '8px 16px', marginRight: '10px', background: (queue.length === 0 || completed) ? '#ccc' : '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: (queue.length === 0 || completed) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                Start Upload
              </button>
              <button onClick={handleCloseModal} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                Done / Close
              </button>
            </>
          )}
        </div>
      </div>

      {/* CONDITIONAL UI: EITHER PROCESSING/COMPLETE SCREEN OR DRAG/DROP ZONE */}
      {(isProcessing || completed) ? (
        
        /* THE NEW PROGRESS UI */
        <div style={{ background: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
          {completed ? (
            <div>
               <h3 style={{color: '#28a745', fontSize: '24px', marginBottom: '10px'}}>✅ Transmission Complete</h3>
               <p style={{color: '#666'}}>All eligible files have been synced to the D1 Database and R2 Storage.</p>
               
               {failedFiles.length > 0 && (
                 <div style={{textAlign: 'left', marginTop: '25px', background: '#fff3f3', padding: '15px', borderRadius: '6px', borderLeft: '4px solid #dc3545'}}>
                     <h4 style={{margin: '0 0 10px 0', color: '#dc3545'}}>⚠️ Skipped / Protected Files ({failedFiles.length})</h4>
                     <ul style={{margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#666', maxHeight: '150px', overflowY: 'auto'}}>
                         {failedFiles.map((f, i) => <li key={i}>{f}</li>)}
                     </ul>
                 </div>
               )}
            </div>
          ) : (
            <div style={{maxWidth: '500px', margin: '0 auto'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px'}}>
                  <strong style={{color: '#007BFF'}}>{progress.statusText}</strong>
                  <span style={{color: '#666'}}>{progress.percent}%</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div style={{ background: '#e9ecef', height: '20px', borderRadius: '10px', overflow: 'hidden', marginBottom: '15px' }}>
                    <div style={{ width: `${progress.percent}%`, background: '#007BFF', height: '100%', transition: 'width 0.3s ease' }} />
                </div>
                
                {/* Single Line Detail Text */}
                {progress.activeFileName && (
                  <div style={{fontSize: '13px', color: '#666', background: '#f8f9fa', padding: '8px', borderRadius: '4px', fontFamily: 'monospace'}}>
                    Processing: <strong>{progress.activeFileName}</strong> ({progress.activeFileSize})
                  </div>
                )}
            </div>
          )}
        </div>
      ) : (

        /* ORIGINAL DRAG AND DROP ZONE */
        <div
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? '#007BFF' : '#ccc'}`,
            backgroundColor: dragActive ? '#f0f8ff' : '#fafafa',
            padding: '40px', textAlign: 'center', borderRadius: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          <p style={{ fontSize: '18px', margin: '0 0 10px 0' }}>Drag & Drop months of photos here</p>
          <input type="file" multiple accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} id="file-upload" />
          <label htmlFor="file-upload" style={{ background: '#333', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
            Or Browse Files
          </label>

          {queue.length > 0 && (
            <div style={{marginTop: '20px', color: '#007BFF', fontWeight: 'bold'}}>
               📥 {queue.length} images staged and ready for transmission.
            </div>
          )}
        </div>
      )}

    </div>
  );
};