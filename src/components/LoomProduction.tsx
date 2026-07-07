/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  Lock, 
  ChevronDown, 
  Trash2, 
  CheckCircle,
  AlertTriangle,
  Flame,
  Activity,
  Layers,
  Sparkles,
  Info,
  Sun,
  Moon,
  Edit2
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface LoomProductionReport {
  id: string; // usually YYYY-MM-DD
  date: string; // YYYY-MM-DD
  isStopped: boolean;
  shift?: 'day' | 'night';
  looms?: number | null;
  production?: number | null;
  average?: number | null;
  wastage?: number | null;
  createdAt: string;
}

interface LoomProductionProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function LoomProduction({ triggerAlert, viewOnly = false }: LoomProductionProps) {
  // --- STATE FOR FIRESTORE STREAMING ---
  const [reports, setReports] = useState<LoomProductionReport[]>([]);
  const [loading, setLoading] = useState(true);

  // --- STATE FOR NEW ENTRY MODAL ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isStopped, setIsStopped] = useState(false);
  const [loomsVal, setLoomsVal] = useState<string>('');
  const [productionVal, setProductionVal] = useState<string>('');
  const [wastageVal, setWastageVal] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shiftVal, setShiftVal] = useState<'day' | 'night'>('day');
  const [editingRecord, setEditingRecord] = useState<LoomProductionReport | null>(null);

  const resetForm = () => {
    const today = new Date();
    setEntryDate(today.toISOString().split('T')[0]);
    setIsStopped(false);
    setShiftVal('day');
    setLoomsVal('');
    setProductionVal('');
    setWastageVal('');
    setEditingRecord(null);
  };

  const handleEditClick = (r: LoomProductionReport) => {
    setEditingRecord(r);
    setEntryDate(r.date);
    setIsStopped(r.isStopped);
    setShiftVal(r.shift || 'day');
    setLoomsVal(r.looms ? String(r.looms) : '');
    setProductionVal(r.production ? String(r.production) : '');
    setWastageVal(r.wastage ? String(r.wastage) : '');
    setShowAddModal(true);
  };

  // --- STATE FOR FILTERS ---
  // Filter modes: 'month' (default), 'range', 'all'
  const [filterMode, setFilterMode] = useState<'month' | 'range' | 'all'>('month');
  
  // Month selector states
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Date range states
  const [rangeStartDate, setRangeStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [rangeEndDate, setRangeEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // --- STATE FOR EXPORT MODAL ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // Default to start of current month
    return d.toISOString().split('T')[0];
  });
  const [exportEndDate, setExportEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isExporting, setIsExporting] = useState(false);

  // --- STREAM REPORTS FROM FIRESTORE ---
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'loomProductions');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dataList: LoomProductionReport[] = [];
      snapshot.forEach((docSnap) => {
        dataList.push(docSnap.data() as LoomProductionReport);
      });
      // Sort primarily by date descending
      dataList.sort((a, b) => b.date.localeCompare(a.date));
      setReports(dataList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'loomProductions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- CALCULATE REAL-TIME AVERAGE FOR FORM ---
  const calculatedAveragePreview = useMemo(() => {
    const looms = parseFloat(loomsVal);
    const prod = parseFloat(productionVal);
    if (!isNaN(looms) && !isNaN(prod) && looms > 0) {
      return Math.round(prod / looms);
    }
    return 0;
  }, [loomsVal, productionVal]);

  // --- FILTERED REPORTS DATA ---
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (filterMode === 'all') {
        return true;
      }
      
      if (filterMode === 'month') {
        const parts = r.date.split('-'); // [YYYY, MM, DD]
        if (parts.length === 3) {
          const rYear = parseInt(parts[0], 10);
          const rMonth = parseInt(parts[1], 10);
          return rYear === selectedYear && rMonth === selectedMonth;
        }
        return false;
      }

      if (filterMode === 'range') {
        return r.date >= rangeStartDate && r.date <= rangeEndDate;
      }

      return true;
    }).sort((a, b) => a.date.localeCompare(b.date)); // Sort chronologically ascending for the ledger report
  }, [reports, filterMode, selectedMonth, selectedYear, rangeStartDate, rangeEndDate]);

  // --- AGGREGATED TOTALS FOR SELECTED VIEW ---
  const totals = useMemo(() => {
    let totalLooms = 0;
    let totalProduction = 0;
    let totalWastage = 0;

    filteredReports.forEach(r => {
      if (!r.isStopped) {
        totalLooms += r.looms || 0;
        totalProduction += r.production || 0;
        totalWastage += r.wastage || 0;
      }
    });

    return {
      looms: totalLooms,
      production: totalProduction,
      wastage: parseFloat(totalWastage.toFixed(2))
    };
  }, [filteredReports]);

  // --- SUBMIT ENTRY TO FIRESTORE ---
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      triggerAlert('warn', 'Access Denied. You do not have permissions to record production metrics.');
      return;
    }

    if (!entryDate) {
      triggerAlert('warn', 'Please select a valid date.');
      return;
    }

    const targetDocId = `${entryDate}-${shiftVal}`;
    setIsSubmitting(true);

    try {
      const payload: LoomProductionReport = {
        id: targetDocId,
        date: entryDate,
        isStopped,
        shift: shiftVal,
        createdAt: editingRecord ? (editingRecord.createdAt || new Date().toISOString()) : new Date().toISOString()
      };

      if (!isStopped) {
        if (!loomsVal || parseInt(loomsVal, 10) <= 0) {
          triggerAlert('warn', 'Please enter a valid number of active looms.');
          setIsSubmitting(false);
          return;
        }
        if (!productionVal || parseFloat(productionVal) <= 0) {
          triggerAlert('warn', 'Please enter a valid total production amount.');
          setIsSubmitting(false);
          return;
        }

        payload.looms = parseInt(loomsVal, 10) || 0;
        payload.production = parseFloat(productionVal) || 0;
        payload.average = calculatedAveragePreview;
        payload.wastage = parseFloat(wastageVal) || 0;
      }

      // Write new/edited document
      await setDoc(doc(db, 'loomProductions', targetDocId), payload);

      // If we are editing and the ID changed (due to date or shift change), delete the old one
      if (editingRecord && editingRecord.id !== targetDocId) {
        await deleteDoc(doc(db, 'loomProductions', editingRecord.id));
      }

      if (editingRecord) {
        triggerAlert('success', `Loom Production report updated successfully!`);
      } else {
        triggerAlert('success', `Loom Production report locked for ${formatDateLabel(entryDate)} (${shiftVal.toUpperCase()} shift) successfully!`);
      }
      
      resetForm();
      setShowAddModal(false);
    } catch (err) {
      console.error('Error locking production report:', err);
      triggerAlert('warn', 'Failed to lock record. Review security credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE ENTRY FROM FIRESTORE ---
  const handleDeleteEntry = async (id: string, dateLabel: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Access Denied. You do not have permissions to delete records.');
      return;
    }

    if (!confirm(`Are you sure you want to unlock and delete the ledger report for ${dateLabel}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'loomProductions', id));
      triggerAlert('success', `Ledger report for ${dateLabel} deleted.`);
    } catch (err) {
      console.error('Error deleting report:', err);
      triggerAlert('warn', 'Failed to delete record.');
    }
  };

  // --- EXPORT METRICS TO EXCEL ---
  const handleExportToExcel = () => {
    if (!exportStartDate || !exportEndDate) {
      triggerAlert('warn', 'Please specify both From and To dates for Excel export.');
      return;
    }

    if (exportStartDate > exportEndDate) {
      triggerAlert('warn', 'From date cannot be after To date.');
      return;
    }

    setIsExporting(true);
    try {
      // Filter reports based on export range
      const exportData = reports.filter(r => r.date >= exportStartDate && r.date <= exportEndDate)
                                .sort((a, b) => a.date.localeCompare(b.date));

      if (exportData.length === 0) {
        triggerAlert('info', 'No production records found within the selected date range.');
        setIsExporting(false);
        return;
      }

      // Format rows for XLSX
      const rows = exportData.map(r => {
        const parts = r.date.split('-');
        const displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
        const shiftLabel = r.shift ? r.shift.toUpperCase() : 'DAY';

        if (r.isStopped) {
          return [displayDate, shiftLabel, 'Stop', 'Stop', 'Stop', 'Stop'];
        }

        return [
          displayDate,
          shiftLabel,
          `${r.looms} looms`,
          `${r.production?.toLocaleString()} M`,
          `${r.average?.toLocaleString()} M`,
          `${r.wastage} KG`
        ];
      });

      // Calculate totals
      let sumLooms = 0;
      let sumProduction = 0;
      let sumWastage = 0;

      exportData.forEach(r => {
        if (!r.isStopped) {
          sumLooms += r.looms || 0;
          sumProduction += r.production || 0;
          sumWastage += r.wastage || 0;
        }
      });

      // Assemble spreadsheet contents
      const sheetHeader = [
        ['FORTUNE FLEXIPACK PVT LIMITED'],
        ['LOOM PRODUCTION REPORT SUMMARY'],
        [`Date Range: ${formatDateLabel(exportStartDate)} to ${formatDateLabel(exportEndDate)}`],
        [], // empty row
        ['Date', 'Shift', 'Looms', 'Production', 'Average', 'Wastage']
      ];

      const sheetTotals = [
        [], // empty spacer
        ['Total', '', `${sumLooms} looms`, `${sumProduction.toLocaleString()} M`, '————', `${sumWastage.toFixed(1)} KG`]
      ];

      const finalRows = [
        ...sheetHeader,
        ...rows,
        ...sheetTotals
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(finalRows);
      
      // Styling column widths
      worksheet['!cols'] = [
        { wch: 15 }, // Date
        { wch: 10 }, // Shift
        { wch: 15 }, // Looms
        { wch: 18 }, // Production
        { wch: 15 }, // Average
        { wch: 15 }  // Wastage
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Loom Summary');

      const fileName = `Loom_Production_Report_${exportStartDate}_to_${exportEndDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      triggerAlert('success', `Spreadsheet downloaded as ${fileName}`);
      setShowExportModal(false);
    } catch (err) {
      console.error('Excel generation failed:', err);
      triggerAlert('warn', 'Failed to generate Excel sheet.');
    } finally {
      setIsExporting(false);
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

  // --- LIST OF MONTH NAMES ---
  const monthsList = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];

  // --- YEAR OPTIONS ---
  const yearsList = [2024, 2025, 2026, 2027, 2028];

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="loom-production-panel">
      
      {/* 🌟 1. LOOM PRODUCTION REPORT EXECUTIVE HEADER */}
      <div className="bg-slate-900 text-white border border-slate-850 rounded-3xl p-8 mb-8 shadow-md relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full translate-x-12 -translate-y-12 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-600/5 rounded-full -translate-x-12 translate-y-12 blur-xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-10 bg-indigo-500 rounded-full"></span>
              <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest font-mono">Live Weaving Metrics Ledger</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase" style={{ fontFamily: '"Georgia", serif' }}>
              Loom Production Report
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              Daily scheduling, machine active loads, and weaving wastage analytics
            </p>
          </div>
          
          {/* Quick summary badge */}
          <div className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/50 py-3 px-5 rounded-2xl flex items-center gap-3 self-start md:self-auto shadow-inner">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Database Sync</p>
              <p className="text-xs font-black text-slate-200">Production Ledger Active</p>
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
                  onClick={() => setFilterMode('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'month' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  By Month
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
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'all' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  All Reports
                </button>
              </div>
            </div>

            {/* Dynamic input fields based on active filter mode */}
            {filterMode === 'month' && (
              <div className="flex gap-2">
                <div className="w-36">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Select Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    {monthsList.map(m => (
                      <option key={m.value} value={m.value}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Select Year</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
                  >
                    {yearsList.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {filterMode === 'range' && (
              <div className="flex gap-2 items-center">
                <div className="w-36">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">From Date</label>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <span className="text-slate-300 font-bold text-xs mt-4">to</span>
                <div className="w-36">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">To Date</label>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>
            )}

          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-emerald-600/5 border border-emerald-100"
            >
              <FileSpreadsheet size={16} />
              Export Excel
            </button>
            {!viewOnly && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                <Plus size={16} />
                New Entry
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 📊 3. THE TOP METRICS SUMMARY BANNER (MANDATORY REQUEST) */}
      <div className="mb-8">
        <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3 select-none flex items-center gap-1.5">
          <Activity size={14} className="text-slate-400" />
          Report Summary Metrics ({filterMode === 'month' ? `${monthsList.find(m=>m.value===selectedMonth)?.name} ${selectedYear}` : filterMode === 'range' ? 'Selected Period' : 'All Ledger Dates'})
        </h3>
        
        {/* Bento Grid Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card: Total Looms */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Active Looms</p>
                <h3 className="text-2xl font-black text-slate-800 mt-2">
                  {totals.looms ? `${totals.looms.toLocaleString()} Looms` : '0 Looms'}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Layers size={18} />
              </div>
            </div>
            <p className="text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
              Sum of loom operations for non-stopped days
            </p>
          </div>

          {/* Card: Total Production */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Production</p>
                <h3 className="text-2xl font-black text-emerald-700 mt-2">
                  {totals.production ? `${totals.production.toLocaleString()} Meters` : '0 M'}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Sparkles size={18} />
              </div>
            </div>
            <p className="text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
              Sum of fabric woven in meters
            </p>
          </div>

          {/* Card: Total Wastage */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Wastage</p>
                <h3 className="text-2xl font-black text-amber-700 mt-2">
                  {totals.wastage ? `${totals.wastage.toLocaleString()} KG` : '0 KG'}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Flame size={18} />
              </div>
            </div>
            <p className="text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
              Total material wasted in kilograms
            </p>
          </div>

        </div>
      </div>

      {/* 📜 4. THE LOOM PRODUCTION LEDGER TABLE (MODERN, HIGH-CONTRAST DESIGN) */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="p-6 border-b border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></div>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 tracking-wider">
                Loom Production Ledger Section
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Daily verified production entries & waste logs</p>
            </div>
          </div>
          <span className="bg-indigo-50 text-indigo-700 text-xs font-extrabold uppercase px-3.5 py-1.5 rounded-full border border-indigo-100 shadow-xs tracking-wider">
            {filteredReports.length} {filteredReports.length === 1 ? 'Day Logged' : 'Days Logged'}
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            Synchronizing ledger with cloud database...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-24 text-center text-slate-400 select-none uppercase tracking-widest text-xs font-bold flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
              <Info size={32} />
            </div>
            <span>No ledger entries locked for the selected criteria.</span>
            <p className="text-[11px] text-slate-400 lowercase font-normal">Use the "+ New Entry" button to record daily production data</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-100 text-[12px] md:text-[13px] font-black uppercase tracking-wider select-none border-b border-slate-800">
                  <th className="py-4.5 px-6 border-r border-slate-800">Date</th>
                  <th className="py-4.5 px-6 border-r border-slate-800 text-center">Shift</th>
                  <th className="py-4.5 px-6 border-r border-slate-800 text-center">Active Looms</th>
                  <th className="py-4.5 px-6 border-r border-slate-800 text-center">Total Production (M)</th>
                  <th className="py-4.5 px-6 border-r border-slate-800 text-center">Average Production (M)</th>
                  <th className="py-4.5 px-6 border-r border-slate-800 text-center">Wastage (KG)</th>
                  {!viewOnly && <th className="py-4.5 px-6 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-[13px] md:text-[14px] font-bold">
                {filteredReports.map((r) => {
                  const dateLabel = formatDateLabel(r.date);
                  
                  if (r.isStopped) {
                    return (
                      <tr key={r.id} className="hover:bg-red-50/20 bg-red-50/5 transition-colors">
                        <td className="py-4 px-6 border-r border-slate-150 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <CalendarIcon size={14} className="text-red-400 shrink-0" />
                            <span>{dateLabel}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center border-r border-slate-150">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                            (r.shift || 'day') === 'day' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}>
                            {(r.shift || 'day') === 'day' ? <Sun size={12} /> : <Moon size={12} />}
                            {r.shift || 'day'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center border-r border-slate-150" colSpan={4}>
                          <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-800 border border-red-200 px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest animate-pulse">
                            <AlertTriangle size={14} />
                            Weaving Plant Operations Stopped
                          </span>
                        </td>
                        {!viewOnly && (
                          <td className="py-4 px-6 text-center">
                            <button
                              type="button"
                              onClick={() => handleEditClick(r)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer mr-1"
                              title="Edit Record"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(r.id, dateLabel)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  return (
                    <tr key={r.id} className="hover:bg-indigo-50/10 transition-colors">
                      <td className="py-4 px-6 border-r border-slate-150 font-extrabold text-slate-900">
                        <div className="flex items-center gap-2">
                          <Lock size={13} className="text-slate-400 shrink-0" />
                          <span>{dateLabel}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center border-r border-slate-150">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                          (r.shift || 'day') === 'day' 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                            : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                        }`}>
                          {(r.shift || 'day') === 'day' ? <Sun size={12} /> : <Moon size={12} />}
                          {r.shift || 'day'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center border-r border-slate-150">
                        <span className="inline-block bg-indigo-50 text-indigo-800 font-extrabold px-3 py-1 rounded-lg border border-indigo-100 font-mono text-[13px]">
                          {r.looms} Looms
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center border-r border-slate-150 text-slate-800 font-extrabold font-mono text-[14px]">
                        {r.production?.toLocaleString()}{' '}
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">M</span>
                      </td>
                      <td className="py-4 px-6 text-center border-r border-slate-150 text-slate-800 font-extrabold font-mono text-[14px]">
                        {r.average?.toLocaleString()}{' '}
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wide">M/Loom</span>
                      </td>
                      <td className="py-4 px-6 text-center border-r border-slate-150">
                        <span className="inline-block bg-amber-50 text-amber-800 font-extrabold px-3 py-1 rounded-lg border border-amber-150 font-mono text-[13px]">
                          {r.wastage} KG
                        </span>
                      </td>
                      {!viewOnly && (
                        <td className="py-4 px-6 text-center">
                          <button
                            type="button"
                            onClick={() => handleEditClick(r)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer mr-1"
                            title="Edit Record"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(r.id, dateLabel)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* 📊 5. SCREENSHOT REPLICATED TOTAL ROW */}
                <tr className="bg-slate-100/80 font-black border-t-4 border-slate-300 text-[14px] md:text-[15px] text-slate-900 shadow-inner">
                  <td className="py-5 px-6 border-r border-slate-200 font-black uppercase text-[12px] tracking-widest flex items-center gap-1.5">
                    <Activity size={16} className="text-slate-500" />
                    <span>Ledger Total</span>
                  </td>
                  <td className="py-5 px-6 border-r border-slate-200 text-center text-slate-400 font-bold">
                    ————
                  </td>
                  <td className="py-5 px-6 text-center border-r border-slate-200 font-mono font-black text-slate-800">
                    {totals.looms} Looms
                  </td>
                  <td className="py-5 px-6 text-center border-r border-slate-200 font-mono font-black text-emerald-800 font-mono">
                    {totals.production.toLocaleString()}{' '}
                    <span className="text-[11px] font-black text-slate-400">M</span>
                  </td>
                  <td className="py-5 px-6 text-center border-r border-slate-200 text-slate-400 font-mono tracking-widest font-black">
                    ————
                  </td>
                  <td className="py-5 px-6 text-center border-r border-slate-200 font-mono font-black text-amber-800 font-mono">
                    {totals.wastage.toLocaleString()}{' '}
                    <span className="text-[11px] font-black text-slate-400">KG</span>
                  </td>
                  {!viewOnly && <td className="py-5 px-6 bg-slate-200/40"></td>}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== MODAL: ADD ENTRY ==================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" id="add-entry-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl w-full max-w-md animate-scale-up select-none">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  {editingRecord ? <Edit2 size={16} /> : <Plus size={18} />}
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">
                    {editingRecord ? 'Edit Loom Production' : 'Record Loom Production'}
                  </h4>
                  <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                    {editingRecord ? 'Update selected daily report record' : 'Lock new daily report record'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddEntry} className="space-y-4">
              
              {/* Date selection */}
              <div>
                <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry Date</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Shift selection */}
              <div>
                <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shift Selection</label>
                <div className="relative">
                  <select
                    required
                    value={shiftVal}
                    onChange={(e) => setShiftVal(e.target.value as 'day' | 'night')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden appearance-none cursor-pointer uppercase"
                  >
                    <option value="day">☀️ Day Shift</option>
                    <option value="night">🌙 Night Shift</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>

              {/* Stop Plant Switch */}
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isStopped ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Stop Operations?</span>
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Check if weaving plant was stopped</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isStopped}
                    onChange={(e) => setIsStopped(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                </label>
              </div>

              {/* Active metrics (Only visible if not stopped) */}
              {!isStopped && (
                <div className="space-y-4 animate-fade-in">
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No. of Looms</label>
                      <input
                        type="number"
                        placeholder="e.g. 14"
                        value={loomsVal}
                        onChange={(e) => setLoomsVal(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Wastage (KGs)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="e.g. 22.5"
                        value={wastageVal}
                        onChange={(e) => setWastageVal(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Production (Meters)</label>
                    <input
                      type="number"
                      placeholder="e.g. 8200"
                      value={productionVal}
                      onChange={(e) => setProductionVal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                    />
                  </div>

                  {/* Calculated Average Preview */}
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex justify-between items-center select-none">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-indigo-600 shrink-0" />
                      <div>
                        <span className="text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider">Average Production</span>
                        <p className="text-[9px] text-indigo-400 font-semibold uppercase">Auto-calculated meter average</p>
                      </div>
                    </div>
                    <span className="text-md font-black text-indigo-900 font-mono">
                      {calculatedAveragePreview ? `${calculatedAveragePreview.toLocaleString()} M` : '————'}
                    </span>
                  </div>

                </div>
              )}

              {isStopped && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 text-[10px] font-bold uppercase tracking-wider text-center flex flex-col items-center gap-2 animate-fade-in">
                  <AlertTriangle size={20} className="text-red-500" />
                  Weaving plant stopped. All columns will be locked with a "Stop" status in the ledger.
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white rounded-xl font-black text-xs tracking-wider uppercase shadow-md shadow-indigo-600/10 transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isSubmitting ? (editingRecord ? 'Updating...' : 'Locking...') : (editingRecord ? 'Update Record' : 'Lock Record')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EXPORT DATE RANGE ==================== */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" id="export-range-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl w-full max-w-md animate-scale-up select-none">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase text-slate-800 tracking-wider">Export Loom Report</h4>
                  <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider font-mono">Download spreadsheet report</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">From Date</label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">To Date</label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl font-black text-xs tracking-wider uppercase shadow-md shadow-emerald-600/10 transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                {isExporting ? 'Generating...' : 'Export Spreadsheet'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
