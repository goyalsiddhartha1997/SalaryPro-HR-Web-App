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
  BarChart3
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { type LoomRunningReport, LoomRunningRow } from '../types';

interface LoomRunningReportProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function LoomRunningReport({ triggerAlert, viewOnly = false }: LoomRunningReportProps) {
  // --- STATE FOR FIRESTORE STREAMING ---
  const [reports, setReports] = useState<LoomRunningReport[]>([]);
  const [loading, setLoading] = useState(true);

  // --- STATE FOR DATE FILTER MODE ---
  const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
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

  // --- FILTERED REPORTS DATA ---
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (filterMode === 'single') {
        return r.date === singleDate;
      } else {
        return r.date >= rangeStartDate && r.date <= rangeEndDate;
      }
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [reports, filterMode, singleDate, rangeStartDate, rangeEndDate]);

  // --- CALCULATE SUMMARY METRICS FROM FILTERED REPORTS ---
  const metrics = useMemo(() => {
    let totalLoomEntriesCount = 0;
    let runningCount = 0;
    let stoppedCount = 0;
    let totalGsmSum = 0;
    let totalDenierSum = 0;
    let averageSpeedSum = 0;

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
      });
    });

    return {
      totalLoomsCount: totalLoomEntriesCount,
      runningCount,
      stoppedCount,
      avgGsm: totalLoomEntriesCount ? parseFloat((totalGsmSum / totalLoomEntriesCount).toFixed(2)) : 0,
      avgDenier: totalLoomEntriesCount ? Math.round(totalDenierSum / totalLoomEntriesCount) : 0,
      avgSpeed: totalLoomEntriesCount ? parseFloat((averageSpeedSum / totalLoomEntriesCount).toFixed(2)) : 0
    };
  }, [filteredReports]);

  // --- LEDGER GROUPED SUMMARY FOR SELECTED DATE(S) ---
  const summaryData = useMemo(() => {
    const grouped: { [key: string]: { quality: string; size: string; gsm: number; runningCount: number } } = {};
    
    filteredReports.forEach((report) => {
      report.rows.forEach((row) => {
        const q = (row.quality || '').trim();
        const s = (row.size || '').trim();
        const g = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0;
        const isRunning = row.runningStatus === 'Running';
        
        // Key based on quality, size, and GSM
        const key = `${q}||${s}||${g}`;
        
        if (!grouped[key]) {
          grouped[key] = {
            quality: q,
            size: s,
            gsm: g,
            runningCount: 0
          };
        }
        
        if (isRunning) {
          grouped[key].runningCount += 1;
        }
      });
    });

    // Convert to array and sort: quality first, then size, then GSM
    return Object.values(grouped).sort((a, b) => {
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
      const payload: LoomRunningReport = {
        id: docId,
        date: entryDate,
        shift: entryShift,
        rows: isAllStopped ? [] : previewRows,
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

  // --- MANUALLY ADD A ROW TO PREVIEW/LEDGER ---
  const handleAddEmptyRow = () => {
    const nextLoomNo = previewRows.length > 0 
      ? String(Math.max(...previewRows.map(r => parseInt(r.loomNo) || 0)) + 1)
      : '1';

    const newRow: LoomRunningRow = {
      loomNo: nextLoomNo,
      quality: '12x12 White',
      size: '24"',
      gsm: 3.5,
      denier: 600,
      average: 84.0, // 24 * 3.5
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
      updatedRow.average = parseFloat((sizeNum * gsmNum).toFixed(2));
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
  const handleExportToExcel = () => {
    if (filteredReports.length === 0) {
      triggerAlert('info', 'No reports available to export.');
      return;
    }

    try {
      const finalAoAData: any[][] = [
        ['FORTUNE FLEXIPACK PVT LIMITED'],
        ['LOOM RUNNING REPORT LEDGER SUMMARY'],
        [`Export Period: ${filterMode === 'single' ? formatDateLabel(singleDate) : `${formatDateLabel(rangeStartDate)} to ${formatDateLabel(rangeEndDate)}`}`],
        [],
        ['Report Date', 'Loom Number', 'Quality', 'Size', 'GSM', 'Denier', 'Average (grams)', 'Running Status', 'Remarks']
      ];

      filteredReports.forEach((report) => {
        const readableDate = formatDateLabel(report.date);
        report.rows.forEach((row) => {
          finalAoAData.push([
            readableDate,
            row.loomNo,
            row.quality,
            row.size,
            row.gsm,
            row.denier,
            row.average,
            row.runningStatus,
            row.remarks || ''
          ]);
        });
      });

      const worksheet = XLSX.utils.aoa_to_sheet(finalAoAData);
      
      // Auto-set column widths for pristine printing
      worksheet['!cols'] = [
        { wch: 15 }, // Report Date
        { wch: 15 }, // Loom Number
        { wch: 22 }, // Quality
        { wch: 12 }, // Size
        { wch: 10 }, // GSM
        { wch: 10 }, // Denier
        { wch: 15 }, // Average Speed
        { wch: 15 }, // Status
        { wch: 25 }  // Remarks
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Loom Running Report');

      const fileName = `Loom_Running_Report_${filterMode === 'single' ? singleDate : `${rangeStartDate}_to_${rangeEndDate}`}.xlsx`;
      XLSX.writeFile(workbook, fileName);

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

          </div>

          {/* Right: Actions */}
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowSummaryPopup(true)}
              className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-indigo-600/5 border border-indigo-100 w-full sm:w-auto"
              id="view-summary-btn"
            >
              <BarChart3 size={16} />
              View Summary
            </button>
            <button
              type="button"
              onClick={handleExportToExcel}
              className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-emerald-600/5 border border-emerald-100 w-full sm:w-auto"
              id="export-running-report"
            >
              <FileSpreadsheet size={16} />
              Export Excel
            </button>
            {!viewOnly && (
              <button
                type="button"
                onClick={() => {
                  resetModalState();
                  setShowAddModal(true);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10 w-full sm:w-auto"
                id="add-running-report-btn"
              >
                <Plus size={16} />
                Upload Daily report / Add
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
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card: Total Looms Logged */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Looms Tracked</p>
              <h3 className="text-2xl font-black text-slate-800 mt-2">
                {metrics.totalLoomsCount ? `${metrics.totalLoomsCount} Looms` : '0 Looms'}
              </h3>
            </div>
            <p className="text-[9px] text-slate-450 font-medium mt-4 pt-2.5 border-t border-slate-100 uppercase tracking-wider">
              Sum of recorded loom instances
            </p>
          </div>

          {/* Card: Running & Stopped Combined */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Active Running</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">
              {metrics.runningCount ? `${metrics.runningCount} Active` : '0 Active'}
            </h3>
            
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Stopped Looms</p>
                <p className="text-sm font-black text-amber-600 mt-0.5">
                  {metrics.stoppedCount ? `${metrics.stoppedCount} Stopped` : '0 Stopped'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Utilization</p>
                <p className="text-xs font-black text-slate-700 mt-0.5">
                  {metrics.totalLoomsCount ? `${Math.round((metrics.runningCount / metrics.totalLoomsCount) * 100)}%` : '0%'}
                </p>
              </div>
            </div>
          </div>

          {/* Card: Avg Parameters */}
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Avg Weight & Quality</p>
              <h3 className="text-2xl font-black text-indigo-700 mt-2 font-mono">
                {metrics.avgSpeed} <span className="text-xs text-slate-450">g</span>
              </h3>
            </div>
            <p className="text-[9px] text-indigo-500 font-medium mt-4 pt-2.5 border-t border-slate-100 uppercase tracking-wider">
              Avg: {metrics.avgGsm} GSM / {metrics.avgDenier} Denier
            </p>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b border-dashed border-slate-150">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="text-indigo-500" size={16} />
                    <span className="text-sm font-extrabold text-slate-900">{formatDateLabel(report.date)} Report Ledger</span>
                    {report.shift && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        report.shift === 'NIGHT' ? 'bg-slate-950 text-slate-100 border border-slate-800' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {report.shift === 'NIGHT' ? '🌙 Night Shift' : '☀️ Day Shift'}
                      </span>
                    )}
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
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse border border-slate-150 rounded-2xl overflow-hidden shadow-xs">
                        <thead>
                          <tr className="bg-slate-900 text-slate-100 text-[11px] md:text-[12px] font-black uppercase tracking-wider select-none border-b border-slate-800">
                            <th className="py-3 px-4 border-r border-slate-800">Loom Number</th>
                            <th className="py-3 px-4 border-r border-slate-800">Quality</th>
                            <th className="py-3 px-4 border-r border-slate-800 text-center">Size</th>
                            <th className="py-3 px-4 border-r border-slate-800 text-center">GSM</th>
                            <th className="py-3 px-4 border-r border-slate-800 text-center">Denier</th>
                            <th className="py-3 px-4 border-r border-slate-800 text-center">Average Weight</th>
                            <th className="py-3 px-4 border-r border-slate-800 text-center">Running Status</th>
                            <th className="py-3 px-4 text-center">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 text-[12px] md:text-[13px] font-bold text-slate-800">
                          {report.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-indigo-50/5 transition-colors">
                              <td className="py-3 px-4 border-r border-slate-150 text-slate-900 font-extrabold">
                                Loom #{row.loomNo}
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
                            <span className="text-slate-900 font-extrabold text-sm">Loom #{row.loomNo}</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              row.runningStatus === 'Running'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                : 'bg-red-50 text-red-700 border border-red-150'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${row.runningStatus === 'Running' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                              {row.runningStatus}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none">Quality</span>
                            <span className="text-xs font-bold text-slate-800 leading-snug block">{row.quality}</span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" id="running-add-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl w-full max-w-7xl max-h-[95vh] overflow-y-auto animate-scale-up select-none">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shadow-2xs border border-indigo-100">
                  <Upload size={18} />
                </div>
                <div>
                  <h4 className="text-base font-black uppercase text-slate-850 tracking-tight">
                    {editingReportId ? 'Edit Loom Running Report' : 'Upload & Digitise Running Report'}
                  </h4>
                  <p className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                    Upload a handwritten paper photo or manually key-in daily machine logs
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left column: Controls & Upload */}
              <div className="lg:col-span-4 space-y-4">
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
              <div className="lg:col-span-8 flex flex-col h-full min-h-[300px]">
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
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Database size={13} className="text-slate-400" />
                        Interactive Ledger Preview
                      </h5>
                      <button
                        type="button"
                        onClick={handleAddEmptyRow}
                        className="px-3 h-7 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-black text-[9px] tracking-wider uppercase transition-colors inline-flex items-center gap-1 border border-indigo-100 cursor-pointer"
                      >
                        <Plus size={11} />
                        Add Manual Row
                      </button>
                    </div>

                    {previewRows.length === 0 ? (
                      <div className="flex-1 border border-slate-150 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center p-8 text-center select-none min-h-[250px]">
                        <Info className="text-slate-350 mb-2" size={32} />
                        <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Preview Ledger Empty</span>
                        <p className="text-[10px] text-slate-450 max-w-[280px] mt-1 font-medium">
                          Upload an image file of the handwritten paper report to parse, or click "Add Manual Row" to populate rows manually
                        </p>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-x-auto border border-slate-150 rounded-2xl shadow-inner max-h-[600px]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-slate-100 text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                              <th className="py-2.5 px-3 border-r border-slate-800">Loom #</th>
                              <th className="py-2.5 px-3 border-r border-slate-800">Quality</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">Size</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">GSM</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">Denier</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">Average</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">Status</th>
                              <th className="py-2.5 px-3 border-r border-slate-800 text-center">Remarks</th>
                              <th className="py-2.5 px-3 text-center">Delete</th>
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
                                <td className="py-1.5 px-2.5 border-r border-slate-150">
                                  <input
                                    type="text"
                                    value={row.quality}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'quality', e.target.value)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.size}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'size', e.target.value)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-16 text-center">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={row.gsm === 0 ? '' : row.gsm}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'gsm', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="number"
                                    value={row.denier === 0 ? '' : row.denier}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'denier', parseInt(e.target.value) || 0)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={row.average === 0 ? '' : row.average}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'average', parseFloat(e.target.value) || 0)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
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
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="summary-popup-overlay">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                    Ledger Summary Report
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                    Summarized for {filterMode === 'single' ? formatDateLabel(singleDate) : 'Selected Period'}
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
                  <div className="hidden sm:block border border-slate-150 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <th className="px-5 py-3.5">Quality</th>
                          <th className="px-5 py-3.5">Size</th>
                          <th className="px-5 py-3.5">GSM</th>
                          <th className="px-5 py-3.5 text-right">No. of Looms Running</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs font-bold text-slate-700">
                            <td className="px-5 py-4 font-extrabold text-slate-800">{item.quality || '-'}</td>
                            <td className="px-5 py-4">{item.size || '-'}</td>
                            <td className="px-5 py-4 font-mono">{item.gsm || '-'}</td>
                            <td className="px-5 py-4 text-right">
                              <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full font-black">
                                {item.runningCount} Running
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
                          <span className="inline-flex items-center px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full font-black text-[10px] uppercase tracking-wider shrink-0">
                            {item.runningCount} Running
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Size</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{item.size || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">GSM</span>
                            <span className="text-xs font-bold text-slate-800 font-mono">{item.gsm || '-'} <span className="text-[9px] text-slate-400 font-semibold uppercase">gsm</span></span>
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
