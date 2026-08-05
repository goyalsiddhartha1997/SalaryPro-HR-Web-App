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
        text: `You are an expert OCR and handwriting data extraction engine for a PP fabric weaving and manufacturing plant.
Read the attached handwritten "Loom Running Report" image. It contains 21 distinct columns ordered from left to right as:

1. LOOM NO (labeled "LOOM NO", e.g. 1, 2, 3... 17, 18, 19... 26, 27... 34)
2. LOOM OPERATOR (labeled "LOOM OPERATOR", e.g. "Shokit", "Guddu Singh", "Sutesh Singh", "Bhart Singh", "No Load", or indicated by vertical arrows)
3. MESH (labeled "MESH", e.g. "10x10", "11", "u", "11x11", "10x11")
4. METERS (labeled "METERS", e.g. 300, 250, 300, 640, 810, 610, 860, 890, 700, 740, 820, 840)
5. QUALITY (labeled "QUALITY", e.g. "Silver", "Natural", or ditto marks "11" / "u")
6. SIZE (labeled "SIZE", e.g. "15", "25", "24", "22", "27"", "15"")
7. GSM (labeled "GSM", this is a critical decimal factor like 2.5, 3.5, 3.0, 2.0. DO NOT ROUND OR TRUNCATE)
8. DENIER (labeled "DENIER", e.g. 520, 750, 650, 400)
9. AVG WT (g) (labeled "AVG WT (g)" or "Averge.", e.g. 37.5, 87.5, 72.0, 42-44, 94.5, 81.0, 84.0)
10. ROLL NO (labeled "ROLL NO", e.g. "185", "186", "187", "188", "189", "190" - if blank or vertical line, leave as empty string)
11. WARP STRENGTH (kgs) (labeled "WARP STRENGTH (kgs)", e.g. "43-47", "43-46", "50-41", "44-46", "30-33", "48-51")
12. WARP ELONGATION (%) (labeled "WARP ELONGATION (%)", e.g. "18-19", "17-18", "18-18", "16-17", "20-20")
13. WEFT STRENGTH (kgs) (labeled "WEFT STRENGTH (kgs)", e.g. "47-45", "32-36", "50-45", "28-30", "47-46")
14. WEFT ELONGATION (%) (labeled "WEFT ELONGATION (%)", e.g. "19-18", "16-18", "20-20", "17-17", "19-19")
15. ROLL METERS (labeled "ROLL METERS", e.g. 2960, 2875, 2720, 5415, 4995, 3295)
16. GR WT (kg) (labeled "GR WT (kg)", e.g. 245.4, 236, 223.8, 245.8, 190, 279.4)
17. CR WT (kg) (labeled "CR WT (kg)", e.g. 2.2, 2.2, 1.8, 1.0, 2.2)
18. NET WT (kg) (labeled "NET WT (kg)", e.g. 243.2, 233.8, 221.6, 244.0, 189, 277.2)
19. AVG WT [CALC] (g) (labeled "AVG WT [CALC] (g)", e.g. 82.7, 81.3, 81.4, 45.0, 37.8, 84.1)
20. GSM [CALC] (labeled "GSM [CALC]", e.g. 3.3, 3.3, 3.4, 2.0, 2.5, 3.3)
21. RUNNING STATUS (labeled "RUNNING STATUS", e.g. "Running", "Runing", "Stop", "Stopped", "No Load")

CRITICAL INSTRUCTIONS FOR WARP AND WEFT RANGE VALUES:
- The columns WARP STRENGTH (kgs), WARP ELONGATION (%), WEFT STRENGTH (kgs), and WEFT ELONGATION (%) frequently contain RANGE VALUES separated by a hyphen '-', such as "18-19", "42-45", "43-47", "50-41", "17-18", "32-36", "47-45", "19-18", "16-18", "20-20".
- You MUST extract these range values EXACTLY as written with the hyphen intact (e.g. "18-19", "43-47"). Do NOT average them or convert them to a single number!

CRITICAL INSTRUCTIONS FOR HANDWRITTEN ARROWS & DITTO SYMBOLS:
- Vertical lines or double-headed/single-headed arrows (↕ or | with arrowheads) spanning multiple rows indicate that the value at the top, center, or start of the arrow line applies to ALL rows spanned by that arrow line.
  * LOOM OPERATOR: If an operator name like "Shokit", "Guddu Singh", "Sutesh Singh", or "Bhart Singh" has a vertical arrow spanning multiple looms, propagate that exact operator name to ALL looms spanned by that arrow line!
  * NO LOAD: If "No Load" or horizontal dashes with vertical arrows span looms 1-8 or 9-16, set the LOOM OPERATOR to "No Load" and RUNNING STATUS to "Stopped" for those rows.
  * METERS / QUALITY / SIZE / GSM / DENIER / ROLL METERS: If a vertical arrow or ditto marks ("11", "u", double ticks) span across rows, propagate the non-ditto value down to all spanned rows.
- RUNNING STATUS: "Runing" or "Running" or ditto marks underneath "Runing" mean "Running". "Stop", "Stopped", "No Load" mean "Stopped".

CRITICAL INSTRUCTIONS FOR GSM DECIMAL EXTRACTION:
- GSM values contain explicit decimals (e.g., 2.5, 3.5, 3.0, 2.0).
- DO NOT ROUND OR TRUNCATE! "3.5" must be extracted as 3.5. "2.5" as 2.5. "3.0" as 3.0.

Extract every loom row in the sheet from top to bottom without omitting any row. Return a strictly formatted JSON array.`
      };

      // Try calling Gemini with multiple model options and robust exponential backoff retry to handle 503 high demand / 429 rate limit
      let response;
      const modelsToTry = ['gemini-3.6-flash', 'gemini-2.5-flash'];
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
                  description: 'List of extracted loom running statuses and metrics',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      loomNo: {
                        type: Type.STRING,
                        description: 'The identifier of the loom (e.g. "1", "2", "17", "26")'
                      },
                      operatorName: {
                        type: Type.STRING,
                        description: 'Name of the loom operator (e.g. "Shokit", "Guddu Singh", "Sutesh Singh", "Bhart Singh", "No Load")'
                      },
                      mesh: {
                        type: Type.STRING,
                        description: 'Mesh specification (e.g. "10x10", "11", "10x11")'
                      },
                      totalMeters: {
                        type: Type.NUMBER,
                        description: 'Total fabric length in meters (e.g. 300, 250, 640, 810)'
                      },
                      quality: {
                        type: Type.STRING,
                        description: 'Fabric quality description (e.g. "Silver", "Natural")'
                      },
                      size: {
                        type: Type.STRING,
                        description: 'Size of fabric in inches or cm (e.g. "15", "25", "27\"")'
                      },
                      gsm: {
                        type: Type.NUMBER,
                        description: 'Decimal GSM value (e.g. 2.5, 3.5, 3.0, 2.0)'
                      },
                      denier: {
                        type: Type.INTEGER,
                        description: 'Numeric Denier value (e.g. 520, 750, 650, 400)'
                      },
                      average: {
                        type: Type.NUMBER,
                        description: 'Average fabric weight in grams (e.g. 37.5, 87.5, 94.5)'
                      },
                      rollNo: {
                        type: Type.STRING,
                        description: 'Roll number (e.g. "185", "186", "187")'
                      },
                      warpStrength: {
                        type: Type.STRING,
                        description: 'Warp strength in kgs. Range string separated by hyphen e.g. "43-47", "48-51", "50-41"'
                      },
                      warpElongation: {
                        type: Type.STRING,
                        description: 'Warp elongation in %. Range string separated by hyphen e.g. "18-19", "17-18", "20-20"'
                      },
                      weftStrength: {
                        type: Type.STRING,
                        description: 'Weft strength in kgs. Range string separated by hyphen e.g. "47-45", "32-36", "50-45"'
                      },
                      weftElongation: {
                        type: Type.STRING,
                        description: 'Weft elongation in %. Range string separated by hyphen e.g. "19-18", "16-18", "20-20"'
                      },
                      rollMeters: {
                        type: Type.NUMBER,
                        description: 'Roll length in meters (e.g. 2960, 2875, 2720)'
                      },
                      grossWt: {
                        type: Type.NUMBER,
                        description: 'Gross Weight in kilograms (kg) (e.g. 245.4, 236.0, 223.8)'
                      },
                      coreWt: {
                        type: Type.NUMBER,
                        description: 'Core Weight in kilograms (kg) (e.g. 2.2, 1.8, 1.0)'
                      },
                      netWt: {
                        type: Type.NUMBER,
                        description: 'Net Weight in kilograms (kg) (e.g. 243.2, 233.8, 221.6)'
                      },
                      avgWtCalculated: {
                        type: Type.NUMBER,
                        description: 'Calculated average weight in grams (e.g. 82.7, 81.3, 81.4)'
                      },
                      gsmCalculated: {
                        type: Type.NUMBER,
                        description: 'Calculated GSM value (e.g. 3.3, 3.4, 2.0)'
                      },
                      runningStatus: {
                        type: Type.STRING,
                        enum: ['Running', 'Stopped'],
                        description: 'Running status of loom ("Running" or "Stopped")'
                      },
                      remarks: {
                        type: Type.STRING,
                        description: 'Any notes or remarks'
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
      
      // Post-processing to calculate average and ensure defaults for missing fields
      const rows = rawRows.map((row: any) => {
        const sizeStr = String(row.size || '');
        const sizeMatch = sizeStr.match(/[\d.]+/);
        const sizeNum = sizeMatch ? parseFloat(sizeMatch[0]) : 0;
        const gsmNum = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm) || 0;
        const calculatedAverage = parseFloat((sizeNum * gsmNum).toFixed(2));
        const metersNum = typeof row.totalMeters === 'number' ? row.totalMeters : (parseFloat(row.totalMeters) || 0);

        const grossWtNum = typeof row.grossWt === 'number' ? row.grossWt : (parseFloat(row.grossWt) || 0);
        const coreWtNum = typeof row.coreWt === 'number' ? row.coreWt : (parseFloat(row.coreWt) || 0);
        let netWtNum = typeof row.netWt === 'number' ? row.netWt : (parseFloat(row.netWt) || 0);
        if (!netWtNum && grossWtNum > 0) {
          netWtNum = parseFloat(Math.max(0, grossWtNum - coreWtNum).toFixed(3));
        }
        let avgWtCalcNum = typeof row.avgWtCalculated === 'number' ? row.avgWtCalculated : (parseFloat(row.avgWtCalculated) || 0);
        if (!avgWtCalcNum && netWtNum > 0 && metersNum > 0) {
          avgWtCalcNum = parseFloat(((netWtNum * 1000) / metersNum).toFixed(2));
        }

        const rollMetersNum = typeof row.rollMeters === 'number' ? row.rollMeters : (parseFloat(row.rollMeters) || 0);
        let gsmCalcNum = typeof row.gsmCalculated === 'number' ? row.gsmCalculated : (parseFloat(row.gsmCalculated) || 0);

        const opName = String(row.operatorName || '').trim();
        const isStopped = row.runningStatus === 'Stopped' || opName.toUpperCase().includes('NO LOAD');

        return {
          loomNo: String(row.loomNo || ''),
          operatorName: opName,
          mesh: String(row.mesh || ''),
          totalMeters: metersNum,
          quality: String(row.quality || ''),
          size: sizeStr,
          gsm: gsmNum,
          denier: typeof row.denier === 'number' ? row.denier : parseInt(row.denier) || 0,
          average: calculatedAverage || (typeof row.average === 'number' ? row.average : parseFloat(row.average) || 0),
          rollNo: String(row.rollNo || ''),
          warpStrength: row.warpStrength != null ? String(row.warpStrength) : '',
          warpElongation: row.warpElongation != null ? String(row.warpElongation) : '',
          weftStrength: row.weftStrength != null ? String(row.weftStrength) : '',
          weftElongation: row.weftElongation != null ? String(row.weftElongation) : '',
          rollMeters: rollMetersNum,
          grossWt: grossWtNum,
          coreWt: coreWtNum,
          netWt: netWtNum,
          avgWtCalculated: avgWtCalcNum,
          gsmCalculated: gsmCalcNum,
          runningStatus: isStopped ? 'Stopped' : 'Running',
          remarks: String(row.remarks || '')
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
