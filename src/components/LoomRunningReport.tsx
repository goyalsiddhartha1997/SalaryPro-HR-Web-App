/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import {
  FileSpreadsheet,
  Plus,
  Calendar as CalendarIcon,
  X,
  Upload,
  RefreshCw,
  Eye,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertTriangle,
  Play,
  Settings,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Database,
  Check,
  Cpu,
  BarChart3,
  Layers,
  Flame,
  Activity,
  Copy,
  Search,
  ChevronDown,
  User
} from 'lucide-react';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { type LoomRunningReport, LoomRunningRow, Employee } from '../types';
import { INITIAL_EMPLOYEES } from '../data';

interface LoomRunningReportProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

interface OperatorSelectProps {
  value: string;
  onChange: (val: string) => void;
  employees: Employee[];
}

function OperatorSelect({ value, onChange, employees }: OperatorSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return employees.filter(e => (e.name || '').trim() !== '');
    }
    return employees.filter(e => 
      (e.name || '').toLowerCase().includes(q) ||
      (e.id || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  const handleSelect = (empName: string) => {
    onChange(empName);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchQuery(value);
          }}
          placeholder="Operator Name"
          className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 pl-1 pr-6 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white font-semibold truncate"
        />
        <button
          type="button"
          onClick={() => {
            const next = !isOpen;
            setIsOpen(next);
            if (next) {
              setSearchQuery('');
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          tabIndex={-1}
          className="absolute right-0.5 text-slate-400 hover:text-indigo-600 p-0.5 rounded cursor-pointer"
          title="Select / Search Operator from Roster"
        >
          <ChevronDown size={13} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-slate-800 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2 border-b border-slate-100 bg-slate-50/90 flex items-center gap-1.5">
            <Search size={13} className="text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name, ID, role..."
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.slice(0, 60).map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => handleSelect(emp.name)}
                  className={`w-full text-left px-3 py-2 hover:bg-indigo-50/80 transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer ${
                    value === emp.name ? 'bg-indigo-50/60 font-bold text-indigo-900' : 'text-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-slate-900 truncate">
                      {emp.name || 'Unnamed Employee'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1.5">
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded font-bold">#{emp.id}</span>
                      {(emp.designation || emp.department || emp.role) && (
                        <span>• {emp.designation || emp.department || emp.role}</span>
                      )}
                    </div>
                  </div>
                  {value === emp.name && (
                    <Check size={14} className="text-indigo-600 shrink-0" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-3 text-center text-xs text-slate-500 font-medium">
                No matching employee found
              </div>
            )}
          </div>

          {searchQuery && (
            <div className="p-1.5 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => handleSelect(searchQuery)}
                className="w-full text-left px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 hover:bg-indigo-100/70 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={12} />
                <span>Use custom name: <strong className="font-bold">"{searchQuery}"</strong></span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoomRunningReport({ triggerAlert, viewOnly = false }: LoomRunningReportProps) {
  // --- STATE FOR FIRESTORE STREAMING ---
  const [reports, setReports] = useState<LoomRunningReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loomProductions, setLoomProductions] = useState<any[]>([]);

  // --- STATE FOR EMPLOYEES ROSTER (FOR OPERATOR DROPDOWN / SEARCH) ---
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const cache = localStorage.getItem('salarypro_employees_cache');
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return INITIAL_EMPLOYEES.filter(e => (e.name || '').trim() !== '');
  });

  useEffect(() => {
    const q = collection(db, 'employees');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Employee[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Employee;
        if ((data.name || '').trim() !== '') {
          list.push({ id: docSnap.id, ...data });
        }
      });
      if (list.length > 0) {
        setEmployees(list);
      }
    }, (err) => {
      console.warn("Failed to stream employees in LoomRunningReport:", err);
    });
    return () => unsubscribe();
  }, []);

  // --- STATE FOR DATE FILTER MODE ---
  const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
  const [filterShift, setFilterShift] = useState<'ALL' | 'DAY' | 'NIGHT'>('ALL');
  const [singleDate, setSingleDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [rangeEndDate, setRangeEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // --- STATE FOR MANUAL/OCR REPORT CREATION ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [entryShift, setEntryShift] = useState<'DAY' | 'NIGHT'>('DAY');
  
  // Running preview ledger rows
  const [previewRows, setPreviewRows] = useState<LoomRunningRow[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);

  // Shutdown and remarks states
  const [isAllStopped, setIsAllStopped] = useState(false);
  const [remarks, setRemarks] = useState('');

  // Base64 Image reference for preview
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STREAM REPORTS FROM FIRESTORE ---
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'loomRunningReports');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dataList: LoomRunningReport[] = [];
      snapshot.forEach((docSnap) => {
        dataList.push(docSnap.data() as LoomRunningReport);
      });
      // Sort by date descending
      dataList.sort((a, b) => b.date.localeCompare(a.date));
      setReports(dataList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'loomRunningReports');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- STREAM PRODUCTION DATA FROM FIRESTORE ---
  useEffect(() => {
    const q = collection(db, 'loomProductions');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dataList: any[] = [];
      snapshot.forEach((docSnap) => {
        dataList.push(docSnap.data());
      });
      setLoomProductions(dataList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'loomProductions');
    });
    return () => unsubscribe();
  }, []);

  // --- FILTERED REPORTS DATA ---
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const dateMatch = filterMode === 'single'
        ? r.date === singleDate
        : (r.date >= rangeStartDate && r.date <= rangeEndDate);
      
      if (!dateMatch) return false;

      if (filterShift !== 'ALL') {
        return r.shift === filterShift;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [reports, filterMode, singleDate, rangeStartDate, rangeEndDate, filterShift]);

  // --- CALCULATE SUMMARY METRICS FROM FILTERED REPORTS ---
  const metrics = useMemo(() => {
    let totalLoomEntriesCount = 0;
    let runningCount = 0;
    let stoppedCount = 0;
    let totalGsmSum = 0;
    let totalDenierSum = 0;
    let averageSpeedSum = 0;
    let totalMetersSum = 0;
    let grossWtSum = 0;
    let coreWtSum = 0;
    let netWtSum = 0;

    filteredReports.forEach(r => {
      r.rows.forEach(row => {
        totalLoomEntriesCount++;
        if (row.runningStatus === 'Running') {
          runningCount++;
        } else {
          stoppedCount++;
        }
        totalGsmSum += row.gsm || 0;
        totalDenierSum += row.denier || 0;
        averageSpeedSum += row.average || 0;
        totalMetersSum += row.totalMeters || 0;
        grossWtSum += row.grossWt || 0;
        coreWtSum += row.coreWt || 0;
        netWtSum += row.netWt || 0;
      });
    });

    return {
      totalLoomsCount: totalLoomEntriesCount,
      runningCount,
      stoppedCount,
      totalMetersSum,
      totalGrossWt: parseFloat(grossWtSum.toFixed(2)),
      totalCoreWt: parseFloat(coreWtSum.toFixed(2)),
      totalNetWt: parseFloat(netWtSum.toFixed(2)),
      overallAvgWtCalc: totalMetersSum > 0 ? parseFloat((netWtSum / totalMetersSum).toFixed(4)) : 0,
      avgGsm: totalLoomEntriesCount ? parseFloat((totalGsmSum / totalLoomEntriesCount).toFixed(2)) : 0,
      avgDenier: totalLoomEntriesCount ? Math.round(totalDenierSum / totalLoomEntriesCount) : 0,
      avgSpeed: totalLoomEntriesCount ? parseFloat((averageSpeedSum / totalLoomEntriesCount).toFixed(2)) : 0
    };
  }, [filteredReports]);

  // --- MATCHED PRODUCTION METRICS FROM LOOM PRODUCTION REPORT ---
  const matchedProductionEntries = useMemo(() => {
    return loomProductions.filter(p => {
      if (!p.date) return false;
      const dateMatch = filterMode === 'single'
        ? p.date === singleDate
        : (p.date >= rangeStartDate && p.date <= rangeEndDate);

      if (!dateMatch) return false;

      const pShift = (p.shift || 'day').toLowerCase().trim();
      if (filterShift === 'DAY') {
        return pShift === 'day' || pShift.includes('day');
      } else if (filterShift === 'NIGHT') {
        return pShift === 'night' || pShift.includes('night');
      }

      return true;
    });
  }, [loomProductions, filterMode, singleDate, rangeStartDate, rangeEndDate, filterShift]);

  const prodMetrics = useMemo(() => {
    let totalProduction = 0;
    let totalLoomsForProd = 0;
    let totalWastage = 0;
    let entryCount = 0;
    let averageSum = 0;

    matchedProductionEntries.forEach(entry => {
      if (!entry.isStopped) {
        totalProduction += entry.production || 0;
        totalLoomsForProd += entry.looms || 0;
        totalWastage += entry.wastage || 0;
        if (entry.average) {
          averageSum += entry.average;
          entryCount++;
        }
      }
    });

    const avgProduction = totalLoomsForProd > 0 
      ? Math.round(totalProduction / totalLoomsForProd) 
      : (entryCount > 0 ? Math.round(averageSum / entryCount) : 0);

    return {
      totalProduction,
      avgProduction,
      totalWastage,
      hasData: matchedProductionEntries.length > 0
    };
  }, [matchedProductionEntries]);

  // --- LEDGER GROUPED SUMMARY FOR SELECTED DATE(S) ---
  const summaryData = useMemo(() => {
    const grouped: { [key: string]: { quality: string; size: string; gsm: number; runningCount: number; stoppedCount: number; totalMeters: number; totalGrossWt: number; totalNetWt: number; avgWtCalculated: number } } = {};
    
    filteredReports.forEach((report) => {
      report.rows.forEach((row) => {
        const q = (row.quality || '').trim();
        const s = (row.size || '').trim();
        const g = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0;
        const m = row.totalMeters || 0;
        const gw = row.grossWt || 0;
        const nw = row.netWt || 0;
        const isRunning = row.runningStatus === 'Running';
        
        // Key based on quality, size, and GSM
        const key = `${q}||${s}||${g}`;
        
        if (!grouped[key]) {
          grouped[key] = {
            quality: q,
            size: s,
            gsm: g,
            runningCount: 0,
            stoppedCount: 0,
            totalMeters: 0,
            totalGrossWt: 0,
            totalNetWt: 0,
            avgWtCalculated: 0
          };
        }
        
        if (isRunning) {
          grouped[key].runningCount += 1;
        } else {
          grouped[key].stoppedCount += 1;
        }
        grouped[key].totalMeters += m;
        grouped[key].totalGrossWt += gw;
        grouped[key].totalNetWt += nw;
      });
    });

    return Object.values(grouped).map(item => ({
      ...item,
      totalGrossWt: parseFloat(item.totalGrossWt.toFixed(2)),
      totalNetWt: parseFloat(item.totalNetWt.toFixed(2)),
      avgWtCalculated: item.totalMeters > 0 ? parseFloat((item.totalNetWt / item.totalMeters).toFixed(4)) : 0
    })).sort((a, b) => {
      const qComp = a.quality.localeCompare(b.quality);
      if (qComp !== 0) return qComp;
      
      const sComp = a.size.localeCompare(b.size);
      if (sComp !== 0) return sComp;
      
      return a.gsm - b.gsm;
    });
  }, [filteredReports]);

  // --- RECONSTRUCT REPORT FROM PRE-EXISTING DATA FOR EDITING ---
  const handleEditClick = (report: LoomRunningReport) => {
    setEditingReportId(report.id);
    setEntryDate(report.date);
    setEntryShift(report.shift || 'DAY');
    setPreviewRows([...report.rows]);
    setUploadedImageBase64(null);
    setIsAllStopped(!!report.isAllStopped);
    setRemarks(report.remarks || '');
    setShowAddModal(true);
  };

  // --- SUBMIT COMPLETED REPORT TO FIRESTORE ---
  const handleSubmitReport = async () => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in Sandbox Mode. Database modifications are restricted.');
      return;
    }

    if (!entryDate) {
      triggerAlert('warn', 'Please specify a valid report date.');
      return;
    }

    if (!isAllStopped && previewRows.length === 0) {
      triggerAlert('warn', 'The report ledger cannot be submitted empty. Please add rows, upload an image, or mark the plant looms as stopped.');
      return;
    }

    if (isAllStopped && !remarks.trim()) {
      triggerAlert('warn', 'Please provide a remark/reason for why the looms were stopped.');
      return;
    }

    setIsSubmitting(true);
    try {
      const docId = `${entryDate}_${entryShift}`;
      const cleanRows = previewRows.map(row => ({
        ...row,
        totalMeters: typeof row.totalMeters === 'number' ? row.totalMeters : parseFloat(row.totalMeters as any) || 0,
        gsm: typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0,
        denier: typeof row.denier === 'number' ? row.denier : parseInt(row.denier as any) || 0,
        average: typeof row.average === 'number' ? row.average : parseFloat(row.average as any) || 0,
        grossWt: typeof row.grossWt === 'number' ? row.grossWt : parseFloat(row.grossWt as any) || 0,
        coreWt: typeof row.coreWt === 'number' ? row.coreWt : parseFloat(row.coreWt as any) || 0,
        netWt: typeof row.netWt === 'number' ? row.netWt : parseFloat(row.netWt as any) || 0,
        avgWtCalculated: typeof row.avgWtCalculated === 'number' ? row.avgWtCalculated : parseFloat(row.avgWtCalculated as any) || 0,
      }));

      const payload: LoomRunningReport = {
        id: docId,
        date: entryDate,
        shift: entryShift,
        rows: isAllStopped ? [] : cleanRows,
        createdAt: new Date().toISOString(),
        isAllStopped: isAllStopped,
        remarks: isAllStopped ? remarks.trim() : ''
      };

      await setDoc(doc(doc(db, 'loomRunningReports', docId).firestore, 'loomRunningReports', docId), payload);

      // If we edited an old record and renamed its ID, delete the original document ID
      if (editingReportId && editingReportId !== docId) {
        await deleteDoc(doc(db, 'loomRunningReports', editingReportId));
      }

      triggerAlert('success', `Loom Running Report for ${formatDateLabel(entryDate)} (${entryShift === 'NIGHT' ? 'Night Shift' : 'Day Shift'}) has been successfully saved.`);
      setShowAddModal(false);
      resetModalState();
    } catch (err) {
      console.error('Error submitting report:', err);
      triggerAlert('warn', 'Failed to submit report. Please check database permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE REPORT ENTIRELY ---
  const handleDeleteReport = async (id: string, dateLabel: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Viewing in Sandbox Mode. Database modifications are restricted.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the Loom Running Report for ${dateLabel}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'loomRunningReports', id));
      triggerAlert('success', `Loom Running Report for ${dateLabel} deleted.`);
    } catch (err) {
      console.error('Error deleting report:', err);
      triggerAlert('warn', 'Failed to delete record.');
    }
  };

  // --- HANDWRITTEN REPORT OCR EXTRACTION PIPELINE ---
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    triggerAlert('info', 'Analyzing handwritten document... Calling server-side Gemini API.');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const cleanBase64 = base64String.split(',')[1];
        setUploadedImageBase64(base64String);

        // Send to our full-stack server API route
        const response = await fetch('/api/extract-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            imageBase64: cleanBase64,
            mimeType: file.type
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Server returned an error status.');
        }

        if (data.success && Array.isArray(data.rows)) {
          setPreviewRows(data.rows);
          triggerAlert('success', `Successfully extracted ${data.rows.length} rows from handwritten report! Review details below.`);
        } else {
          throw new Error('Failed to parse a valid list of ledger rows from image.');
        }
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Failed to extract report data from image:', err);
      triggerAlert('warn', `Extraction Failed: ${err.message || 'Please upload a clearer image of the handwritten notes.'}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // --- COPY DATA FROM LAST REPORT ---
  const handleCopyLastReportData = () => {
    if (reports.length === 0) {
      triggerAlert('info', 'No previous reports found in database to copy from.');
      return;
    }

    // Find the latest filled report with rows
    const lastReport = reports.find(
      (r) => r.id !== editingReportId && r.rows && r.rows.length > 0 && !r.isAllStopped
    ) || reports.find((r) => r.rows && r.rows.length > 0 && !r.isAllStopped);

    if (!lastReport || !lastReport.rows || lastReport.rows.length === 0) {
      triggerAlert('info', 'No filled report with loom rows found to copy from.');
      return;
    }

    // Clone all rows from the last report
    const copiedRows: LoomRunningRow[] = lastReport.rows.map((row) => ({
      ...row,
    }));

    setPreviewRows(copiedRows);
    setIsAllStopped(false);

    const dateLabel = formatDateLabel(lastReport.date);
    const shiftLabel = lastReport.shift === 'NIGHT' ? 'Night Shift' : 'Day Shift';
    triggerAlert('success', `Successfully copied ${copiedRows.length} loom rows from last report (${dateLabel} - ${shiftLabel}).`);
  };

  // --- MANUALLY ADD A ROW TO PREVIEW/LEDGER ---
  const handleAddEmptyRow = () => {
    const nextLoomNo = previewRows.length > 0 
      ? String(Math.max(...previewRows.map(r => parseInt(r.loomNo) || 0)) + 1)
      : '1';

    const newRow: LoomRunningRow = {
      loomNo: nextLoomNo,
      operatorName: '',
      totalMeters: '' as any,
      quality: '',
      size: '',
      gsm: '' as any,
      denier: '' as any,
      average: '' as any,
      grossWt: '' as any,
      coreWt: '' as any,
      netWt: '' as any,
      avgWtCalculated: '' as any,
      runningStatus: 'Running',
      remarks: ''
    };
    setPreviewRows([...previewRows, newRow]);
  };

  // --- DELETE A ROW FROM PREVIEW/LEDGER ---
  const handleDeletePreviewRow = (idx: number) => {
    const updated = previewRows.filter((_, i) => i !== idx);
    setPreviewRows(updated);
  };

  // --- UPDATE PREVIEW LEDGER VALUE ---
  const handleUpdatePreviewCell = (idx: number, field: keyof LoomRunningRow, value: any) => {
    const updated = [...previewRows];
    const updatedRow = {
      ...updated[idx],
      [field]: value
    };

    // Auto-calculate average if size or gsm was updated
    if (field === 'size' || field === 'gsm') {
      const sizeStr = String(updatedRow.size || '');
      const sizeMatch = sizeStr.match(/[\d.]+/);
      const sizeNum = sizeMatch ? parseFloat(sizeMatch[0]) : 0;
      const gsmNum = typeof updatedRow.gsm === 'number' ? updatedRow.gsm : parseFloat(updatedRow.gsm as any) || 0;
      if (sizeNum > 0 && gsmNum > 0) {
        updatedRow.average = parseFloat((sizeNum * gsmNum).toFixed(2));
      }
    }

    // Auto-calculate Net Wt and Avg Wt [calculated] when gross/core/net/totalMeters change
    if (field === 'grossWt' || field === 'coreWt') {
      const g = typeof updatedRow.grossWt === 'number' ? updatedRow.grossWt : parseFloat(updatedRow.grossWt as any) || 0;
      const c = typeof updatedRow.coreWt === 'number' ? updatedRow.coreWt : parseFloat(updatedRow.coreWt as any) || 0;
      if (g > 0 || c > 0) {
        updatedRow.netWt = parseFloat(Math.max(0, g - c).toFixed(3));
        const m = typeof updatedRow.totalMeters === 'number' ? updatedRow.totalMeters : parseFloat(updatedRow.totalMeters as any) || 0;
        if (m > 0 && updatedRow.netWt > 0) {
          updatedRow.avgWtCalculated = parseFloat((updatedRow.netWt / m).toFixed(4));
        }
      }
    } else if (field === 'netWt' || field === 'totalMeters') {
      const n = typeof updatedRow.netWt === 'number' ? updatedRow.netWt : parseFloat(updatedRow.netWt as any) || 0;
      const m = typeof updatedRow.totalMeters === 'number' ? updatedRow.totalMeters : parseFloat(updatedRow.totalMeters as any) || 0;
      if (m > 0 && n > 0) {
        updatedRow.avgWtCalculated = parseFloat((n / m).toFixed(4));
      }
    }

    updated[idx] = updatedRow;
    setPreviewRows(updated);
  };

  const resetModalState = () => {
    setEntryDate(new Date().toISOString().split('T')[0]);
    setEntryShift('DAY');
    setPreviewRows([]);
    setEditingReportId(null);
    setUploadedImageBase64(null);
    setIsAllStopped(false);
    setRemarks('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- EXPORT METRICS TO EXCEL ---
  const handleExportToExcel = async () => {
    if (filteredReports.length === 0) {
      triggerAlert('info', 'No reports available to export.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Loom Running Report');
      worksheet.views = [{ showGridLines: true }];

      const thickBlackBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF000000' } },
        left: { style: 'medium' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF000000' } },
        right: { style: 'medium' as const, color: { argb: 'FF000000' } },
      };

      // 1. EXECUTIVE HEADER BANNER (Row 1)
      worksheet.mergeCells('A1:O1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'FORTUNE FLEXIPACK PVT LIMITED • LOOM RUNNING REPORT LEDGER SUMMARY';
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 42;

      for (let col = 1; col <= 15; col++) {
        worksheet.getRow(1).getCell(col).border = thickBlackBorder;
      }

      // 2. SUB-BANNER DATE RANGE (Row 2)
      worksheet.mergeCells('A2:O2');
      const dateCell = worksheet.getCell('A2');
      const periodLabel = filterMode === 'single' ? formatDateLabel(singleDate) : `${formatDateLabel(rangeStartDate)} TO ${formatDateLabel(rangeEndDate)}`;
      const shiftLabel = filterShift === 'ALL' ? 'ALL SHIFTS' : `${filterShift} SHIFT`;
      dateCell.value = `EXPORT PERIOD: ${periodLabel} • SHIFT: ${shiftLabel}`;
      dateCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 24;

      for (let col = 1; col <= 15; col++) {
        worksheet.getRow(2).getCell(col).border = thickBlackBorder;
      }

      // 3. COMPLETE METRICS CARDS (Rows 4 to 8)
      let totalRowsCount = 0;
      let runningCount = 0;
      let stoppedCount = 0;
      let sumAvgGrams = 0;
      let sumGsm = 0;
      let sumDenier = 0;
      let sumTotalMeters = 0;
      let sumGrossWt = 0;
      let sumCoreWt = 0;
      let sumNetWt = 0;

      filteredReports.forEach((report) => {
        report.rows.forEach((row) => {
          totalRowsCount++;
          if (row.runningStatus === 'Running') {
            runningCount++;
          } else {
            stoppedCount++;
          }
          sumAvgGrams += row.average || 0;
          sumGsm += row.gsm || 0;
          sumDenier += row.denier || 0;
          sumTotalMeters += row.totalMeters || 0;
          sumGrossWt += row.grossWt || 0;
          sumCoreWt += row.coreWt || 0;
          sumNetWt += row.netWt || 0;
        });
      });

      const overallAvg = totalRowsCount > 0 ? (sumAvgGrams / totalRowsCount).toFixed(2) : '0';
      const avgGsmVal = totalRowsCount > 0 ? (sumGsm / totalRowsCount).toFixed(2) : '0';
      const avgDenierVal = totalRowsCount > 0 ? Math.round(sumDenier / totalRowsCount) : 0;
      const utilizationVal = totalRowsCount > 0 ? Math.round((runningCount / totalRowsCount) * 100) : 0;
      const calcAvgWtVal = sumTotalMeters > 0 ? (sumNetWt / sumTotalMeters).toFixed(4) : '0';

      worksheet.getRow(3).height = 10; // Spacer

      // Metrics Grid Header Banner
      worksheet.mergeCells('A4:O4');
      const mHeaderCell = worksheet.getCell('A4');
      mHeaderCell.value = 'APP PAGE METRICS SUMMARY & REAL-TIME LOOM PRODUCTION INTEGRATION';
      mHeaderCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      mHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(4).height = 22;
      for (let col = 1; col <= 15; col++) worksheet.getRow(4).getCell(col).border = thickBlackBorder;

      // Single KPI Row (Row 5 & 6) containing remaining metrics
      worksheet.mergeCells('A5:C5'); worksheet.mergeCells('A6:C6');
      worksheet.mergeCells('D5:F5'); worksheet.mergeCells('D6:F6');
      worksheet.mergeCells('G5:I5'); worksheet.mergeCells('G6:I6');
      worksheet.mergeCells('J5:L5'); worksheet.mergeCells('J6:L6');
      worksheet.mergeCells('M5:O5'); worksheet.mergeCells('M6:O6');

      worksheet.getCell('A5').value = 'LOOMS TRACKED';
      worksheet.getCell('A6').value = `${totalRowsCount} Looms (${runningCount} Running / ${stoppedCount} Stopped)`;

      worksheet.getCell('D5').value = 'AVG FABRIC WEIGHT & QUALITY';
      worksheet.getCell('D6').value = `${overallAvg} g (GSM: ${avgGsmVal} | Denier: ${avgDenierVal} D)`;

      worksheet.getCell('G5').value = 'TOTAL PRODUCTION (REAL-TIME)';
      worksheet.getCell('G6').value = `${prodMetrics.totalProduction.toLocaleString()} Meters (${prodMetrics.hasData ? 'Synced' : 'No Data'})`;

      worksheet.getCell('J5').value = 'AVG PRODUCTION RATE';
      worksheet.getCell('J6').value = `${prodMetrics.avgProduction.toLocaleString()} M/Loom (${prodMetrics.hasData ? 'Synced' : 'No Data'})`;

      worksheet.getCell('M5').value = 'TOTAL WASTAGE (REAL-TIME)';
      worksheet.getCell('M6').value = `${prodMetrics.totalWastage.toLocaleString()} KG (${prodMetrics.hasData ? 'Synced from Loom Prod' : 'No Data'})`;

      worksheet.getRow(5).height = 18;
      for (let col = 1; col <= 15; col++) {
        const c = worksheet.getRow(5).getCell(col);
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      worksheet.getRow(6).height = 24;
      for (let col = 1; col <= 15; col++) {
        const c = worksheet.getRow(6).getCell(col);
        c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      // 4. DATA TABLE HEADER (Row 8)
      worksheet.getRow(7).height = 12; // Spacer
      const headers = ['Report Date', 'Loom Number', 'Loom Operator Name', 'Total Meters', 'Weave Quality', 'Size', 'GSM', 'Denier', 'Average Weight (g)', 'Gross Wt (kg)', 'Core Wt (kg)', 'Net Wt (kg)', 'Avg Wt [calc] (kg)', 'Running Status', 'Remarks'];
      const headerRow = worksheet.getRow(8);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBlackBorder;
      });

      // 5. DATA ROWS
      let currentR = 9;
      filteredReports.forEach((report) => {
        const readableDate = formatDateLabel(report.date);
        report.rows.forEach((row) => {
          const r = worksheet.getRow(currentR);
          r.height = 22;

          const rowValues = [
            readableDate,
            row.loomNo,
            row.operatorName || '-',
            row.totalMeters || 0,
            row.quality,
            row.size,
            row.gsm,
            row.denier,
            row.average || 0,
            row.grossWt || 0,
            row.coreWt || 0,
            row.netWt || 0,
            row.avgWtCalculated || 0,
            row.runningStatus || 'Running',
            row.remarks || '-'
          ];

          rowValues.forEach((val, colIdx) => {
            const cell = r.getCell(colIdx + 1);
            cell.value = val;
            cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.border = thickBlackBorder;

            if (colIdx === 3) { // Total Meters
              cell.numFmt = '#,##0';
            } else if (colIdx === 8) { // Average Weight
              cell.numFmt = '#,##0.00';
            } else if (colIdx === 9 || colIdx === 10 || colIdx === 11) { // Gross Wt, Core Wt, Net Wt
              cell.numFmt = '#,##0.00';
            } else if (colIdx === 12) { // Avg Wt [calc]
              cell.numFmt = '#,##0.0000';
            }
          });

          currentR++;
        });
      });

      // 6. TOTALS ROW
      const totalsRow = worksheet.getRow(currentR);
      totalsRow.height = 26;
      for (let c = 1; c <= 15; c++) {
        const cell = totalsRow.getCell(c);
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thickBlackBorder;
      }

      totalsRow.getCell(1).value = 'TOTALS';
      totalsRow.getCell(2).value = `${totalRowsCount} Looms`;
      totalsRow.getCell(4).value = sumTotalMeters;
      totalsRow.getCell(4).numFmt = '#,##0';
      totalsRow.getCell(9).value = Number(overallAvg);
      totalsRow.getCell(9).numFmt = '#,##0.00';
      totalsRow.getCell(10).value = sumGrossWt;
      totalsRow.getCell(10).numFmt = '#,##0.00';
      totalsRow.getCell(11).value = sumCoreWt;
      totalsRow.getCell(11).numFmt = '#,##0.00';
      totalsRow.getCell(12).value = sumNetWt;
      totalsRow.getCell(12).numFmt = '#,##0.00';
      totalsRow.getCell(13).value = sumTotalMeters > 0 ? (sumNetWt / sumTotalMeters) : 0;
      totalsRow.getCell(13).numFmt = '#,##0.0000';
      totalsRow.getCell(14).value = `${runningCount} Running / ${stoppedCount} Stopped`;
      totalsRow.getCell(15).value = '-';

      // 7. COLUMN WIDTHS
      worksheet.columns = [
        { width: 15 }, // Report Date
        { width: 16 }, // Loom Number
        { width: 22 }, // Operator Name
        { width: 16 }, // Total Meters
        { width: 24 }, // Weave Quality
        { width: 14 }, // Size
        { width: 10 }, // GSM
        { width: 10 }, // Denier
        { width: 20 }, // Average Weight (g)
        { width: 16 }, // Gross Wt (kg)
        { width: 15 }, // Core Wt (kg)
        { width: 16 }, // Net Wt (kg)
        { width: 20 }, // Avg Wt [calc] (kg)
        { width: 22 }, // Running Status
        { width: 30 }  // Remarks
      ];

      // ==========================================
      // WORKSHEET 2: LEDGER SUMMARY (VIEW SUMMARY)
      // ==========================================
      const worksheet2 = workbook.addWorksheet('Ledger Summary');
      worksheet2.views = [{ showGridLines: true }];

      // 1. BANNER HEADER (Row 1)
      worksheet2.mergeCells('A1:I1');
      const sumTitleCell = worksheet2.getCell('A1');
      sumTitleCell.value = 'FORTUNE FLEXIPACK PVT LIMITED • LEDGER SUMMARY REPORT (BY QUALITY, SIZE & GSM)';
      sumTitleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
      sumTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet2.getRow(1).height = 40;

      for (let col = 1; col <= 9; col++) {
        worksheet2.getRow(1).getCell(col).border = thickBlackBorder;
      }

      // 2. SUB-BANNER (Row 2)
      worksheet2.mergeCells('A2:I2');
      const sumDateCell = worksheet2.getCell('A2');
      sumDateCell.value = `EXPORT PERIOD: ${periodLabel}`;
      sumDateCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
      sumDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet2.getRow(2).height = 24;

      for (let col = 1; col <= 9; col++) {
        worksheet2.getRow(2).getCell(col).border = thickBlackBorder;
      }

      // 3. TABLE HEADERS (Row 4)
      worksheet2.getRow(3).height = 12; // Spacer
      const sumHeaders = ['Quality', 'Size', 'GSM', 'Total Meters (m)', 'Gross Wt (kg)', 'Net Wt (kg)', 'Avg Wt [calc] (kg)', 'Looms Running', 'Looms Stopped'];
      const sumHeaderRow = worksheet2.getRow(4);
      sumHeaderRow.height = 28;
      sumHeaders.forEach((h, idx) => {
        const cell = sumHeaderRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBlackBorder;
      });

      // 4. DATA ROWS FOR SUMMARY WORKSHEET
      let sumCurrentR = 5;
      summaryData.forEach((item) => {
        const r = worksheet2.getRow(sumCurrentR);
        r.height = 22;

        const rowValues = [
          item.quality || '-',
          item.size || '-',
          item.gsm || 0,
          item.totalMeters || 0,
          item.totalGrossWt || 0,
          item.totalNetWt || 0,
          item.avgWtCalculated || 0,
          item.runningCount || 0,
          item.stoppedCount || 0
        ];

        rowValues.forEach((val, colIdx) => {
          const cell = r.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = thickBlackBorder;

          if (colIdx === 3) { // Total Meters
            cell.numFmt = '#,##0';
          } else if (colIdx === 4 || colIdx === 5) { // Gross Wt, Net Wt
            cell.numFmt = '#,##0.00';
          } else if (colIdx === 6) { // Avg Wt [calc]
            cell.numFmt = '#,##0.0000';
          } else if (colIdx === 7 || colIdx === 8) { // Looms Running / Stopped
            cell.numFmt = '#,##0';
          }
        });

        sumCurrentR++;
      });

      // 5. TOTALS ROW FOR SUMMARY WORKSHEET
      const sumTotalsRow = worksheet2.getRow(sumCurrentR);
      sumTotalsRow.height = 26;
      for (let c = 1; c <= 9; c++) {
        const cell = sumTotalsRow.getCell(c);
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thickBlackBorder;
      }

      const sumSummaryMeters = summaryData.reduce((acc, i) => acc + (i.totalMeters || 0), 0);
      const sumSummaryGross = summaryData.reduce((acc, i) => acc + (i.totalGrossWt || 0), 0);
      const sumSummaryNet = summaryData.reduce((acc, i) => acc + (i.totalNetWt || 0), 0);
      const sumSummaryRunning = summaryData.reduce((acc, i) => acc + (i.runningCount || 0), 0);
      const sumSummaryStopped = summaryData.reduce((acc, i) => acc + (i.stoppedCount || 0), 0);
      const avgSummaryCalculated = sumSummaryMeters > 0 ? (sumSummaryNet / sumSummaryMeters) : 0;

      sumTotalsRow.getCell(1).value = 'TOTALS';
      sumTotalsRow.getCell(2).value = '-';
      sumTotalsRow.getCell(3).value = '-';
      sumTotalsRow.getCell(4).value = sumSummaryMeters;
      sumTotalsRow.getCell(4).numFmt = '#,##0';
      sumTotalsRow.getCell(5).value = sumSummaryGross;
      sumTotalsRow.getCell(5).numFmt = '#,##0.00';
      sumTotalsRow.getCell(6).value = sumSummaryNet;
      sumTotalsRow.getCell(6).numFmt = '#,##0.00';
      sumTotalsRow.getCell(7).value = avgSummaryCalculated;
      sumTotalsRow.getCell(7).numFmt = '#,##0.0000';
      sumTotalsRow.getCell(8).value = sumSummaryRunning;
      sumTotalsRow.getCell(8).numFmt = '#,##0';
      sumTotalsRow.getCell(9).value = sumSummaryStopped;
      sumTotalsRow.getCell(9).numFmt = '#,##0';

      // 6. COLUMN WIDTHS FOR SUMMARY WORKSHEET
      worksheet2.columns = [
        { width: 25 }, // Quality
        { width: 14 }, // Size
        { width: 12 }, // GSM
        { width: 18 }, // Total Meters (m)
        { width: 16 }, // Gross Wt (kg)
        { width: 16 }, // Net Wt (kg)
        { width: 22 }, // Avg Wt [calc] (kg)
        { width: 18 }, // Looms Running
        { width: 18 }  // Looms Stopped
      ];

      const fileName = `Loom_Running_Report_${filterMode === 'single' ? singleDate : `${rangeStartDate}_to_${rangeEndDate}`}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);

      triggerAlert('success', `Spreadsheet downloaded as ${fileName}`);
    } catch (err) {
      console.error('Failed to export Loom Running Report:', err);
      triggerAlert('warn', 'Failed to generate Excel sheet.');
    }
  };

  // --- HELPER: FORMAT DATE TO "DD/MM/YYYY" ---
  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="loom-running-report-root">
      
      {/* 🌟 1. EXECUTIVE HEADER BANNER */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-3xl p-8 mb-8 shadow-md relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full translate-x-12 -translate-y-12 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-600/5 rounded-full -translate-x-12 translate-y-12 blur-xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-10 bg-indigo-500 rounded-full"></span>
              <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest font-mono">AI Handwriting OCR Extraction Enabled</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase" style={{ fontFamily: '"Georgia", serif' }}>
              Loom Running Report
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              Daily running status tracking ledger, specifications, and handwriting digitisation portal
            </p>
          </div>
          
          <div className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/50 py-3 px-5 rounded-2xl flex items-center gap-3 self-start md:self-auto shadow-inner">
            <Cpu size={18} className="text-indigo-400 shrink-0" />
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Model Pipeline</p>
              <p className="text-xs font-black text-slate-200">Gemini 3.5 Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🎛️ 2. FILTER & ACTION DASHBOARD TOOLBAR */}
      <div className="bg-white border border-slate-150 rounded-3xl p-6 mb-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Left: Filter Controls */}
          <div className="flex-1 flex flex-col sm:flex-row sm:items-end gap-4">
            
            <div className="flex-1">
              <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Filter Mode</label>
              <div className="inline-flex rounded-xl bg-slate-50 p-1 border border-slate-100">
                <button
                  type="button"
                  onClick={() => setFilterMode('single')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'single' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Single Date
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('range')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'range' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Date Range
                </button>
              </div>
            </div>

            {/* Dynamic controls mirroring raw materials inventory style */}
            {filterMode === 'single' ? (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(singleDate);
                    d.setDate(d.getDate() - 1);
                    setSingleDate(d.toISOString().split('T')[0]);
                  }}
                  className="h-9 w-9 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 active:scale-95 transition-all cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="h-9 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-extrabold focus:outline-none focus:border-indigo-400 focus:bg-white text-slate-700 w-full sm:w-40 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(singleDate);
                    d.setDate(d.getDate() + 1);
                    setSingleDate(d.toISOString().split('T')[0]);
                  }}
                  className="h-9 w-9 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 active:scale-95 transition-all cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSingleDate(new Date().toISOString().split('T')[0])}
                  className="h-9 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
                >
                  Today
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 w-full sm:w-auto">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold w-full sm:w-auto">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black pr-1">From</span>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className="bg-transparent border-none p-0 text-xs font-extrabold focus:outline-none text-slate-700 w-full sm:w-32 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold w-full sm:w-auto">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black pr-1">To</span>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className="bg-transparent border-none p-0 text-xs font-extrabold focus:outline-none text-slate-700 w-full sm:w-32 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setRangeStartDate(today);
                    setRangeEndDate(today);
                  }}
                  className="h-9 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
                >
                  Today
                </button>
              </div>
            )}

            {/* Shift Filter Dropdown */}
            <div className="w-full sm:w-40 shrink-0">
              <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Shift Filter</label>
              <select
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value as 'ALL' | 'DAY' | 'NIGHT')}
                className="h-9 w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="ALL">✨ All Shifts</option>
                <option value="DAY">☀️ Day Shift</option>
                <option value="NIGHT">🌙 Night Shift</option>
              </select>
            </div>

          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 shrink-0 w-full lg:w-auto justify-end">
            <button
              type="button"
              onClick={() => setShowSummaryPopup(true)}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/5 border border-indigo-100 w-full sm:w-auto"
              id="view-summary-btn"
            >
              <BarChart3 size={15} />
              View Summary
            </button>
            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/5 border border-emerald-100 w-full sm:w-auto"
              id="export-running-report"
            >
              <FileSpreadsheet size={15} />
              Export Excel
            </button>
            {!viewOnly && (
              <button
                type="button"
                onClick={() => {
                  resetModalState();
                  setShowAddModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10 w-full sm:w-auto"
                id="add-running-report-btn"
              >
                <Plus size={15} />
                Upload Report / Add
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 📊 3. THE TOP METRICS SUMMARY */}
      <div className="mb-8" id="running-metrics-summary">
        <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 select-none flex items-center gap-1.5">
          <Cpu size={14} className="text-slate-400" />
          Report Summary Metrics ({filterMode === 'single' ? formatDateLabel(singleDate) : 'Selected Period'})
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card: Total Looms Logged */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Looms Tracked</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-slate-800 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {metrics.totalLoomsCount || '0'}
                  <span className="text-xs font-bold text-slate-400">Looms</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center font-bold">
                <Layers size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Running</p>
                <p className="text-xs font-black text-emerald-600 mt-0.5">
                  {metrics.runningCount} Active
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Stopped</p>
                <p className="text-xs font-black text-amber-600 mt-0.5">
                  {metrics.stoppedCount} Stopped
                </p>
              </div>
            </div>
          </div>

          {/* Card: Running & Stopped Combined */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Active Running</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-emerald-600 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {metrics.runningCount || '0'}
                  <span className="text-xs font-bold text-emerald-500">Active</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Check size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Stopped</p>
                <p className="text-xs font-black text-amber-600 mt-0.5">
                  {metrics.stoppedCount} Stopped
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Utilization</p>
                <p className="text-xs font-black text-slate-700 mt-0.5">
                  {metrics.totalLoomsCount ? `${Math.round((metrics.runningCount / metrics.totalLoomsCount) * 100)}%` : '0%'}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Avg Parameters */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Avg Weight & Quality</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-indigo-700 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {metrics.avgSpeed || '0'}
                  <span className="text-xs font-bold text-slate-400">g</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Cpu size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Avg GSM</p>
                <p className="text-xs font-black text-indigo-600 mt-0.5">
                  {metrics.avgGsm} GSM
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Avg Denier</p>
                <p className="text-xs font-black text-indigo-600 mt-0.5">
                  {metrics.avgDenier} D
                </p>
              </div>
            </div>
          </div>

          {/* Card: Total Production */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Production</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-emerald-700 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {prodMetrics.totalProduction ? prodMetrics.totalProduction.toLocaleString() : '0'}
                  <span className="text-xs font-bold text-emerald-500">M</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Sparkles size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Units</p>
                <p className="text-xs font-black text-slate-600 mt-0.5">Meters</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Report</p>
                <p className={`text-xs font-black mt-0.5 ${prodMetrics.hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {prodMetrics.hasData ? 'Synced' : 'No Data'}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Average Production */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Avg Production</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-indigo-700 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {prodMetrics.avgProduction ? prodMetrics.avgProduction.toLocaleString() : '0'}
                  <span className="text-xs font-bold text-indigo-500">M</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Activity size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Rate</p>
                <p className="text-xs font-black text-indigo-600 mt-0.5">M/Loom</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Report</p>
                <p className={`text-xs font-black mt-0.5 ${prodMetrics.hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {prodMetrics.hasData ? 'Synced' : 'No Data'}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Total Wastage */}
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Wastage</p>
                <h3 className="text-xl xl:text-lg 2xl:text-2xl font-black text-rose-700 mt-2 font-mono whitespace-nowrap flex items-baseline gap-0.5">
                  {prodMetrics.totalWastage ? prodMetrics.totalWastage.toLocaleString() : '0'}
                  <span className="text-xs font-bold text-rose-500">KG</span>
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <Flame size={18} />
              </div>
            </div>
            
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between relative z-10">
              <div>
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Units</p>
                <p className="text-xs font-black text-slate-600 mt-0.5">Kilograms</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-extrabold uppercase tracking-widest">Report</p>
                <p className={`text-xs font-black mt-0.5 ${prodMetrics.hasData ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {prodMetrics.hasData ? 'Synced' : 'No Data'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📜 4. LOOM RUNNING LEDGER TABLE */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg" id="loom-running-ledger-box">
        <div className="p-6 border-b border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/85">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></div>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 tracking-wider">
                Loom Running Ledger Section
              </h3>
              <p className="text-[11px] text-slate-450 font-medium">Verified active loom configurations, GSM, Denier, and performance ratings</p>
            </div>
          </div>
          <span className="bg-indigo-50 text-indigo-700 text-xs font-extrabold uppercase px-3.5 py-1.5 rounded-full border border-indigo-100 shadow-xs tracking-wider">
            {filteredReports.length} {filteredReports.length === 1 ? 'Report Logged' : 'Reports Logged'}
          </span>
        </div>

        {loading ? (
          <div className="py-24 text-center text-slate-400 font-bold uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
            Synchronizing Loom Running ledger with Cloud database...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-24 text-center text-slate-400 select-none uppercase tracking-widest text-xs font-bold flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
              <Info size={32} />
            </div>
            <span>No Running Report entries logged for the selected period.</span>
            <p className="text-[11px] text-slate-400 lowercase font-normal">Use "Upload Daily report / Add" to scan or key-in a running report</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {filteredReports.map((report) => (
              <div key={report.id} className="border-b last:border-b-0 border-slate-150 p-6 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b border-dashed border-slate-150 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalendarIcon className="text-indigo-500" size={16} />
                    <span className="text-sm font-extrabold text-slate-900">{formatDateLabel(report.date)} Report Ledger</span>
                    {report.shift && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        report.shift === 'NIGHT' ? 'bg-slate-950 text-slate-100 border border-slate-800' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {report.shift === 'NIGHT' ? '🌙 Night Shift' : '☀️ Day Shift'}
                      </span>
                    )}

                    {/* REAL-TIME MATCHED WASTAGE & PRODUCTION METRICS FROM LOOM PRODUCTION REPORT */}
                    {(() => {
                      const repShift = (report.shift || 'day').toLowerCase().trim();
                      const matchedProd = loomProductions.find(p => 
                        p.date === report.date && 
                        (p.shift || 'day').toLowerCase().trim().includes(repShift)
                      );
                      if (matchedProd) {
                        return (
                          <div className="flex items-center gap-2 text-xs flex-wrap ml-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                              <Flame size={12} className="text-rose-500" />
                              Wastage: {matchedProd.wastage != null ? matchedProd.wastage : 0} KG
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                              <Sparkles size={12} className="text-emerald-500" />
                              Production: {matchedProd.production != null ? matchedProd.production.toLocaleString() : 0} M
                            </span>
                          </div>
                        );
                      }
                      return (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200">
                          No Prod Logged
                        </span>
                      );
                    })()}
                  </div>
                  {!viewOnly && (
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <button
                        type="button"
                        onClick={() => handleEditClick(report)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-xl text-xs font-extrabold uppercase inline-flex items-center gap-1 border border-slate-200/80 transition-colors cursor-pointer"
                        title="Edit Report"
                      >
                        <Edit2 size={13} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(report.id, formatDateLabel(report.date))}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-700 rounded-xl text-xs font-extrabold uppercase inline-flex items-center gap-1 border border-slate-200/80 transition-colors cursor-pointer"
                        title="Delete Report"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {report.isAllStopped ? (
                  <div className="bg-rose-50/50 border border-rose-150 rounded-2xl p-6 mb-2 flex flex-col md:flex-row items-start md:items-center gap-4 animate-fade-in">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-150 shadow-2xs">
                      <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                        <h4 className="text-sm font-black uppercase text-rose-800 tracking-wide">
                          Loom Plant Shut Down / Stopped for the Day
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-450 font-bold uppercase tracking-wider">
                        No looms were running on this date.
                      </p>
                      {report.remarks && (
                        <div className="mt-3 bg-white/80 border border-rose-100/85 p-4 rounded-xl text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed shadow-3xs max-w-2xl">
                          <span className="text-[9px] font-black uppercase tracking-widest text-rose-700 block mb-1">Reason for shutdown:</span>
                          {report.remarks}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[600px] border border-slate-150 rounded-2xl shadow-xs relative">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-slate-900 text-slate-100 text-[11px] md:text-[12px] font-black uppercase tracking-wider select-none shadow-xs">
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0">Loom Number</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0">Operator Name</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-right">Total Meters</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0">Quality</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-center">Size</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-center">GSM</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-center">Denier</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-center">Average Weight</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-right">Gross Wt (kg)</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-right">Core Wt (kg)</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-right">Net Wt (kg)</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-right">Avg Wt [calc] (kg)</th>
                            <th className="py-3 px-4 border-r border-slate-800 bg-slate-900 sticky top-0 text-center">Running Status</th>
                            <th className="py-3 px-4 bg-slate-900 sticky top-0 text-center">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-[12px] md:text-[13px] font-bold text-slate-800">
                          {report.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-indigo-50/5 transition-colors">
                              <td className="py-3 px-4 border-r border-slate-150 text-slate-900 font-extrabold text-center">
                                {String(row.loomNo || '').replace(/loom/gi, '').replace(/#/g, '').replace(/-/g, '').trim()}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 font-semibold text-slate-800">
                                {row.operatorName || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-black text-emerald-700">
                                {row.totalMeters ? row.totalMeters.toLocaleString() : '0'} <span className="text-[10px] text-slate-400 font-semibold">m</span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150">
                                {row.quality}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center">
                                {row.size}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono">
                                {row.gsm} <span className="text-[9px] text-slate-400 font-semibold uppercase">gsm</span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-indigo-900">
                                {row.denier}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono">
                                {row.average} <span className="text-[9px] text-slate-400 font-semibold uppercase">g</span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-bold text-slate-800">
                                {row.grossWt != null ? row.grossWt : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono text-slate-600">
                                {row.coreWt != null ? row.coreWt : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-black text-indigo-700">
                                {row.netWt != null ? row.netWt : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-black text-emerald-700">
                                {row.avgWtCalculated != null ? row.avgWtCalculated : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center">
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  row.runningStatus === 'Running'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                    : 'bg-red-50 text-red-700 border border-red-150'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${row.runningStatus === 'Running' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                  {row.runningStatus}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center text-xs text-slate-600 max-w-[150px] truncate" title={row.remarks || ''}>
                                {row.remarks || ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View Card List */}
                    <div className="block md:hidden grid grid-cols-1 gap-4">
                      {report.rows.map((row, rIdx) => (
                        <div key={rIdx} className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 space-y-3.5 shadow-2xs hover:shadow-xs transition-shadow">
                          <div className="flex justify-between items-center pb-2.5 border-b border-slate-150">
                            <div>
                              <span className="text-slate-900 font-extrabold text-sm block">Loom #{row.loomNo}</span>
                              {row.operatorName && (
                                <span className="text-xs text-indigo-600 font-bold block mt-0.5">Op: {row.operatorName}</span>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              row.runningStatus === 'Running'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                : 'bg-red-50 text-red-700 border border-red-150'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${row.runningStatus === 'Running' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                              {row.runningStatus}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-1">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Total Meters</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">{row.totalMeters ? row.totalMeters.toLocaleString() : 0} m</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Quality</span>
                              <span className="text-xs font-bold text-slate-800 leading-snug block">{row.quality}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-dashed border-slate-150">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Size</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.size}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">GSM</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.gsm} <span className="text-[9px] text-slate-400 font-semibold uppercase">gsm</span></span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Denier</span>
                              <span className="text-xs font-black text-indigo-900 font-mono">{row.denier}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Avg Weight</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.average} <span className="text-[9px] text-slate-400 font-semibold uppercase">g</span></span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-dashed border-slate-150">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Gross Wt</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.grossWt != null ? row.grossWt : '-'} kg</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Core Wt</span>
                              <span className="text-xs font-black text-slate-600 font-mono">{row.coreWt != null ? row.coreWt : '-'} kg</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Net Wt</span>
                              <span className="text-xs font-black text-indigo-700 font-mono">{row.netWt != null ? row.netWt : '-'} kg</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Avg Wt [calc]</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">{row.avgWtCalculated != null ? row.avgWtCalculated : '-'} kg</span>
                            </div>
                          </div>

                          {row.remarks && (
                            <div className="pt-2 border-t border-dashed border-slate-150">
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Remarks</span>
                              <span className="text-xs font-semibold text-slate-700 block">{row.remarks}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================== MODAL: PHOTO UPLOAD & PREVIEW / ADD ==================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in" id="running-add-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-6 shadow-xl w-full max-w-[98vw] 2xl:max-w-[1920px] max-h-[95vh] flex flex-col animate-scale-up select-none overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex flex-wrap justify-between items-center border-b border-slate-100 pb-3.5 mb-4 flex-shrink-0 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-2xs border border-indigo-100">
                  <Upload size={18} />
                </div>
                <div>
                  <h4 className="text-base font-black uppercase text-slate-850 tracking-tight">
                    {editingReportId ? 'Edit Loom Running Report' : 'Upload & Digitise Running Report'}
                  </h4>
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                    Upload a handwritten paper photo, copy previous report data, or manually key-in daily machine logs
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetModalState();
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
              
              {/* Left column: Controls & Upload */}
              <div className="lg:col-span-3 space-y-4 overflow-y-auto pr-1.5 max-h-full">
                {/* Date select */}
                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Report Ledger Date</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>

                {/* Shift select */}
                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Shift</label>
                  <select
                    value={entryShift}
                    onChange={(e) => setEntryShift(e.target.value as 'DAY' | 'NIGHT')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    <option value="DAY">☀️ Day Shift</option>
                    <option value="NIGHT">🌙 Night Shift</option>
                  </select>
                </div>

                {/* All Stopped Checkbox */}
                <div className="bg-rose-50/30 border border-rose-150 rounded-2xl p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllStopped}
                      onChange={(e) => {
                        setIsAllStopped(e.target.checked);
                        if (e.target.checked) {
                          setPreviewRows([]);
                        }
                      }}
                      className="mt-0.5 h-4 w-4 text-rose-600 border-rose-300 rounded-sm focus:ring-rose-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-black text-rose-850 uppercase tracking-wide">
                        Loom Plant Not Running / Stopped
                      </span>
                      <p className="text-[10px] text-slate-500 font-medium leading-tight">
                        Check this if all looms were shut down or stopped for the day
                      </p>
                    </div>
                  </label>

                  {isAllStopped && (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="block text-[9px] font-black text-rose-800 uppercase tracking-wider">
                        Shutdown Reason / Remarks <span className="text-red-500 font-black">*</span>
                      </label>
                      <textarea
                        required
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Please input the reason for shutdown (e.g., Power failure, Maintenance, Holiday...)"
                        rows={3}
                        className="w-full bg-white border border-rose-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                  )}
                </div>

                {/* Upload Section */}
                {!isAllStopped ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3 shadow-2xs">
                      {isExtracting ? (
                        <RefreshCw className="animate-spin" size={20} />
                      ) : (
                        <Upload size={20} />
                      )}
                    </div>
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1">Handwritten OCR Pipeline</h5>
                    <p className="text-[10px] text-slate-450 font-medium mb-4 max-w-[200px]">
                      {isExtracting ? 'Synthesizing handwriting characters...' : 'Upload daily handwritten notes for automatic machine data extraction'}
                    </p>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                      id="image-file-selector"
                      disabled={isExtracting}
                    />
                    
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isExtracting}
                      className={`px-4 h-9 ${isExtracting ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 hover:bg-slate-850 text-white'} rounded-xl font-bold text-[10px] tracking-wider uppercase cursor-pointer active:scale-95 transition-all w-full flex items-center justify-center gap-1.5`}
                    >
                      {isExtracting ? 'Processing API...' : 'Select Report Image'}
                    </button>
                  </div>
                ) : (
                  <div className="bg-rose-50/10 border border-dashed border-rose-200 rounded-2xl p-5 text-center flex flex-col items-center justify-center">
                    <Info className="text-rose-500 mb-2" size={24} />
                    <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider">Note Upload Skipped</span>
                    <p className="text-[9px] text-slate-450 mt-1 max-w-[180px]">
                      Since the plant was stopped, no handwritten paper logs or image files are required.
                    </p>
                  </div>
                )}

                {/* Document Preview Thumbnail if available */}
                {!isAllStopped && uploadedImageBase64 && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100 p-2.5 border-b border-slate-200 flex justify-between items-center">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Eye size={12} />
                        Uploaded Note Reference
                      </span>
                      <button
                        type="button"
                        onClick={() => setUploadedImageBase64(null)}
                        className="text-slate-400 hover:text-red-500 text-[10px]"
                      >
                        Remove
                      </button>
                    </div>
                    <img
                      src={uploadedImageBase64}
                      alt="Source report reference"
                      className="max-h-[160px] w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              {/* Right column: Interactive Preview Ledger */}
              <div className="lg:col-span-9 flex flex-col h-full min-h-0 overflow-hidden">
                {isAllStopped ? (
                  <div className="flex-1 border border-rose-150 rounded-3xl bg-rose-50/10 flex flex-col items-center justify-center p-8 text-center select-none min-h-[300px]">
                    <AlertTriangle className="text-rose-500 mb-3" size={48} />
                    <span className="text-sm font-black text-rose-800 uppercase tracking-wider">Plant Looms Stopped Mode</span>
                    <p className="text-xs text-slate-500 max-w-[400px] mt-2 font-medium leading-relaxed">
                      You have selected that the plant was stopped for the day. Saving this ledger will record a 0% utilization status with your specified remarks.
                    </p>
                    {remarks.trim() ? (
                      <div className="mt-4 p-4 bg-white border border-rose-200 rounded-2xl max-w-md text-left w-full shadow-2xs">
                        <span className="text-[9px] font-black text-rose-800 uppercase tracking-widest block mb-1">Configured Shutdown Reason:</span>
                        <p className="text-xs font-bold text-slate-700 whitespace-pre-wrap">{remarks}</p>
                      </div>
                    ) : (
                      <div className="mt-4 text-[10px] text-rose-600 font-extrabold uppercase tracking-wider animate-pulse">
                        ⚠️ Please fill in the Shutdown Reason / Remarks in the left panel to proceed.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Database size={13} className="text-slate-400" />
                        Interactive Ledger Preview
                      </h5>
                      {previewRows.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyLastReportData}
                            className="px-3 h-7 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg font-black text-[9px] tracking-wider uppercase transition-colors inline-flex items-center gap-1 border border-amber-200/80 cursor-pointer"
                            title="Copy rows from last submitted report"
                          >
                            <Copy size={11} className="text-amber-600" />
                            Copy Last Report Data
                          </button>
                          <button
                            type="button"
                            onClick={handleAddEmptyRow}
                            className="px-3 h-7 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black text-[9px] tracking-wider uppercase transition-colors inline-flex items-center gap-1 border border-indigo-100 cursor-pointer"
                          >
                            <Plus size={11} />
                            Add Manual Row
                          </button>
                        </div>
                      )}
                    </div>

                    {previewRows.length === 0 ? (
                      <div className="flex-1 border border-slate-150 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center p-8 text-center select-none min-h-[250px]">
                        <Info className="text-slate-350 mb-2" size={32} />
                        <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Preview Ledger Empty</span>
                        <p className="text-[10px] text-slate-450 max-w-[320px] mt-1 mb-4 font-medium leading-relaxed">
                          Click "Copy Data from Last Report" to fill with yesterday's machine specifications, upload an image file of paper logs, or add manual rows.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={handleCopyLastReportData}
                            className="px-4 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-[10px] tracking-wider uppercase shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Copy size={13} />
                            Copy Data from Last Report
                          </button>
                          <button
                            type="button"
                            onClick={handleAddEmptyRow}
                            className="px-4 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[10px] tracking-wider uppercase shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Plus size={13} />
                            Add Manual Row
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-150 rounded-2xl shadow-inner max-h-[calc(88vh-190px)] min-h-[350px] relative">
                        <table className="w-full text-left border-collapse min-w-[1650px]">
                          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-100 shadow-xs">
                            <tr className="text-[10px] font-black uppercase tracking-wider border-b border-slate-800 bg-slate-900">
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[70px] bg-slate-900 sticky top-0">Loom #</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 min-w-[170px] bg-slate-900 sticky top-0">Loom Operator Name</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[100px] bg-slate-900 sticky top-0">Total Meters</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 min-w-[125px] bg-slate-900 sticky top-0">Quality</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[85px] bg-slate-900 sticky top-0">Size</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[75px] bg-slate-900 sticky top-0">GSM</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[80px] bg-slate-900 sticky top-0">Denier</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Average Weight</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Gross Wt (kg)</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[90px] bg-slate-900 sticky top-0">Core Wt (kg)</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Net Wt (kg)</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[110px] bg-slate-900 sticky top-0">Avg Wt [calc] (kg)</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[115px] bg-slate-900 sticky top-0">Status</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[160px] bg-slate-900 sticky top-0">Remarks</th>
                              <th className="py-2.5 px-3 text-center min-w-[50px] bg-slate-900 sticky top-0">Delete</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-xs font-bold text-slate-700">
                            {previewRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-16">
                                  <input
                                    type="text"
                                    value={row.loomNo}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'loomNo', e.target.value)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 font-black focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-44">
                                  <OperatorSelect
                                    value={row.operatorName || ''}
                                    onChange={(val) => handleUpdatePreviewCell(idx, 'operatorName', val)}
                                    employees={employees}
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-24 text-center">
                                  <input
                                    type="text"
                                    value={row.totalMeters === 0 || row.totalMeters === '' || row.totalMeters === undefined || row.totalMeters === null ? '' : row.totalMeters}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'totalMeters', e.target.value)}
                                    placeholder="Meters"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-emerald-700 focus:outline-none focus:bg-white font-mono text-center font-black"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150">
                                  <input
                                    type="text"
                                    value={row.quality || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'quality', e.target.value)}
                                    placeholder="Quality"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.size || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'size', e.target.value)}
                                    placeholder="Size"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-16 text-center">
                                  <input
                                    type="text"
                                    value={row.gsm === 0 || row.gsm === '' || row.gsm === undefined || row.gsm === null ? '' : row.gsm}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'gsm', e.target.value)}
                                    placeholder="GSM"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.denier === 0 || row.denier === '' || row.denier === undefined || row.denier === null ? '' : row.denier}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'denier', e.target.value)}
                                    placeholder="Denier"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.average === 0 || row.average === '' || row.average === undefined || row.average === null ? '' : row.average}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'average', e.target.value)}
                                    placeholder="Average"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.grossWt === 0 || row.grossWt === '' || row.grossWt === undefined || row.grossWt === null ? '' : row.grossWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'grossWt', e.target.value)}
                                    placeholder="Gross"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center font-bold"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.coreWt === 0 || row.coreWt === '' || row.coreWt === undefined || row.coreWt === null ? '' : row.coreWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'coreWt', e.target.value)}
                                    placeholder="Core"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.netWt === 0 || row.netWt === '' || row.netWt === undefined || row.netWt === null ? '' : row.netWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'netWt', e.target.value)}
                                    placeholder="Net"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-indigo-700 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-24 text-center">
                                  <input
                                    type="text"
                                    value={row.avgWtCalculated === 0 || row.avgWtCalculated === '' || row.avgWtCalculated === undefined || row.avgWtCalculated === null ? '' : row.avgWtCalculated}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'avgWtCalculated', e.target.value)}
                                    placeholder="Avg Calc"
                                    className="w-full bg-transparent border-b border-transparent focus:border-emerald-500 px-1 py-0.5 text-xs text-emerald-700 font-extrabold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-28 text-center">
                                  <select
                                    value={row.runningStatus}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'runningStatus', e.target.value)}
                                    className="bg-transparent border-none text-xs font-black uppercase text-slate-855 focus:outline-none cursor-pointer"
                                  >
                                    <option value="Running">🟢 Running</option>
                                    <option value="Stopped">🔴 Stopped</option>
                                  </select>
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-40 text-center">
                                  <input
                                    type="text"
                                    value={row.remarks || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'remarks', e.target.value)}
                                    placeholder="Remarks (if any)"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center font-semibold"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 text-center w-12">
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePreviewRow(idx)}
                                    className="text-slate-450 hover:text-red-500 p-0.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-3.5 mt-4 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetModalState();
                }}
                className="px-5 h-10 bg-slate-100 hover:bg-slate-150 text-slate-600 rounded-xl font-bold text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSubmitReport}
                disabled={isSubmitting || (!isAllStopped && previewRows.length === 0) || (isAllStopped && !remarks.trim())}
                className={`px-5 h-10 ${((!isAllStopped && previewRows.length === 0) || (isAllStopped && !remarks.trim())) ? 'bg-indigo-300 text-indigo-50 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer`}
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>{editingReportId ? 'Update Ledger' : 'Submit & Lock Ledger'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📊 SUMMARY POPUP MODAL */}
      {showSummaryPopup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 z-50 animate-fade-in" id="summary-popup-overlay">
          <div className="bg-white rounded-3xl w-full max-w-5xl 2xl:max-w-6xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100 shadow-2xs">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                    Ledger Summary Report
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                    Summarized by Quality, Size &amp; GSM for {filterMode === 'single' ? formatDateLabel(singleDate) : 'Selected Period'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSummaryPopup(false)}
                className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content / Scrollable area */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {summaryData.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold uppercase tracking-wider text-xs">
                  No active running loom entries found for this period.
                </div>
              ) : (
                <>
                  {/* Desktop View Table */}
                  <div className="hidden sm:block border border-slate-150 rounded-2xl overflow-x-auto overflow-y-auto max-h-[500px] shadow-xs relative">
                    <table className="w-full text-left border-collapse min-w-[920px]">
                      <thead className="sticky top-0 z-10 bg-slate-50 shadow-2xs">
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <th className="px-3.5 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">Quality</th>
                          <th className="px-3.5 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">Size</th>
                          <th className="px-3.5 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">GSM</th>
                          <th className="px-3.5 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Total Meters</th>
                          <th className="px-3.5 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Gross Wt (kg)</th>
                          <th className="px-3.5 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Net Wt (kg)</th>
                          <th className="px-3.5 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Avg Wt [calc] (kg)</th>
                          <th className="px-3.5 py-3.5 text-center whitespace-nowrap bg-slate-50 sticky top-0">Looms Running</th>
                          <th className="px-3.5 py-3.5 text-center whitespace-nowrap bg-slate-50 sticky top-0">Looms Stopped</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs font-bold text-slate-700">
                            <td className="px-3.5 py-3.5 font-extrabold text-slate-800 whitespace-nowrap">{item.quality || '-'}</td>
                            <td className="px-3.5 py-3.5 whitespace-nowrap">{item.size || '-'}</td>
                            <td className="px-3.5 py-3.5 font-mono whitespace-nowrap">{item.gsm || '-'}</td>
                            <td className="px-3.5 py-3.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                              {item.totalMeters ? item.totalMeters.toLocaleString() : '0'} m
                            </td>
                            <td className="px-3.5 py-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                              {item.totalGrossWt || 0}
                            </td>
                            <td className="px-3.5 py-3.5 text-right font-mono font-black text-indigo-700 whitespace-nowrap">
                              {item.totalNetWt || 0}
                            </td>
                            <td className="px-3.5 py-3.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                              {item.avgWtCalculated || 0}
                            </td>
                            <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full font-black text-xs whitespace-nowrap">
                                <span>{item.runningCount}</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider">Running</span>
                              </span>
                            </td>
                            <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-full font-black text-xs whitespace-nowrap">
                                <span>{item.stoppedCount}</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider">Stopped</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View Card List */}
                  <div className="block sm:hidden space-y-3">
                    {summaryData.map((item, idx) => (
                      <div key={idx} className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex justify-between items-start gap-2 border-b border-slate-150 pb-2.5">
                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none">Quality</span>
                            <span className="text-xs font-black text-slate-800 leading-snug block">{item.quality || '-'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full font-black text-[10px] uppercase tracking-wider whitespace-nowrap">
                              {item.runningCount} Running
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-full font-black text-[10px] uppercase tracking-wider whitespace-nowrap">
                              {item.stoppedCount} Stopped
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Size</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{item.size || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">GSM</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{item.gsm || '-'} <span className="text-[9px] text-slate-400 font-semibold uppercase">gsm</span></span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Meters</span>
                            <span className="text-xs font-black text-emerald-700 font-mono">{item.totalMeters ? item.totalMeters.toLocaleString() : 0} m</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-150 bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSummaryPopup(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
