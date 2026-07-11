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

The report has columns resembling:
1. Loom Number / No.
2. Quality (fabric grade/name, e.g. Silver, White, 12x12, Raffia, etc.)
3. Size (dimensions, e.g. "15", "24\"", etc.)
4. GSM (decimal factor, e.g. 2.5, 3.5, 3.0, 2.0, 5.0, etc.)
5. DNR / Denier (numeric tape thickness value, e.g. 520, 750, 650, etc.)
6. Running Status / Run (either Running, Stopped, Not, or continuation marks)

CRITICAL INSTRUCTIONS FOR HANDWRITTEN DITTO / CONTINUATION SYMBOLS:
In this ledger, several handwritten shorthand symbols are used as ditto marks meaning "same as above":
- "u", double-quotes, ",,", and ticks are standard column ditto marks. When you see these in columns like Quality, Size, GSM, or Denier, propagate the value of that column from the nearest preceding non-ditto row.
- In the "Run" / "Running Status" column, "Not" means "Stopped" (Loom 1).
- The symbols "y", double-quotes, or similar continuation symbols in the "Run" column are ditto marks that copy the status from the line directly above.
  - For example, Loom 1 is written as "Not" (Stopped).
  - Looms 2, 3, 4, 5, 6, and 7 have continuation marks ("y" or double-quotes) in the Run column, meaning they are ALSO "Stopped".
- When a new block starts with "Run" (Running) (e.g. at Loom 17), subsequent rows with continuation marks ("y" or double-quotes) in the Run column copy that "Running" state.

Extract each line/row from the handwritten list accurately. Do not skip any rows.
Ensure you convert the status to strictly 'Running' or 'Stopped'.
Extract the decimal GSM factor (typically ranging from 1.5 to 5.5) accurately and place it into the "gsm" field.
If a numeric value is missing or completely unreadable, default it to 0. If a text field is unreadable, leave it blank or use a reasonable default.

Return the result as a strictly formatted JSON array matching the requested schema.`
      };

      // Call Gemini 3.5 Flash model which is available, fast, and powerful for basic multimodal/OCR tasks
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
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
