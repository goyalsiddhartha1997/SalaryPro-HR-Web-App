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
  Activity,
  Layers,
  Sparkles,
  Info,
  Sun,
  Moon,
  Edit2,
  Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TapePlantProductionReport, RawMaterialItem, InventoryLog } from '../types';

interface TapePlantProductionProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function TapePlantProduction({ triggerAlert, viewOnly = false }: TapePlantProductionProps) {
  // --- STATE FOR FIRESTORE STREAMING ---
  const [reports, setReports] = useState<TapePlantProductionReport[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- STATE FOR NEW/EDIT ENTRY MODAL ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [isStopped, setIsStopped] = useState(false);
  const [usageVal, setUsageVal] = useState<string>('');
  const [wastageVal, setWastageVal] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shiftVal, setShiftVal] = useState<'day' | 'night'>('day');
  const [editingRecord, setEditingRecord] = useState<TapePlantProductionReport | null>(null);

  // --- STATE FOR FILTERS ---
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
    setLoadingReports(true);
    const q = collection(db, 'tapePlantProductions');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dataList: TapePlantProductionReport[] = [];
      snapshot.forEach((docSnap) => {
        dataList.push(docSnap.data() as TapePlantProductionReport);
      });
      // Sort primarily by date descending, then shift descending (night before day)
      dataList.sort((a, b) => {
        const dateComp = b.date.localeCompare(a.date);
        if (dateComp !== 0) return dateComp;
        return b.shift.localeCompare(a.shift);
      });
      setReports(dataList);
      setLoadingReports(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tapePlantProductions');
      setLoadingReports(false);
    });

    return () => unsubscribe();
  }, []);

  // --- STREAM RAW MATERIALS FROM FIRESTORE ---
  useEffect(() => {
    setLoadingMaterials(true);
    const q = collection(db, 'rawMaterials');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dataList: RawMaterialItem[] = [];
      snapshot.forEach((docSnap) => {
        dataList.push(docSnap.data() as RawMaterialItem);
      });
      setRawMaterials(dataList);
      setLoadingMaterials(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rawMaterials');
      setLoadingMaterials(false);
    });

    return () => unsubscribe();
  }, []);

  // --- AUTO-GENERATION AND UPDATE ENGINE ---
  // Calculates expected usage and wastage based on raw material logs for a date and shift
  const calculateMaterialsForShift = (dateStr: string, shiftCode: 'day' | 'night') => {
    const matchingLogs: { itemName: string; category: string; log: InventoryLog }[] = [];
    rawMaterials.forEach(item => {
      if (item.logs) {
        item.logs.forEach(log => {
          if (log.type === 'use_stock' && log.date === dateStr) {
            // Raw materials shift uses string "Day Shift" or "Night Shift"
            const logShiftCode = log.shift === 'Night Shift' ? 'night' : 'day';
            if (logShiftCode === shiftCode) {
              matchingLogs.push({
                itemName: item.name,
                category: item.category,
                log
              });
            }
          }
        });
      }
    });

    if (matchingLogs.length === 0) {
      return {
        usageText: "Plant Stopped / Not Running",
        totalWastage: 0,
        isStopped: true
      };
    }

    let ppSum = 0;
    let ccSum = 0;
    let ldSum = 0;
    let tptSum = 0;
    const othersMap: Record<string, number> = {};
    let totalWastage = 0;

    matchingLogs.forEach(({ itemName, category, log }) => {
      const qty = log.quantity || 0;
      const wast = log.wastage || 0;
      totalWastage += wast;

      const catUpper = category.toUpperCase();
      const nameUpper = itemName.toUpperCase();

      if (catUpper.includes('PP') || catUpper.includes('POLYPROPYLENE') || nameUpper.includes('PP ')) {
        ppSum += qty;
      } else if (catUpper.includes('FILLER') || catUpper.includes('CALCIUM') || nameUpper.includes('CALCIUM') || catUpper.includes('CC')) {
        ccSum += qty;
      } else if (catUpper.includes('LDPE') || catUpper.includes('LD') || nameUpper.includes('LDPE')) {
        ldSum += qty;
      } else if (catUpper.includes('TPT') || nameUpper.includes('TPT')) {
        tptSum += qty;
      } else {
        const key = (category && category.toUpperCase() !== 'OTHERS') ? category : itemName;
        othersMap[key] = (othersMap[key] || 0) + qty;
      }
    });

    const parts: string[] = [];
    if (ppSum > 0) parts.push(`PP: ${ppSum} kg`);
    if (ccSum > 0) parts.push(`CC: ${ccSum} kg`);
    if (ldSum > 0) parts.push(`LD: ${ldSum} kg`);
    if (tptSum > 0) parts.push(`TPT: ${tptSum} kg`);
    Object.entries(othersMap).forEach(([key, val]) => {
      parts.push(`${key}: ${val} kg`);
    });

    if (parts.length === 0) {
      return {
        usageText: "Plant Stopped / Not Running",
        totalWastage: 0,
        isStopped: true
      };
    }

    return {
      usageText: parts.join(', '),
      totalWastage: parseFloat(totalWastage.toFixed(2)),
      isStopped: false
    };
  };

  // Determines dynamic end-date limit based on "10 AM daily" rule
  const getLedgerEndLimit = () => {
    const now = new Date();
    const hours = now.getHours();
    const limitDate = new Date();
    
    if (hours < 10) {
      // Before 10 AM, up to day-before-yesterday
      limitDate.setDate(now.getDate() - 2);
    } else {
      // At or after 10 AM, up to yesterday
      limitDate.setDate(now.getDate() - 1);
    }
    return limitDate.toISOString().split('T')[0];
  };

  // Generates sequence of dates from YYYY-MM-DD to YYYY-MM-DD
  const generateDateRange = (startStr: string, endStr: string) => {
    const dates: string[] = [];
    const current = new Date(startStr);
    const end = new Date(endStr);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // Run the automatic ledger synchronization
  useEffect(() => {
    if (loadingReports || loadingMaterials || viewOnly || isSyncing) return;

    const syncMissingOrChangedLedgers = async () => {
      setIsSyncing(true);
      try {
        const startLimit = "2026-07-01";
        const endLimit = getLedgerEndLimit();
        if (endLimit < startLimit) {
          setIsSyncing(false);
          return;
        }

        const datesToSync = generateDateRange(startLimit, endLimit);
        const reportMap = new Map<string, TapePlantProductionReport>();
        reports.forEach(r => {
          reportMap.set(r.id, r);
        });

        let updatedCount = 0;

        for (const date of datesToSync) {
          for (const shift of ['day', 'night'] as const) {
            const docId = `${date}-${shift}`;
            const existing = reportMap.get(docId);
            
            // Calculate the current calculated state based on raw material logs
            const calculated = calculateMaterialsForShift(date, shift);

            const payload: TapePlantProductionReport = {
              id: docId,
              date,
              shift,
              usage: calculated.usageText,
              wastage: calculated.totalWastage,
              isStopped: calculated.isStopped,
              isAutoGenerated: true,
              createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString()
            };

            if (!existing) {
              // Missing document entirely - auto-create
              await setDoc(doc(db, 'tapePlantProductions', docId), payload);
              updatedCount++;
            } else if (existing.isAutoGenerated) {
              // Existing document is auto-generated - verify if it needs update/re-sync
              const isDiff = 
                existing.usage !== calculated.usageText || 
                existing.wastage !== calculated.totalWastage || 
                existing.isStopped !== calculated.isStopped;

              if (isDiff) {
                await setDoc(doc(db, 'tapePlantProductions', docId), payload);
                updatedCount++;
              }
            }
          }
        }

        if (updatedCount > 0) {
          console.log(`Tape Plant Production Report: synchronized ${updatedCount} daily shift ledger row(s) successfully.`);
        }
      } catch (err) {
        console.error("Failed to execute Tape Plant automatic sync:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncMissingOrChangedLedgers();
  }, [loadingReports, loadingMaterials, reports, rawMaterials, viewOnly]);

  const resetForm = () => {
    const today = new Date();
    setEntryDate(today.toISOString().split('T')[0]);
    setIsStopped(false);
    setShiftVal('day');
    setUsageVal('');
    setWastageVal('');
    setEditingRecord(null);
  };

  const handleEditClick = (r: TapePlantProductionReport) => {
    setEditingRecord(r);
    setEntryDate(r.date);
    setIsStopped(r.isStopped);
    setShiftVal(r.shift);
    setUsageVal(r.isStopped ? '' : r.usage);
    setWastageVal(r.wastage ? String(r.wastage) : '');
    setShowAddModal(true);
  };

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
    }).sort((a, b) => {
      // Sorted chronologically ascending for the ledger report
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.shift.localeCompare(b.shift);
    });
  }, [reports, filterMode, selectedMonth, selectedYear, rangeStartDate, rangeEndDate]);

  // --- AGGREGATED TOTALS FOR SELECTED VIEW ---
  const totals = useMemo(() => {
    let totalWastage = 0;
    let runningShifts = 0;
    let stoppedShifts = 0;

    filteredReports.forEach(r => {
      if (!r.isStopped) {
        totalWastage += r.wastage || 0;
        runningShifts++;
      } else {
        stoppedShifts++;
      }
    });

    return {
      wastage: parseFloat(totalWastage.toFixed(2)),
      runningShifts,
      stoppedShifts,
      totalShifts: filteredReports.length
    };
  }, [filteredReports]);

  // --- SUBMIT ENTRY TO FIRESTORE ---
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewOnly) {
      triggerAlert('warn', 'Access Denied. You do not have permissions to modify tape plant records.');
      return;
    }

    if (!entryDate) {
      triggerAlert('warn', 'Please select a valid date.');
      return;
    }

    const targetDocId = `${entryDate}-${shiftVal}`;
    setIsSubmitting(true);

    try {
      const payload: TapePlantProductionReport = {
        id: targetDocId,
        date: entryDate,
        shift: shiftVal,
        isStopped,
        usage: isStopped ? "Plant Stopped / Not Running" : (usageVal.trim() || "No usage logged"),
        wastage: isStopped ? 0 : (parseFloat(wastageVal) || 0),
        isAutoGenerated: false, // Mark as manually overridden/saved
        createdAt: editingRecord ? (editingRecord.createdAt || new Date().toISOString()) : new Date().toISOString()
      };

      // Write new/edited document
      await setDoc(doc(db, 'tapePlantProductions', targetDocId), payload);

      // If we are editing and the ID changed (due to date or shift change), delete the old one
      if (editingRecord && editingRecord.id !== targetDocId) {
        await deleteDoc(doc(db, 'tapePlantProductions', editingRecord.id));
      }

      if (editingRecord) {
        triggerAlert('success', `Tape Plant Production record updated successfully!`);
      } else {
        triggerAlert('success', `Tape Plant Production record logged successfully!`);
      }
      
      resetForm();
      setShowAddModal(false);
    } catch (err) {
      console.error('Error logging tape plant production report:', err);
      triggerAlert('warn', 'Failed to save record. Review database connection.');
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

    if (!confirm(`Are you sure you want to delete the manually locked ledger report for ${dateLabel}? It will revert to the auto-synced raw material state if applicable.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'tapePlantProductions', id));
      triggerAlert('success', `Ledger report for ${dateLabel} removed.`);
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
                                .sort((a, b) => {
                                  const dateComp = a.date.localeCompare(b.date);
                                  if (dateComp !== 0) return dateComp;
                                  return a.shift.localeCompare(b.shift);
                                });

      if (exportData.length === 0) {
        triggerAlert('info', 'No tape plant records found within the selected date range.');
        setIsExporting(false);
        return;
      }

      // Format rows for XLSX
      const rows = exportData.map(r => {
        const parts = r.date.split('-');
        const displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
        const shiftLabel = r.shift ? r.shift.toUpperCase() : 'DAY';

        if (r.isStopped) {
          return [displayDate, shiftLabel, 'Plant Stopped / Not Running', '0 kg'];
        }

        return [
          displayDate,
          shiftLabel,
          r.usage || '',
          `${r.wastage || 0} kg`
        ];
      });

      // Calculate totals
      let sumWastage = 0;
      let activeShifts = 0;

      exportData.forEach(r => {
        if (!r.isStopped) {
          sumWastage += r.wastage || 0;
          activeShifts++;
        }
      });

      // Assemble spreadsheet contents
      const sheetHeader = [
        ['FORTUNE FLEXIPACK PVT LIMITED'],
        ['TAPE PLANT PRODUCTION REPORT SUMMARY'],
        [`Date Range: ${formatDateLabel(exportStartDate)} to ${formatDateLabel(exportEndDate)}`],
        [], // empty row
        ['Date', 'Shift', 'Raw Material Usage', 'Wastage']
      ];

      const sheetTotals = [
        [], // empty spacer
        ['Total active shifts', `${activeShifts} shifts`, '————', `${sumWastage.toFixed(1)} KG`]
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
        { wch: 50 }, // Raw Material Usage
        { wch: 15 }  // Wastage
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tape Plant Summary');

      const fileName = `Tape_Plant_Production_Report_${exportStartDate}_to_${exportEndDate}.xlsx`;
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

  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[parseInt(month, 10) - 1]} ${year}`;
    }
    return dateStr;
  };

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

  const yearsList = [2024, 2025, 2026, 2027, 2028];

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="tape-plant-production-panel">
      
      {/* 🌟 1. EXECUTIVE HEADER */}
      <div className="bg-slate-900 text-white border border-slate-850 rounded-3xl p-6 md:p-8 mb-8 shadow-md relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-600/10 rounded-full translate-x-12 -translate-y-12 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-600/5 rounded-full -translate-x-12 translate-y-12 blur-xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-10 bg-amber-500 rounded-full"></span>
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-widest font-mono">Dynamic Extrusion &amp; Tape Line Logs</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase" style={{ fontFamily: '"Georgia", serif' }}>
              Tape Plant Production Report
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              Real-time daily shift-wise materials, granular usage, and extrusion wastage summaries
            </p>
          </div>
          
          <div className="bg-slate-800/80 backdrop-blur-xs border border-slate-700/50 py-3 px-5 rounded-2xl flex items-center gap-3 self-start md:self-auto shadow-inner">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auto-Sync Status</p>
              <p className="text-xs font-black text-slate-200">{isSyncing ? 'Synchronizing Inventory...' : 'Linked with Stock Page'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 📊 METRICS HIGHLIGHTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        
        {/* Metric 1 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Package size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Total Shifts Logged</span>
            <span className="text-2xl font-black text-slate-850 font-mono leading-none">{totals.totalShifts}</span>
            <span className="text-[9px] font-bold text-slate-400 block mt-1.5 uppercase">For selected date filters</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Activity size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Active Running</span>
            <span className="text-2xl font-black text-slate-850 font-mono leading-none text-emerald-600">{totals.runningShifts}</span>
            <span className="text-[9px] font-bold text-slate-400 block mt-1.5 uppercase">Shifts with material usage</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <Lock size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Plant Not Running</span>
            <span className="text-2xl font-black text-slate-850 font-mono leading-none text-rose-500">{totals.stoppedShifts}</span>
            <span className="text-[9px] font-bold text-slate-400 block mt-1.5 uppercase">Stopped shifts recorded</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Trash2 size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Total Line Wastage</span>
            <span className="text-2xl font-black text-slate-850 font-mono leading-none text-indigo-600">{totals.wastage.toLocaleString()} <span className="text-xs uppercase font-extrabold">kg</span></span>
            <span className="text-[9px] font-bold text-slate-400 block mt-1.5 uppercase">Accumulated shift waste</span>
          </div>
        </div>

      </div>

      {/* 🎛️ 2. FILTER & ACTION DASHBOARD TOOLBAR */}
      <div className="bg-white border border-slate-150 rounded-3xl p-4 md:p-6 mb-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          {/* Left: Filter Controls */}
          <div className="flex-1 flex flex-col sm:flex-row sm:items-end gap-4 w-full">
            
            <div className="w-full sm:flex-1">
              <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Filter Mode</label>
              <div className="flex w-full sm:inline-flex rounded-xl bg-slate-50 p-1 border border-slate-100">
                <button
                  type="button"
                  onClick={() => setFilterMode('month')}
                  className={`flex-1 sm:flex-initial text-center justify-center px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
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
                  className={`flex-1 sm:flex-initial text-center justify-center px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'range' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Range
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`flex-1 sm:flex-initial text-center justify-center px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    filterMode === 'all' 
                      ? 'bg-slate-900 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  All
                </button>
              </div>
            </div>

            {/* Dynamic input fields based on active filter mode */}
            {filterMode === 'month' && (
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="flex-1 sm:w-36">
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
                <div className="flex-1 sm:w-24">
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
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex-1 sm:w-32">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">From Date</label>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
                  />
                </div>
                <span className="text-slate-400 text-xs font-bold mt-5">to</span>
                <div className="flex-1 sm:w-32">
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">To Date</label>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
                  />
                </div>
              </div>
            )}

          </div>

          {/* Right: Actions (Add/Export) */}
          <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
            {!viewOnly && (
              <button
                type="button"
                onClick={() => { resetForm(); setShowAddModal(true); }}
                className="flex-1 sm:flex-initial h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer"
              >
                <Plus size={15} className="stroke-[3]" />
                Manual Lock Override
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="flex-1 sm:flex-initial h-10 px-5 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs hover:shadow-md cursor-pointer"
            >
              <FileSpreadsheet size={15} className="text-emerald-600 stroke-[2.5]" />
              Export Excel
            </button>
          </div>

        </div>
      </div>

      {/* 📊 3. THE INTERACTIVE CHRONOLOGICAL LEDGER */}
      <div className="bg-white border border-slate-150 rounded-3xl shadow-xs overflow-hidden">
        
        <div className="border-b border-slate-150 p-5 bg-slate-50 flex justify-between items-center select-none">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Tape Plant Ledger Entries</h2>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              Chronological log of shift parameters, materials consumption, and line wastage
            </p>
          </div>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-wider shadow-2xs">
            {filteredReports.length} Rows Listed
          </span>
        </div>

        {loadingReports || loadingMaterials ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-slate-150 border-t-slate-800 animate-spin"></div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Running data aggregation...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-350 mb-4 shadow-inner">
              <Layers size={28} />
            </div>
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">No Production Logs Available</h3>
            <p className="text-xs text-slate-450 mt-1 max-w-sm font-medium">
              We couldn't locate any tape plant records matching your filter parameters. Try expanding your date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[10px] font-black uppercase tracking-wider border-b border-slate-800 select-none">
                  <th className="py-3 px-6 border-r border-slate-800">Date</th>
                  <th className="py-3 px-6 border-r border-slate-800 text-center">Shift</th>
                  <th className="py-3 px-6 border-r border-slate-800">Raw Material Usage Description</th>
                  <th className="py-3 px-6 border-r border-slate-800 text-center">Wastage (kg)</th>
                  <th className="py-3 px-6 border-r border-slate-800 text-center">Data Origin</th>
                  {!viewOnly && <th className="py-3 px-6 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 font-bold text-slate-800 text-xs">
                {filteredReports.map((report) => (
                  <tr 
                    key={report.id} 
                    className={`hover:bg-slate-50/50 transition-colors ${report.isStopped ? 'bg-rose-50/30' : ''}`}
                    id={`row-${report.id}`}
                  >
                    
                    {/* Date Column */}
                    <td className="py-4 px-6 border-r border-slate-150 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <CalendarIcon size={14} className="text-slate-400" />
                        <span className="font-mono">{formatDateLabel(report.date)}</span>
                      </div>
                    </td>

                    {/* Shift Column */}
                    <td className="py-4 px-6 border-r border-slate-150 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        report.shift === 'day' 
                          ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {report.shift === 'day' ? (
                          <Sun size={10} className="text-amber-500 stroke-[2.5]" />
                        ) : (
                          <Moon size={10} className="text-purple-600 stroke-[2.5]" />
                        )}
                        {report.shift === 'day' ? 'Day Shift' : 'Night Shift'}
                      </span>
                    </td>

                    {/* Usage Column */}
                    <td className="py-4 px-6 border-r border-slate-150 max-w-lg">
                      {report.isStopped ? (
                        <div className="flex items-center justify-start py-1">
                          <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 border border-rose-200 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
                            <AlertTriangle size={12} className="shrink-0" />
                            {report.usage || "Plant Stopped / Not Running"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-700 font-semibold leading-relaxed">
                          {report.usage}
                        </span>
                      )}
                    </td>

                    {/* Wastage Column */}
                    <td className="py-4 px-6 border-r border-slate-150 text-center font-mono">
                      {report.isStopped ? (
                        <span className="text-slate-350">—</span>
                      ) : (
                        <span className="text-slate-850">
                          {report.wastage || 0} <span className="text-[9px] text-slate-400 font-extrabold uppercase">kg</span>
                        </span>
                      )}
                    </td>

                    {/* Data Origin */}
                    <td className="py-4 px-6 border-r border-slate-150 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                        report.isAutoGenerated 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}>
                        {report.isAutoGenerated ? 'Auto Synced' : 'Manual Override'}
                      </span>
                    </td>

                    {/* Actions */}
                    {!viewOnly && (
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleEditClick(report)}
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                            title="Edit / Override Report"
                            id={`edit-btn-${report.id}`}
                          >
                            <Edit2 size={13} className="stroke-[2.5]" />
                          </button>
                          
                          {!report.isAutoGenerated && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(report.id, `${formatDateLabel(report.date)} (${report.shift.toUpperCase()})`)}
                              className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                              title="Delete Manual Override"
                              id={`delete-btn-${report.id}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ==================== MODAL: ADD / EDIT DIALOG ==================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" id="tape-add-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-up select-none">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-850 uppercase tracking-wide">
                    {editingRecord ? 'Manual Override Entry' : 'Lock Shift Production'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {editingRecord ? 'Update specified machine metrics and remarks' : 'Establish new locked shift production report'}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all cursor-pointer"
                id="close-modal-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleAddEntry} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Report Ledger Date</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    disabled={!!editingRecord}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Shift</label>
                  <select
                    value={shiftVal}
                    onChange={(e) => setShiftVal(e.target.value as 'day' | 'night')}
                    disabled={!!editingRecord}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden disabled:opacity-60 cursor-pointer"
                  >
                    <option value="day">☀️ Day Shift</option>
                    <option value="night">🌙 Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Plant Status Override */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStopped}
                    onChange={(e) => {
                      setIsStopped(e.target.checked);
                      if (e.target.checked) {
                        setUsageVal('Plant Stopped / Not Running');
                        setWastageVal('0');
                      } else {
                        setUsageVal('');
                        setWastageVal('');
                      }
                    }}
                    className="mt-0.5 rounded-xs border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide block">Tape Plant Stopped / Not Running</span>
                    <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                      Check this box if the tape line was completely down or idle for this shift with no raw material usage.
                    </span>
                  </div>
                </label>
              </div>

              {!isStopped && (
                <>
                  <div>
                    <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Raw Material Usage Details</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. PP: 450 kg, CC: 100 kg, LD: 25 kg, TPT: 10 kg"
                      value={usageVal}
                      onChange={(e) => setUsageVal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Wastage (kg)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Enter wastage weight in kg"
                      value={wastageVal}
                      onChange={(e) => setWastageVal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-60"
                >
                  <Lock size={13} className="stroke-[3]" />
                  {isSubmitting ? 'Saving...' : 'Lock Record'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EXPORT TO EXCEL RANGE SELECTOR ==================== */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" id="tape-export-modal">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl w-full max-w-md animate-scale-up select-none">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="text-emerald-600 stroke-[2.5]" size={18} />
                <h3 className="text-sm font-black text-slate-850 uppercase tracking-wide">Export Production Excel</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">From Date</label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">To Date</label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-5 h-10 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportToExcel}
                  className="px-5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <FileSpreadsheet size={13} className="stroke-[2.5]" />
                  {isExporting ? 'Generating...' : 'Download Spreadsheet'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
