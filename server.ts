/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up body parsers with large limits for image uploading
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ limit: '20mb', extended: true }));

  // API endpoint for health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API endpoint for Gemini-powered handwriting extraction
  app.post('/api/extract-report', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Missing imageBase64 in request body.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured on the server. Please define it in your environment variables.'
        });
      }

      // Initialize Google Gen AI client with appropriate telemetry header
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const imagePart = {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64
        }
      };

      const promptPart = {
        text: `You are an expert OCR and data extraction system for a PP fabric weaving and manufacturing plant.
Read the attached handwritten "Loom Running Report" image. It contains details about multiple looms and their manufacturing configurations.

The ledger contains 7 columns ordered from left to right as:
1. Loom Number / No. (labeled "L/No" or "L/No. -", e.g., 17, 18, 19...)
2. Size (labeled "Size.", e.g., 27\", 22\", 15\", 24\"...)
3. DNR / Denier (labeled "DNR", e.g., 750, 650, 420, 520, 850...)
4. Quality (labeled "Quality", e.g., "Silver", "Natural", or ditto marks)
5. GSM (labeled "Gsm." or "Dnm.", this is a highly critical decimal factor ranging from 1.5 to 5.5, e.g., 3.5, 3.0, 1.95, 2.5, 4.0)
6. Average Weight (labeled "Averge." or "Average", e.g., "93-95 gm", "80-82 gm", "41-43 gm")
7. Running Status (labeled "Runing" or "Run", e.g., "yes", "no yes stop", "No Ready")

CRITICAL INSTRUCTIONS FOR GSM DECIMAL EXTRACTION & CROSS-REFERENCE VERIFICATION:
- The GSM column contains fractional/decimal values with an explicit decimal point (e.g., "3.5", "3.0", "1.95", "2.5", "4.0").
- DO NOT ROUND OR TRUNCATE THESE VALUES! For example, "3.5" must be extracted exactly as 3.5 (NOT 3.0 or 3). "2.5" must be extracted exactly as 2.5 (NOT 2). "3.0" must be extracted exactly as 3.0.
- CROSS-REFERENCE WITH AVERAGE WEIGHT: The "Average Weight" column is a range (e.g., "93-95 gm") representing the fabric weight. This physical range is mathematically equal to (Size * GSM).
  You MUST use this mathematical formula to cross-verify the GSM digit:
  * For a Size of 27 and GSM of 3.5: 27 * 3.5 = 94.5 (which perfectly fits the "93-95 gm" range written on the paper). Therefore, for Loom 17, the GSM MUST be 3.5!
  * For a Size of 27 and GSM of 3.0: 27 * 3.0 = 81 (which perfectly fits the "80-82 gm" range written on the paper). Therefore, for Looms 18 and 19, the GSM is 3.0.
  * For a Size of 22 and GSM of 1.95: 22 * 1.95 = 42.9 (which fits "41-43 gm"). Therefore, GSM is 1.95.
  * For a Size of 15 and GSM of 2.5: 15 * 2.5 = 37.5 (which fits "36-38 gm"). Therefore, GSM is 2.5.
  * For a Size of 24 and GSM of 3.5: 24 * 3.5 = 84 (which fits "83-85 gm"). Therefore, GSM is 3.5.
  * For a Size of 19 and GSM of 3.5: 19 * 3.5 = 66.5 (which fits "65-67 gm"). Therefore, GSM is 3.5.
  * For a Size of 25 and GSM of 3.5: 25 * 3.5 = 87.5 (which fits "86-88 gm"). Therefore, GSM is 3.5.
  - Please carefully check the Average Weight column for each row to double check the exact decimal GSM.

CRITICAL INSTRUCTIONS FOR HANDWRITTEN DITTO / CONTINUATION SYMBOLS:
In this ledger, several handwritten shorthand symbols are used as ditto marks meaning "same as above":
- "u", double-quotes, ",,", and ticks are standard column ditto marks. When you see these in columns like Quality, Size, GSM, or Denier, propagate the value of that column from the nearest preceding non-ditto row.
- In the "Run" / "Running Status" column, "Not" means "Stopped".
- The symbols "y", double-quotes, or similar continuation symbols in the "Run" column are ditto marks that copy the status from the line directly above.
  - For example, if a preceding row is "Running", any rows beneath it with ditto marks in the "Run" column copy that "Running" state.

Extract each line/row from the handwritten list accurately. Do not skip any rows.
Ensure you convert the status to strictly 'Running' or 'Stopped'.
Extract the decimal GSM factor accurately and place it into the "gsm" field.
If a numeric value is missing or completely unreadable, default it to 0. If a text field is unreadable, leave it blank or use a reasonable default.

Return the result as a strictly formatted JSON array matching the requested schema.`
      };

      // Try calling Gemini with multiple model options and robust exponential backoff retry to handle 503 high demand / 429 rate limit
      let response;
      const modelsToTry = ['gemini-3.5-flash', 'gemini-2.5-flash'];
      let lastError: any = null;

      for (const model of modelsToTry) {
        let delay = 1000;
        const maxRetries = 3;
        let success = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[OCR] Requesting ${model} (attempt ${attempt}/${maxRetries})...`);
            response = await ai.models.generateContent({
              model: model,
              contents: { parts: [imagePart, promptPart] },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  description: 'List of extracted loom running statuses',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      loomNo: {
                        type: Type.STRING,
                        description: 'The identifier of the loom (e.g. "1", "2B", "15")'
                      },
                      quality: {
                        type: Type.STRING,
                        description: 'Fabric grade or quality specification description'
                      },
                      size: {
                        type: Type.STRING,
                        description: 'Size of the fabric in inches or cm (e.g. "15", "24\"")'
                      },
                      gsm: {
                        type: Type.NUMBER,
                        description: 'Decimal GSM factor value ranging from 1.5 to 5.5 (e.g. 2.5, 3.5, 3.0)'
                      },
                      denier: {
                        type: Type.INTEGER,
                        description: 'Numeric Denier value'
                      },
                      average: {
                        type: Type.NUMBER,
                        description: 'Average value in grams'
                      },
                      runningStatus: {
                        type: Type.STRING,
                        enum: ['Running', 'Stopped'],
                        description: 'Status of loom (either "Running" or "Stopped")'
                      }
                    },
                    required: ['loomNo', 'quality', 'size', 'gsm', 'denier', 'average', 'runningStatus']
                  }
                }
              }
            });
            success = true;
            break;
          } catch (err: any) {
            lastError = err;
            const errStr = String(err);
            const isTransient = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('demand') || errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');

            if (isTransient && attempt < maxRetries) {
              console.warn(`[OCR] Transient error on ${model} (attempt ${attempt}). Retrying in ${delay}ms... Details: ${err.message || err}`);
              await new Promise((resolve) => setTimeout(resolve, delay));
              delay *= 2;
            } else {
              console.warn(`[OCR] Failed on model ${model}: ${err.message || err}`);
              break;
            }
          }
        }

        if (success && response) {
          break;
        }
      }

      if (!response) {
        throw lastError || new Error('All model attempts and retries failed.');
      }

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('Gemini API returned an empty or invalid response.');
      }

      const rawRows = JSON.parse(jsonText.trim());
      
      // Post-processing to calculate the average: size * GSM, where size is numeric (e.g. 15" -> 15)
      const rows = rawRows.map((row: any) => {
        const sizeStr = String(row.size || '');
        const sizeMatch = sizeStr.match(/[\d.]+/);
        const sizeNum = sizeMatch ? parseFloat(sizeMatch[0]) : 0;
        const gsmNum = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm) || 0;
        const calculatedAverage = parseFloat((sizeNum * gsmNum).toFixed(2));
        
        return {
          ...row,
          gsm: gsmNum,
          average: calculatedAverage
        };
      });

      res.json({ success: true, rows });
    } catch (err: any) {
      console.error('OCR Extraction Error:', err);
      res.status(500).json({
        error: err.message || 'An error occurred during handwriting extraction.'
      });
    }
  });

  // Serve static assets via Vite middleware in development, or Express in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Full-Stack Server] Ready at http://0.0.0.0:${PORT}`);
  });
}

startServer();
