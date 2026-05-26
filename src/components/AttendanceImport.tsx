import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Employee } from '../types';
import { 
  Upload, 
  CheckCircle2, 
  RefreshCw, 
  ArrowRight, 
  Users, 
  Clock, 
  Play, 
  Settings2,
  ToggleLeft,
  ChevronRight,
  Search,
  Calendar,
  Eye,
  AlertCircle,
  Database
} from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Helper to check if punches are valid (not empty and not all 00:00)
const isEmployeePresent = (punchesList: string[]): boolean => {
  if (!punchesList || punchesList.length === 0) return false;
  const allZero = punchesList.every(p => {
    const parts = p.trim().split(' ');
    return parts[0] === '00:00';
  });
  return !allZero;
};

interface AttendanceImportProps {
  employees: Employee[];
  onUpdateEmployee: (id: string, updatedFields: Partial<Employee>) => Promise<void>;
  triggerAlert: (type: 'success' | 'info', text: string) => void;
  onViewEmployeeProfile?: (id: string) => void;
}

export default function AttendanceImport({ 
  employees, 
  onUpdateEmployee, 
  triggerAlert, 
  onViewEmployeeProfile 
}: AttendanceImportProps) {
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [importMode, setImportMode] = useState<'roster' | 'attendance'>('attendance');
  const [importDate, setImportDate] = useState<string>('2026-05-25');
  
  // Row Layout: 'single' (1 punch per row + time option) or 'multiple' (multiple punch columns per row)
  const [rowLayout, setRowLayout] = useState<'single' | 'multiple'>('single');

  // Column Mappings State
  const [mappings, setMappings] = useState<Record<string, string>>({
    id: '',
    name: '',
    date: '',
    punchTime: '',
    punchType: '',
    monthlySalary: '',
    arrTime: '',
    out1: '',
    in2: '',
    out2: '',
    in3: '',
    out3: '',
    in4: '',
    out4: '',
  });

  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Map Columns, 3: Preview & Commit
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-tabs Selection: 'view' for the Searchable Attendance Finder and 'upload' for CSV Importer
  const [activeSubTab, setActiveSubTab] = useState<'view' | 'upload'>('view');
  const [historyDate, setHistoryDate] = useState<string>('2026-05-25');
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [datePunches, setDatePunches] = useState<Record<string, string[]>>({});
  const [dateShifts, setDateShifts] = useState<Record<string, string>>({});
  const [importShift, setImportShift] = useState<'Day Shift' | 'Night Shift'>('Day Shift');
  const [viewShift, setViewShift] = useState<'All Shifts' | 'Day Shift' | 'Night Shift'>('All Shifts');
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Memoize registered/active employees whose ID is entered into ledger (non-temp)
  const activeEmployees = useMemo(() => {
    return employees.filter(emp => !emp.id.toUpperCase().startsWith('EMP_TEMP_'));
  }, [employees]);

  // Load daily punches for "historyDate" from Cloud Firestore subcollection for all active employees
  useEffect(() => {
    let isCancelled = false;
    if (activeSubTab !== 'view') return;

    const fetchDailyLogs = async () => {
      setLoadingHistory(true);
      const tempPunches: Record<string, string[]> = {};
      const tempShifts: Record<string, string> = {};
      
      try {
        // Run concurrent lookups securely for all registered staff
        const promises = activeEmployees.map(async (emp) => {
          const docRef = doc(db, 'employees', emp.id, 'punches', historyDate);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && !isCancelled) {
            const data = docSnap.data();
            tempPunches[emp.id] = data.punches || [];
            tempShifts[emp.id] = data.shift || 'Day Shift';
          }
        });
        await Promise.all(promises);
      } catch (err) {
        console.error("Failed fetching attendance list logs", err);
      } finally {
        if (!isCancelled) {
          setDatePunches(tempPunches);
          setDateShifts(tempShifts);
          setLoadingHistory(false);
        }
      }
    };

    fetchDailyLogs();

    return () => {
      isCancelled = true;
    };
  }, [historyDate, activeEmployees, activeSubTab]);

  // Instructions for T52F Wifi Attendance Machine
  const modelInstructions = [
    {
      title: "Model T52F WiFi Roster Export (To add new employees)",
      steps: [
        "Open your Attendance Management Software (ZKTime / BioTime / device web dashboard via WiFi).",
        "Go to System Data / User Management > Export and select CSV output.",
        "Ensure columns for Employee ID and Full Name are populated.",
        "Upload below using the 'Register Rostered Staff' mode."
      ]
    },
    {
      title: "Multi-Punch Biometric Logs (To log daily IN-OUT history)",
      steps: [
        "Export the transaction log report / Punch Log list from your WiFi device.",
        "Ensure Employee ID, Date, and Punch Times are captured.",
        "Works for multiple check-ins per day (up to 8 logs: e.g. IN, Lunch OUT, IN, final OUT).",
        "Upload here using 'Sync Biometric Punch Logs' mode."
      ]
    }
  ];

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      triggerAlert('info', 'Please upload a CSV or plain log text report (.csv / .txt)');
      return;
    }
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  // Robust CSV parser supporting quotes and newlines within double quotes
  const parseCSVToRows = (text: string, delimiter: string = ','): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentVal += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentVal);
        currentVal = '';
        i++;
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        currentRow.push(currentVal);
        currentVal = '';
        rows.push(currentRow);
        currentRow = [];
        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
      } else {
        currentVal += char;
        i++;
      }
    }
    if (currentRow.length > 0 || currentVal !== '') {
      currentRow.push(currentVal);
      rows.push(currentRow);
    }
    return rows;
  };

  // CSV Parser
  const parseCSV = (text: string) => {
    try {
      let delimiter = ',';
      const sampleText = text.slice(0, Math.min(2000, text.length));
      if (sampleText.includes('\t')) delimiter = '\t';
      else if (sampleText.includes(';')) delimiter = ';';

      const allRows = parseCSVToRows(text, delimiter);
      if (allRows.length < 8) {
        triggerAlert('info', 'The uploaded file does not contain at least 8 rows for headers list.');
        return;
      }

      // ROW 8 contains the headers (index 7)
      const headerRow = allRows[7];
      const headers = headerRow.map(h => h.trim().replace(/^["']|["']$/g, ''));
      setRawHeaders(headers);

      // ROW 9 onwards contains data (index 8 onwards)
      const rows: Record<string, string>[] = [];
      for (let i = 8; i < allRows.length; i++) {
        const rowData = allRows[i];
        if (rowData.length === 0) continue;
        
        let hasData = false;
        const rowObj: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          const val = (rowData[index] || '').trim().replace(/^["']|["']$/g, '');
          if (val) hasData = true;
          rowObj[String(index)] = val;
        });

        if (hasData) {
          const joinedLow = rowData.join('').toLowerCase();
          if (joinedLow.includes('daily in & out report') || 
              joinedLow.includes('print date') || 
              joinedLow.includes('report date') || 
              joinedLow.includes('company name')) {
            continue;
          }
          rows.push(rowObj);
        }
      }

      setParsedRows(rows);

      // Guess column mappings (indices as strings)
      const initialMappings: Record<string, string> = {
        id: '',
        name: '',
        date: '',
        punchTime: '',
        punchType: '',
        monthlySalary: '',
        arrTime: '',
        out1: '',
        in2: '',
        out2: '',
        in3: '',
        out3: '',
        in4: '',
        out4: '',
      };

      // By default, if the file has at least 7 columns, map the 7th column (index 6) to Arr Time
      if (headers.length >= 7) {
        initialMappings.arrTime = "6";
      }

      headers.forEach((h, idx) => {
        const low = h.toLowerCase().trim();
        const strIdx = String(idx);
        if (low === 'emp.code' || low === 'emp code' || h === 'Emp.Code') {
          initialMappings.id = strIdx;
        } else if (low === 'name' || h === 'Name') {
          initialMappings.name = strIdx;
        } else if (low === 'arr.time' || low === 'arrtime' || low === 'arr time' || low === 'in1' || low === 'in 1') {
          initialMappings.arrTime = strIdx;
        } else if (low === 'out1' || low === 'out 1') {
          initialMappings.out1 = strIdx;
        } else if (low === 'in2' || low === 'in 2') {
          initialMappings.in2 = strIdx;
        } else if (low === 'out2' || low === 'out 2') {
          initialMappings.out2 = strIdx;
        } else if (low === 'in3' || low === 'in 3') {
          initialMappings.in3 = strIdx;
        } else if (low === 'out3' || low === 'out 3') {
          initialMappings.out3 = strIdx;
        } else if (low === 'in4' || low === 'in 4') {
          initialMappings.in4 = strIdx;
        } else if (low === 'out4' || low === 'out 4') {
          initialMappings.out4 = strIdx;
        } else if (low.includes('id') || low.includes('enroll') || low.includes('no.') || low.includes('emp_id') || low.includes('code')) {
          if (!initialMappings.id) initialMappings.id = strIdx;
        } else if (low.includes('salary') || low.includes('wage')) {
          initialMappings.monthlySalary = strIdx;
        }
      });

      // Special mapping check for multi-punches based on whether our file has Out1, In2 etc.
      const hasMultiPunches = headers.some(h => {
        const low = h.toLowerCase().trim();
        return low === 'out1' || low === 'in2' || low === 'out2' || low === 'arr.time' || low === 'arr time';
      }) || (headers.length >= 7);

      if (hasMultiPunches) {
        setRowLayout('multiple');
        headers.forEach((h, idx) => {
          const low = h.toLowerCase().trim();
          const strIdx = String(idx);
          if (low === 'arr.time' || low === 'arrtime' || low === 'arr time' || low === 'in1' || low === 'in 1') {
            initialMappings.arrTime = strIdx;
          } else if (low === 'out1' || low === 'out 1') {
            initialMappings.out1 = strIdx;
          } else if (low === 'in2' || low === 'in 2') {
            initialMappings.in2 = strIdx;
          } else if (low === 'out2' || low === 'out 2') {
            initialMappings.out2 = strIdx;
          } else if (low === 'in3' || low === 'in 3') {
            initialMappings.in3 = strIdx;
          } else if (low === 'out3' || low === 'out 3') {
            initialMappings.out3 = strIdx;
          } else if (low === 'in4' || low === 'in 4') {
            initialMappings.in4 = strIdx;
          } else if (low === 'out4' || low === 'out 4') {
            initialMappings.out4 = strIdx;
          }
        });
      } else {
        setRowLayout('single');
      }

      setMappings(initialMappings);
      setStep(2);
      triggerAlert('success', `Workbook read successfully! Found ${rows.length} transactions from Row 9 onwards. Headers extracted from Row 8.`);
    } catch (err) {
      console.error(err);
      triggerAlert('info', 'Failed to parse the uploaded file or extract headers.');
    }
  };

  // Standardize YYYY-MM-DD
  const parseDateToISO = (dateStr: string): string => {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    
    // Check YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }

    // Check DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Check YYYYMMDD
    if (/^\d{8}$/.test(trimmed)) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    }

    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {}

    return trimmed;
  };

  // Standardize HH:MM
  const parseTimeToHM = (timeStr: string): string => {
    if (!timeStr) return '';
    const trimmed = timeStr.trim();
    
    // Extract HH:MM from timestamp like "2026-05-25 08:34:25"
    if (trimmed.includes(' ') && (trimmed.includes(':') || trimmed.includes('-'))) {
      const parts = trimmed.split(' ');
      const timePart = parts[parts.length - 1]; // Grab last block
      return parseTimeToHM(timePart);
    }

    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1]);
      const minutes = ampmMatch[2];
      const modifier = ampmMatch[3];
      if (modifier) {
        if (modifier.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (modifier.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    return trimmed.slice(0, 5); // default fallback
  };

  // Preview Processor
  const generatePreview = () => {
    if (!mappings.id) {
      triggerAlert('info', 'You must map the database unique "Employee ID" column to continue.');
      return;
    }

    if (importMode === 'attendance' && !importDate) {
      triggerAlert('info', 'You must choose an Attendance Date to sync daily attendance.');
      return;
    }

    const normalizeId = (id: string): string => {
      if (!id) return '';
      const trimmed = id.trim().toLowerCase();
      const digits = trimmed.match(/\d+/);
      if (digits) {
        return String(parseInt(digits[0], 10));
      }
      return trimmed;
    };

    const isIdMatch = (id1: string, id2: string): boolean => {
      return normalizeId(id1) === normalizeId(id2);
    };

    if (importMode === 'roster') {
      const matched = parsedRows.map(row => {
        const rawId = row[mappings.id] || '';
        let cleanedId = rawId.trim();
        const existing = employees.find(e => isIdMatch(e.id, cleanedId));
        if (existing) {
          cleanedId = existing.id;
        } else if (/^\d+$/.test(cleanedId)) {
          cleanedId = String(parseInt(cleanedId, 10));
        }

        const nameVal = mappings.name ? (row[mappings.name] || '') : '';
        const salaryVal = mappings.monthlySalary ? (Number(row[mappings.monthlySalary]) || 20000) : 20000;

        return {
          id: existing ? existing.id : cleanedId,
          name: nameVal || `Employee ${cleanedId}`,
          monthlySalary: salaryVal,
          existsInDb: !!existing
        };
      }).filter(row => row.id);

      if (matched.length === 0) {
        triggerAlert('info', 'No valid employee registration rows could be formed.');
        return;
      }
      setPreviewData(matched);
      setStep(3);
      return;
    }

    // Process Attendance multi-punches
    const groups: Record<string, { employeeId: string, date: string, rawPunches: { time: string, type: 'IN' | 'OUT' | '', label: string, sortOrder: number }[], employeeName?: string }> = {};

    parsedRows.forEach(row => {
      const rawId = row[mappings.id] || '';
      if (!rawId) return;

      let cleanedId = rawId.trim();
      const existing = employees.find(e => isIdMatch(e.id, cleanedId));
      if (existing) {
        cleanedId = existing.id;
      } else if (/^\d+$/.test(cleanedId)) {
        cleanedId = String(parseInt(cleanedId, 10));
      }

      const standardizedDate = importDate;
      const groupKey = `${cleanedId}_${standardizedDate}`;
      const nameVal = mappings.name ? (row[mappings.name] || '').trim() : '';

      if (!groups[groupKey]) {
        groups[groupKey] = {
          employeeId: cleanedId,
          date: standardizedDate,
          rawPunches: [],
          employeeName: nameVal
        };
      } else if (nameVal && !groups[groupKey].employeeName) {
        groups[groupKey].employeeName = nameVal;
      }

      if (rowLayout === 'single') {
        const rawTime = row[mappings.punchTime] || '';
        const formattedTime = parseTimeToHM(rawTime);
        if (!formattedTime) return;

        let activeType: 'IN' | 'OUT' | '' = '';
        if (mappings.punchType) {
          const val = (row[mappings.punchType] || '').toLowerCase();
          if (val.includes('in') || val.includes('check_in') || val.includes('masuk') || val === '0' || val.includes('work')) {
            activeType = 'IN';
          } else if (val.includes('out') || val.includes('check_out') || val.includes('keluar') || val === '1' || val.includes('lunch') || val.includes('off')) {
            activeType = 'OUT';
          }
        }
        groups[groupKey].rawPunches.push({ time: formattedTime, type: activeType, label: activeType || 'Punch', sortOrder: 0 });
      } else {
        // Multi columns layout in exact order requested by user:
        // 1. Arr Time (In1)
        // 2. Out1
        // 3. In2
        // 4. Out2
        // 5. In3
        // 6. Out3
        // 7. In4
        // 8. Out4
        const punchCols = [
          { key: 'arrTime', label: 'Arr Time', defaultType: 'IN' as const },
          { key: 'out1', label: 'Out1', defaultType: 'OUT' as const },
          { key: 'in2', label: 'In2', defaultType: 'IN' as const },
          { key: 'out2', label: 'Out2', defaultType: 'OUT' as const },
          { key: 'in3', label: 'In3', defaultType: 'IN' as const },
          { key: 'out3', label: 'Out3', defaultType: 'OUT' as const },
          { key: 'in4', label: 'In4', defaultType: 'IN' as const },
          { key: 'out4', label: 'Out4', defaultType: 'OUT' as const },
        ];

        punchCols.forEach((col, sIdx) => {
          const colName = mappings[col.key];
          if (colName) {
            const rawVal = row[colName];
            if (rawVal) {
              const formattedTime = parseTimeToHM(rawVal);
              if (formattedTime) {
                groups[groupKey].rawPunches.push({ 
                  time: formattedTime, 
                  type: col.defaultType, 
                  label: col.label, 
                  sortOrder: sIdx 
                });
              }
            }
          }
        });
      }
    });

    const listPreview = Object.values(groups).map(grp => {
      const sorted = [...grp.rawPunches];
      if (rowLayout === 'multiple') {
        // Sort by key index in the column order instead of chronologically
        sorted.sort((a, b) => a.sortOrder - b.sortOrder);
      } else {
        sorted.sort((a, b) => a.time.localeCompare(b.time));
      }
      
      let nextExpected: 'IN' | 'OUT' = 'IN';
      const parsedPunches = sorted.slice(0, 9).map(p => {
        let finalLabel = p.label;
        if (!finalLabel) {
          finalLabel = nextExpected;
          nextExpected = nextExpected === 'IN' ? 'OUT' : 'IN';
        }
        return `${p.time} ${finalLabel}`;
      });

      const existing = employees.find(e => isIdMatch(e.id, grp.employeeId));

      return {
        id: grp.date,
        date: grp.date,
        employeeId: existing ? existing.id : grp.employeeId,
        name: grp.employeeName || existing?.name || `Employee ${grp.employeeId}`,
        punches: parsedPunches,
        existsInDb: !!existing
      };
    }).filter(row => row.existsInDb);

    if (listPreview.length === 0) {
      triggerAlert('info', 'No matching employee IDs found. Please register matching Employee IDs first.');
      return;
    }

    setPreviewData(listPreview);
    setStep(3);
  };

  // Commit to Firestore
  const commitImportData = async () => {
    setIsProcessing(true);

    try {
      const promises = previewData.map(async (row) => {
        if (importMode === 'roster') {
          // Optimization: Skip redundant writes for existing profiles with no changes
          const existing = employees.find(e => e.id === row.id);
          if (existing && existing.name === row.name && existing.monthlySalary === Number(row.monthlySalary)) {
            return { success: true, skipped: true };
          }

          const fieldsToUpdate: Partial<Employee> = {
            id: row.id,
            name: row.name,
            monthlySalary: Number(row.monthlySalary),
            workingDays: 26,
            workingHours: 8,
            fullDaysAbsent: 0,
            absentHours: 0,
            absentMinutes: 0,
            role: 'Associate Staff',
            joinDate: '2026-05-25',
            workModel: 'On-Site',
            employmentType: 'Full-Time',
          };
          await onUpdateEmployee(row.id, fieldsToUpdate);
          return { success: true, active: true };
        } else {
          // Write biometric logs subcollection doc
          const ref = doc(db, 'employees', row.employeeId, 'punches', row.date);
          await setDoc(ref, {
            id: row.date,
            employeeId: row.employeeId,
            date: row.date,
            punches: row.punches,
            shift: importShift
          });
          return { success: true, active: true };
        }
      });

      const results = await Promise.allSettled(promises);
      let successCount = 0;
      let failCount = 0;

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
          const targetRow = previewData[idx];
          console.error(`Import sync failed for employeeId ${targetRow?.id || targetRow?.employeeId}:`, res.reason);
        }
      });

      if (importMode === 'roster') {
        triggerAlert('success', `Roster database updated! Successfully registered or updated ${successCount} employee profiles in cloud Firestore.`);
      } else {
        triggerAlert('success', `Biometric ledger updated! Synced ${successCount} punch log dates successfully in cloud Firestore.`);
      }
      setIsProcessing(false);
      setHistoryDate(importDate);
      setActiveSubTab('view');
      resetState();
    } catch (err) {
      console.error(err);
      triggerAlert('info', 'An unexpected database error occurred.');
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setStep(1);
    setCsvFile(null);
    setParsedRows([]);
    setRawHeaders([]);
    setPreviewData([]);
    setImportDate('2026-05-25');
    setImportShift('Day Shift');
    setViewShift('All Shifts');
    setRowLayout('single');
    setMappings({
      id: '',
      name: '',
      date: '',
      punchTime: '',
      punchType: '',
      monthlySalary: '',
      punchColumn1: '',
      punchColumn2: '',
      punchColumn3: '',
      punchColumn4: '',
      punchColumn5: '',
      punchColumn6: '',
      punchColumn7: '',
      punchColumn8: '',
    });
  };

  const openFileBrowser = () => {
    fileInputRef.current?.click();
  };

  // Helper to skip forward/backward daily date navigation
  const navigateDay = (offset: number) => {
    const d = new Date(historyDate);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + offset);
    // Format back to YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setHistoryDate(`${yyyy}-${mm}-${dd}`);
  };

  const humanSelectedDate = useMemo(() => {
    if (!historyDate) return '';
    const parts = historyDate.split('-');
    if (parts.length !== 3) return historyDate;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    if (isNaN(dateObj.getTime())) return historyDate;
    return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [historyDate]);

  // Calculations for KPI blocks
  const { totalStaff, presentCount, absentCount, totalPunchesToday } = useMemo(() => {
    let total = 0;
    let present = 0;
    let punchesCount = 0;
    
    activeEmployees.forEach(emp => {
      const empShift = dateShifts[emp.id] || 'Day Shift';
      if (viewShift !== 'All Shifts' && empShift !== viewShift) {
        return;
      }
      
      total++;
      const punchesList = datePunches[emp.id] || [];
      if (isEmployeePresent(punchesList)) {
        present++;
        punchesCount += punchesList.length;
      }
    });

    return {
      totalStaff: total,
      presentCount: present,
      absentCount: total - present,
      totalPunchesToday: punchesCount
    };
  }, [activeEmployees, datePunches, dateShifts, viewShift]);

  // Helper calculating duty hours
  const calculateDutyHours = (punches: string[]) => {
    if (!punches || punches.length < 2 || !isEmployeePresent(punches)) {
      return { hours: 0, minutes: 0, formatted: '-' };
    }

    let totalMinutes = 0;
    let activeInTime: { h: number; m: number } | null = null;

    punches.forEach(p => {
      const parts = p.trim().split(' ');
      if (parts.length < 2) return;
      const timeStr = parts[0];
      const type = parts.slice(1).join(' ').toUpperCase(); // supports multi-word types like "ARR TIME"

      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);

      if (isNaN(h) || isNaN(m)) return;

      const isCheckIn = type.startsWith('IN') || type.startsWith('ARR');
      const isCheckOut = type.startsWith('OUT');

      if (isCheckIn) {
        activeInTime = { h, m };
      } else if (isCheckOut && activeInTime) {
        const startMin = activeInTime.h * 60 + activeInTime.m;
        const endMin = h * 60 + m;
        if (endMin > startMin) {
          totalMinutes += (endMin - startMin);
        }
        activeInTime = null; // reset
      }
    });

    const hrs = Math.floor(totalMinutes / 60);
    const actualMins = totalMinutes % 60;
    
    if (totalMinutes === 0) {
      return { hours: 0, minutes: 0, formatted: '-' };
    }
    
    return {
      hours: hrs,
      minutes: actualMins,
      formatted: `${hrs}h ${actualMins}m`
    };
  };

  // Filter list
  const filteredList = useMemo(() => {
    return activeEmployees.filter(emp => {
      if (filterEmployeeId && emp.id !== filterEmployeeId) return false;
      
      if (viewShift !== 'All Shifts') {
        const empShift = dateShifts[emp.id] || 'Day Shift';
        if (empShift !== viewShift) return false;
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name.toLowerCase().includes(q);
        const matchId = emp.id.toLowerCase().includes(q);
        const matchRole = emp.role && emp.role.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchRole) return false;
      }
      return true;
    });
  }, [activeEmployees, filterEmployeeId, searchQuery, viewShift, dateShifts]);

  return (
    <div className="space-y-6">
      
      {/* 2-Way Segmented Sub-Tab Switcher */}
      <div className="flex bg-slate-100 rounded-2xl p-1 max-w-lg shadow-inner select-none print:hidden">
        <button
          type="button"
          onClick={() => setActiveSubTab('view')}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'view'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock size={14} className={activeSubTab === 'view' ? 'text-teal-600 animate-pulse' : ''} />
          <span>View Daily Logs finder</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('upload')}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'upload'
              ? 'bg-white text-slate-900 shadow-sm font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload size={14} className={activeSubTab === 'upload' ? 'text-teal-600' : ''} />
          <span>Upload & Sync Logs (CSV)</span>
        </button>
      </div>

      {/* ==================== SUB-TAB 1: ATTENDANCE HISTORY FINDER & INSPECTOR ==================== */}
      {activeSubTab === 'view' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Top Control Filter Panel */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row justify-between gap-4 select-none">
            
            {/* Left: Date Navigation with Chevron controls */}
            <div className="space-y-1.5 min-w-[260px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Inspection Shift Date</label>
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1 border border-slate-150 relative">
                <button
                  onClick={() => navigateDay(-1)}
                  className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer hover:bg-white rounded-lg transition-all"
                  title="Previous Day"
                >
                  <ChevronRight size={14} className="rotate-180" />
                </button>
                <div className="flex-1 flex items-center gap-2 px-1 justify-center">
                  <Calendar size={13} className="text-teal-600 shrink-0" />
                  <input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="bg-transparent border-none text-[12px] font-bold text-slate-800 focus:outline-hidden focus:ring-0 min-w-[120px] cursor-pointer text-center"
                  />
                </div>
                <button
                  onClick={() => navigateDay(1)}
                  className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer hover:bg-white rounded-lg transition-all"
                  title="Next Day"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Middle: Dropdown Selection list */}
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Choose Staff Member</label>
              <select
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
              >
                <option value="">-- All Employees ({activeEmployees.length}) --</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name || 'Anonymous'} (ID: {emp.id})</option>
                ))}
              </select>
            </div>

            {/* Shift dropdown selector */}
            <div className="space-y-1.5 min-w-[170px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Filter by Shift</label>
              <select
                value={viewShift}
                onChange={(e) => setViewShift(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
              >
                <option value="All Shifts">All Shifts</option>
                <option value="Day Shift">Day Shift</option>
                <option value="Night Shift">Night Shift</option>
              </select>
            </div>

            {/* Right: Manual Text Search Box */}
            <div className="space-y-1.5 flex-grow min-w-[220px]">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Freeform Text search</label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search Name, ID, or Shift Designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-150 focus:bg-white rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition-all text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>

          </div>

          {/* KPI Statistics Metrics Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* KPI 1: Present staff */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex items-center justify-between col-span-1">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Staff Present on Date</span>
                <span className="text-xl font-extrabold text-slate-800 font-sans block">{presentCount} <span className="text-slate-400 text-sm font-semibold">/ {totalStaff}</span></span>
                <div className="w-32 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${(presentCount / (totalStaff || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <Users size={20} />
              </div>
            </div>

            {/* KPI 2: Total Biometric handshakes */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex items-center justify-between col-span-1">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Synced Biometric Hits</span>
                <span className="text-xl font-extrabold text-sky-700 font-sans block">{totalPunchesToday} <span className="text-slate-400 text-xs font-medium uppercase font-mono">Punches</span></span>
                <p className="text-[9.5px] text-slate-400 mt-2 font-mono">Model T52F WiFi device log</p>
              </div>
              <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center shrink-0">
                <Database size={18} />
              </div>
            </div>

            {/* KPI 3: Absentees / Missing loggers */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs flex items-center justify-between col-span-1">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">Unlogged / Absentees</span>
                <span className="text-xl font-extrabold text-rose-600 font-sans block">{absentCount} <span className="text-slate-400 text-sm font-semibold">Employees</span></span>
                <p className="text-[9.5px] text-rose-500 font-bold leading-none mt-2">
                  {((absentCount / (totalStaff || 1)) * 100).toFixed(0)}% Absent rate today
                </p>
              </div>
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
            </div>

          </div>

          {/* MAIN DAILY LIST TABLE */}
          <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-rose-50 bg-slate-50/10 flex justify-between items-center select-none">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                  <Database size={13} className="text-slate-500" />
                  <span>Daily Punch Transcripts Ledger</span>
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Auditing mapped biometric streams for {humanSelectedDate}</p>
              </div>
              <span className="bg-slate-100 border text-slate-600 text-[10px] font-extrabold font-mono px-2.5 py-1 rounded-full uppercase">
                {filteredList.length} staff records matches
              </span>
            </div>

            {loadingHistory ? (
              <div className="p-16 text-center space-y-3 select-none">
                <RefreshCw size={24} className="animate-spin text-teal-600 mx-auto" />
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Locating Biometric Ledger streams...</p>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-16 text-center max-w-sm mx-auto space-y-3 font-sans">
                <AlertCircle size={24} className="text-slate-350 mx-auto animate-bounce" />
                <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider font-mono">No matching records</h5>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  No staff roster logs matched your query. Adjust search tags, selection dropdown, or choose another shift date.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto select-text font-sans">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#f8fafc]/80 text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-150">
                    <tr>
                      <th className="px-5 py-3">Employee ID</th>
                      <th className="px-5 py-3">Staff Details</th>
                      <th className="px-5 py-3">Biometric Chronology (Model T52F)</th>
                      <th className="px-5 py-3 text-center font-mono">Duty Hours</th>
                      <th className="px-5 py-3 text-center">Roster Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                    {filteredList.map((emp) => {
                      const punchesRaw = datePunches[emp.id] || [];
                      const punches = punchesRaw.filter(p => !p.startsWith('00:00') && p.trim() !== '');
                      const dutyObj = calculateDutyHours(punches);
                      
                      // Status evaluations
                      let badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
                      let label = "Absent / Unlogged";

                      if (isEmployeePresent(punches)) {
                        if (punches.length % 2 !== 0) {
                          badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                          label = "Single punch (Missed OUT)";
                        } else {
                          badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-100";
                          label = "Shift Completed";
                        }
                      }

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/40 select-text transition-colors">
                          {/* Col 1: ID */}
                          <td className="px-5 py-4 font-mono font-black uppercase text-[11px] text-slate-800">
                            {emp.id}
                          </td>
                          
                          {/* Col 2: Info */}
                          <td className="px-5 py-4 font-sans">
                            <div>
                              <p className="text-[12.5px] font-black text-slate-800 leading-tight">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">{emp.role || 'Associate Staff'}</p>
                            </div>
                          </td>

                          {/* Col 3: Punches timeline */}
                          <td className="px-5 py-4 font-sans">
                            {punches.length === 0 ? (
                              <span className="text-[10.5px] font-semibold text-slate-350 italic">No device transactions found</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-w-sm">
                                {punches.map((pStr, pIdx) => {
                                  const isIN = pStr.toUpperCase().includes('IN') || pStr.toUpperCase().includes('ARR');
                                  return (
                                    <span
                                      key={pIdx}
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 ${
                                        isIN 
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                                          : 'bg-amber-50 text-amber-800 border-amber-100'
                                      }`}
                                    >
                                      <span className={`w-1 h-1 rounded-full ${isIN ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                      <span>{pStr}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Col 4: Duty hours */}
                          <td className="px-5 py-4 text-center font-mono text-[11px] font-bold text-slate-700 select-all">
                            {dutyObj.formatted}
                          </td>

                          {/* Col 5: Status */}
                          <td className="px-5 py-4 text-center select-none text-[10px]">
                            <span className={`px-2.5 py-1 text-[10px] font-black uppercase font-mono tracking-wider rounded-lg border leading-none inline-block ${badgeColor}`}>
                              {label}
                            </span>
                          </td>

                          {/* Col 6: Actions */}
                          <td className="px-5 py-4 text-right select-none font-sans">
                            <button
                              onClick={() => onViewEmployeeProfile && onViewEmployeeProfile(emp.id)}
                              className="px-3 py-1.5 text-[10px] bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 font-extrabold uppercase rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Inspect full monthly calendar sheets"
                            >
                              <Eye size={11} />
                              <span>View Profile</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ==================== SUB-TAB 2: ORIGINAL EXPORT & STREAM BIOMETRIC CSV FILE ==================== */}
      {activeSubTab === 'upload' && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs animate-fade-in font-sans" id="biometrics-import-hub">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5 mb-5 select-none">
            <div>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 font-mono">
                <Clock size={16} className="text-teal-600 animate-pulse" />
                <span>Biometric WiFi Machine Sync Center</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1 font-sans">Interfacing [model: T52F WiFi] daily reports with Cloud Firestore security matrix.</p>
            </div>
            
            <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-slate-500">
              <span className={`px-2.5 py-1 rounded-full ${step === 1 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>1. OUTSIDE FILE</span>
              <ChevronRight size={10} />
              <span className={`px-2.5 py-1 rounded-full ${step === 2 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>2. CHOOSE MAPPINGS</span>
              <ChevronRight size={10} />
              <span className={`px-2.5 py-1 rounded-full ${step === 3 ? 'bg-teal-50 text-teal-800 border border-teal-150' : 'bg-slate-100'}`}>3. STREAM LIVE</span>
            </div>
          </div>

          {/* Info banners */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 select-none font-sans">
              {modelInstructions.map((info, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5.5 h-5.5 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                      {i === 0 ? <Users size={12} /> : <Clock size={12} />}
                    </div>
                    <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">{info.title}</h5>
                  </div>
                  <ol className="list-decimal pl-4.5 space-y-1 text-[10.5px] leading-relaxed text-slate-500">
                    {info.steps.map((st, sIdx) => (
                      <li key={sIdx}>{st}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* STEP 1: LOAD SHEETS */}
          {step === 1 && (
            <div className="space-y-4 font-sans">
              
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl max-w-md select-none">
                <button
                  type="button"
                  onClick={() => setImportMode('attendance')}
                  className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    importMode === 'attendance'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Sync Biometric Punch Logs (IN-OUT)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('roster')}
                  className={`flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                    importMode === 'roster'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Register Rostered Staff
                </button>
              </div>

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={openFileBrowser}
                className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-teal-500 bg-teal-50/20' 
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-350 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.txt"
                  onChange={handleChange}
                />
                
                <div className="w-11 h-11 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-4">
                  <Upload size={18} className="animate-bounce" />
                </div>

                <h4 className="text-xs font-bold text-slate-800 select-none">
                  {importMode === 'attendance' 
                    ? 'Drop biometric transaction list (T52F WiFi export) here' 
                    : 'Drop your Employee Roster list (.csv) here'}
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 select-none leading-none">
                  Accepts UTF-8 formatted comma-separated CSV reports.
                </p>
                
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs"
                >
                  Browse Reports
                </button>
              </div>

            </div>
          )}

          {/* STEP 2: FIELD PAIRINGS GATEWAY */}
          {step === 2 && (
            <div className="space-y-5 font-sans">
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-start gap-3 select-none">
                <Settings2 size={16} className="text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-[11px] font-bold text-slate-700">Active Biometric Mapping Channel</h5>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    We identified <strong>{parsedRows.length} transactions</strong>. Map columns to database keys. Our multi-punch sequence supports up to 4 checking events (4 INs & 4 OUTs max) per day.
                  </p>
                </div>
              </div>

              {importMode === 'attendance' && (
                <div className="flex items-center gap-3 bg-teal-50/40 p-3 rounded-xl border border-teal-100 select-none">
                  <ToggleLeft size={16} className="text-teal-600" />
                  <div className="flex gap-4.5 text-xs font-semibold">
                    <span className="text-slate-400 block pb-0.5 uppercase tracking-wider text-[9px]">Select Column Layout:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="radio" 
                        name="rowLayout" 
                        checked={rowLayout === 'single'} 
                        onChange={() => setRowLayout('single')}
                      />
                      <span>Single punch per row (Logs sequentially per day)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="radio" 
                        name="rowLayout" 
                        checked={rowLayout === 'multiple'} 
                        onChange={() => setRowLayout('multiple')}
                      />
                      <span>Multiple punched columns in one row (IN1, OUT1...)</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-sans">
                
                {/* Employee ID */}
                <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                    Employee ID Column <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={mappings.id}
                    onChange={(e) => setMappings({ ...mappings, id: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                  >
                    <option value="">-- Choose Key --</option>
                    {rawHeaders.map((h, idx) => (
                      <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 font-sans">Punches group around this standard ID primary index.</p>
                </div>

                {/* Employee Name Column */}
                <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20 mr-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                    Employee Name Column
                  </label>
                  <select
                    value={mappings.name}
                    onChange={(e) => setMappings({ ...mappings, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                  >
                    <option value="">-- Choose Column --</option>
                    {rawHeaders.map((h, idx) => (
                      <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 font-sans">Paints employee names dynamically from headers list.</p>
                </div>

                {/* Date Column (Attendance only) */}
                {importMode === 'attendance' && (
                  <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                      Attendance Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={importDate}
                      onChange={(e) => setImportDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                    />
                    <p className="text-[9px] text-slate-400 font-sans">Choose the date for this attendance sheet import.</p>
                  </div>
                )}

                {/* Shift Selection (Attendance only) */}
                {importMode === 'attendance' && (
                  <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                      Assigned Shift <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={importShift}
                      onChange={(e) => setImportShift(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800 cursor-pointer"
                    >
                      <option value="Day Shift">Day Shift</option>
                      <option value="Night Shift">Night Shift</option>
                    </select>
                    <p className="text-[9px] text-slate-400 font-sans">Choose active shift (Day Shift or Night Shift) for import.</p>
                  </div>
                )}

                {/* Layout-specific Columns: Single punch time */}
                {importMode === 'attendance' && rowLayout === 'single' && (
                  <>
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Punch Time Column <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mappings.punchTime}
                        onChange={(e) => setMappings({ ...mappings, punchTime: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Choose Time --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">The hour/minute column (e.g. 08:00 AM or 13:15:30).</p>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        Punch Status / Type (IN/OUT)
                      </label>
                      <select
                        value={mappings.punchType}
                        onChange={(e) => setMappings({ ...mappings, punchType: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Alternate on duplicate --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-slate-400 font-sans">Checks 'check-in' or 'check-out' descriptors dynamically.</p>
                    </div>
                  </>
                )}

                {/* Layout-specific Columns: Multiple punches columns */}
                {importMode === 'attendance' && rowLayout === 'multiple' && (
                  <>
                    {/* 1. Arr Time */}
                    <div className="p-4 rounded-2xl border border-teal-200 bg-teal-500/5 space-y-2 relative">
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-teal-100 text-teal-800 tracking-wider">7th Column Default</div>
                      <label className="text-[10px] font-black text-teal-850 uppercase tracking-wider block font-mono">
                        1. Arr Time (In1) <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mappings.arrTime}
                        onChange={(e) => setMappings({ ...mappings, arrTime: e.target.value })}
                        className="w-full bg-white border border-teal-200 rounded-xl p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-500 text-slate-850"
                      >
                        <option value="">-- Choose Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                      <p className="text-[8.5px] text-slate-450">Primary arrival punch time. Maps below ROW 8 column 7.</p>
                    </div>

                    {/* 2. Out1 */}
                    <div className="p-4 rounded-2xl border border-teal-150 space-y-2 bg-teal-50/10">
                      <label className="text-[10px] font-black text-teal-850 uppercase tracking-wider block font-mono">
                        2. Out1 (Time)
                      </label>
                      <select
                        value={mappings.out1}
                        onChange={(e) => setMappings({ ...mappings, out1: e.target.value })}
                        className="w-full bg-white border border-teal-200 rounded-xl p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-500 text-slate-850"
                      >
                        <option value="">-- Choose Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. In2 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        3. In2 (Time)
                      </label>
                      <select
                        value={mappings.in2}
                        onChange={(e) => setMappings({ ...mappings, in2: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Out2 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        4. Out2 (Time)
                      </label>
                      <select
                        value={mappings.out2}
                        onChange={(e) => setMappings({ ...mappings, out2: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 5. In3 */}
                    <div className="p-4 rounded-2xl border border-slate-150 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        5. In3 (Time)
                      </label>
                      <select
                        value={mappings.in3}
                        onChange={(e) => setMappings({ ...mappings, in3: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 6. Out3 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        6. Out3 (Time)
                      </label>
                      <select
                        value={mappings.out3}
                        onChange={(e) => setMappings({ ...mappings, out3: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 7. In4 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        7. In4 (Time)
                      </label>
                      <select
                        value={mappings.in4}
                        onChange={(e) => setMappings({ ...mappings, in4: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>

                    {/* 8. Out4 */}
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/25 font-mono">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono">
                        8. Out4 (Time)
                      </label>
                      <select
                        value={mappings.out4}
                        onChange={(e) => setMappings({ ...mappings, out4: e.target.value })}
                        className="w-full bg-white border border-slate-250 text-slate-800 rounded-xl p-2 text-xs font-semibold"
                      >
                        <option value="">-- Skip Col --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h ? `${idx + 1}. ${h}` : `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {/* Roster Mode Fields */}
                {importMode === 'roster' && (
                  <>
                    <div className="p-4 rounded-2xl border border-slate-100 space-y-2 bg-slate-50/20 font-sans">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono font-mono">
                        Monthly Base Salary
                      </label>
                      <select
                        value={mappings.monthlySalary}
                        onChange={(e) => setMappings({ ...mappings, monthlySalary: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-500 text-slate-800"
                      >
                        <option value="">-- Default Core Flat Rate --</option>
                        {rawHeaders.map((h, idx) => (
                          <option key={idx} value={String(idx)}>{h || `(Empty Column ${idx + 1})`}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

              </div>

              <div className="flex gap-3 justify-end pt-5 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={resetState}
                  className="px-4.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={generatePreview}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  <span>Preview Logs</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & FINAL STREAM OUT TO CLOUD */}
          {step === 3 && (
            <div className="space-y-4 font-sans">
              <div className="bg-teal-50 border border-teal-150 p-4.5 rounded-2xl flex items-start gap-3 select-none">
                <CheckCircle2 size={16} className="text-teal-600 mt-0.5 shrink-0" />
                <div>
                  <h5 className="text-[11px] font-bold text-teal-900 uppercase font-mono">Device Punch Stream Matrix Ready</h5>
                  <p className="text-[10px] text-teal-850 leading-relaxed mt-0.5 font-sans">
                    Confirm grouped employee entries below. We mapped <strong>{previewData.length} records</strong>. Execution will record transactional histories directly under secure Employee sheets.
                  </p>
                </div>
              </div>

              <div className="border border-slate-150 rounded-2xl overflow-hidden max-h-80 overflow-y-auto font-sans">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-150 select-none">
                    <tr>
                      <th className="px-4 py-3">Employee ID</th>
                      <th className="px-4 py-3">Full Name</th>
                      {importMode === 'roster' ? (
                        <th className="px-4 py-3">Base Salary (INR)</th>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-center">Sync Date</th>
                          <th className="px-4 py-3">Parsed Punch Chronology (Max 9)</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-right font-mono">Roster Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/40">
                        <td className="px-4 py-3 font-mono text-[11px] font-bold uppercase text-slate-800">{row.employeeId || row.id}</td>
                        <td className="px-4 py-3 text-slate-700">{row.name}</td>
                        {importMode === 'roster' ? (
                          <td className="px-4 py-3 text-slate-800">₹{(row.monthlySalary).toLocaleString('en-IN')}</td>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-center font-mono text-[10.5px] text-slate-500 font-bold">{row.date}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {row.punches.map((pStr: string, pIdx: number) => {
                                  const isIN = pStr.toUpperCase().includes('IN') || pStr.toUpperCase().includes('ARR');
                                  return (
                                    <span 
                                      key={pIdx} 
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                        isIN 
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-150' 
                                          : 'bg-amber-50 text-amber-800 border-amber-150'
                                      }`}
                                    >
                                      {pStr}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-right select-none font-sans">
                          {row.existsInDb ? (
                            <span className="bg-emerald-50 text-emerald-800 text-[9px] font-black font-mono px-2 py-0.5 rounded border border-emerald-100">MATCHED</span>
                          ) : (
                            <span className="bg-amber-50 text-amber-800 text-[9px] font-black font-mono px-2 py-0.5 rounded border border-amber-100 font-mono">NEW ENTRANT</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 justify-end pt-5 border-t border-slate-100 select-none">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={isProcessing}
                  className="px-4.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Back to Map
                </button>
                <button
                  type="button"
                  onClick={commitImportData}
                  disabled={isProcessing}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Streaming to Database...</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-current text-white shrink-0" />
                      <span>Stream punch logs</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
