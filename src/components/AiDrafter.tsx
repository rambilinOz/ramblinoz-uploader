import React, { useState } from 'react';
import { CloudflareService } from '../services/cloudflare.service';

// Define the expected shape of data passed from the parent (ImageVault)
interface AiDrafterProps {
  exifData?: any;
}

export const AiDrafter: React.FC<AiDrafterProps> = ({ exifData }) => {
  // ---------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);

  // ---------------------------------------------------------
  // ACTION HANDLERS
  // ---------------------------------------------------------
  const handleDrafting = async () => {
    // Prevent execution if the user hasn't typed anything
    if (!prompt) return;

    // Trigger loading state and clear any previous AI outputs
    setIsDrafting(true);
    setDraft('');

    try {
      // Call the live Cloudflare Worker proxy via our Service layer
      const generatedText = await CloudflareService.generateDraft(prompt, {
        lat: exifData?.latitude,
        lon: exifData?.longitude,
      });

      // Render the successful AI response to the screen
      setDraft(generatedText);
    } catch (error: any) {
      // Catch network errors or API key failures
      console.error('Drafting failed:', error);
      setDraft(`Error: ${error.message}`);
    } finally {
      // Always disable the loading state, regardless of success or failure
      setIsDrafting(false);
    }
  };

  // ---------------------------------------------------------
  // UI RENDERING
  // ---------------------------------------------------------
  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '600px',
        margin: '20px auto',
        fontFamily: 'system-ui',
        border: '1px solid #ddd',
        borderRadius: '8px',
      }}
    >
      <h2>Gemini AI Drafter</h2>

      <div style={{ marginBottom: '15px' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '5px',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Context for Gemini (e.g., "Arrived in Perth, saw the sunset"):
        </label>

        {/* User Input Field */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
          }}
          disabled={isDrafting}
        />
      </div>

      {/* Submission Button */}
      <button
        onClick={handleDrafting}
        disabled={isDrafting || !prompt}
        style={{
          padding: '10px 15px',
          backgroundColor: isDrafting ? '#ccc' : '#007BFF',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isDrafting ? 'not-allowed' : 'pointer',
        }}
      >
        {isDrafting ? 'Gemini is drafting...' : 'Generate Blog Draft'}
      </button>

      {/* Conditionally render the output box only if a draft exists */}
      {draft && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f9f9f9',
            borderLeft: '4px solid #007BFF',
          }}
        >
          <h4 style={{ margin: '0 0 10px 0' }}>AI Output:</h4>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: '1.5' }}>
            {draft}
          </p>
        </div>
      )}
    </div>
  );
};
