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
  User,
  Users
} from 'lucide-react';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { formatDateDDMMMYYYY } from '../utils/dateUtils';
import { type LoomRunningReport, LoomRunningRow, Employee, LoomOrder } from '../types';
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

  // --- STREAM LOOM ORDERS FOR MASTER ROLL LEDGER INTEGRATION ---
  const [loomOrders, setLoomOrders] = useState<LoomOrder[]>([]);

  useEffect(() => {
    const q = collection(db, 'loomOrders');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: LoomOrder[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as LoomOrder);
      });
      setLoomOrders(list);
    }, (err) => {
      console.warn("Failed to stream loom orders in LoomRunningReport:", err);
    });
    return () => unsubscribe();
  }, []);

  // Map of all roll numbers existing in Master Roll Ledger Directory
  const existingMasterRollsMap = useMemo(() => {
    const map = new Map<string, { orderId: string; orderNo: string; orderDate: string; size?: string; quality?: string }>();
    loomOrders.forEach(order => {
      (order.rows || []).forEach(row => {
        (row.rollNumbers || []).forEach(r => {
          const trimmed = (r || '').trim().toUpperCase();
          if (trimmed) {
            map.set(trimmed, {
              orderId: order.id,
              orderNo: order.orderNo,
              orderDate: order.date,
              size: row.size,
              quality: row.quality
            });
          }
        });
      });
    });
    return map;
  }, [loomOrders]);

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

  // Check which roll numbers in previewRows already exist in Master Roll Ledger Directory
  const duplicateMasterRollsInPreview = useMemo(() => {
    const matches: Array<{
      idx: number;
      rollNo: string;
      orderNo: string;
      orderDate: string;
      quality?: string;
      size?: string;
    }> = [];

    previewRows.forEach((row, idx) => {
      const trimmed = (row.rollNo || '').trim().toUpperCase();
      if (trimmed && existingMasterRollsMap.has(trimmed)) {
        const matchInfo = existingMasterRollsMap.get(trimmed)!;
        matches.push({
          idx,
          rollNo: (row.rollNo || '').trim(),
          orderNo: matchInfo.orderNo,
          orderDate: matchInfo.orderDate,
          quality: matchInfo.quality,
          size: matchInfo.size
        });
      }
    });

    return matches;
  }, [previewRows, existingMasterRollsMap]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  // --- SUMMARY WINDOW MODAL STATES ---
  const [showSummaryMenuModal, setShowSummaryMenuModal] = useState(false);
  const [selectedSummaryType, setSelectedSummaryType] = useState<string | null>(null);

  // Summary window filters
  const [sumFilterMode, setSumFilterMode] = useState<'single' | 'range'>('single');
  const [sumSingleDate, setSumSingleDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [sumRangeStartDate, setSumRangeStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [sumRangeEndDate, setSumRangeEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [sumFilterShift, setSumFilterShift] = useState<'ALL' | 'DAY' | 'NIGHT'>('ALL');
  const [sumSelectedOperator, setSumSelectedOperator] = useState<string>('ALL');

  // Handler to open summary menu window initialized with main page filters
  const handleOpenSummaryMenu = () => {
    setSumFilterMode(filterMode);
    setSumSingleDate(singleDate);
    setSumRangeStartDate(rangeStartDate);
    setSumRangeEndDate(rangeEndDate);
    setSumFilterShift(filterShift);
    setSumSelectedOperator('ALL');
    setSelectedSummaryType(null);
    setShowSummaryMenuModal(true);
  };

  // Shutdown and remarks states
  const [isAllStopped, setIsAllStopped] = useState(false);
  const [remarks, setRemarks] = useState('');

  // Base64 Image reference for preview
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

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

  // --- SUMMARY MODAL FILTERED REPORTS ---
  const modalFilteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (!report.date) return false;
      
      const dateMatch = sumFilterMode === 'single'
        ? report.date === sumSingleDate
        : (report.date >= sumRangeStartDate && report.date <= sumRangeEndDate);

      if (!dateMatch) return false;

      const repShift = (report.shift || 'DAY').toUpperCase().trim();
      if (sumFilterShift === 'DAY') {
        return repShift === 'DAY';
      } else if (sumFilterShift === 'NIGHT') {
        return repShift === 'NIGHT';
      }
      return true;
    });
  }, [reports, sumFilterMode, sumSingleDate, sumRangeStartDate, sumRangeEndDate, sumFilterShift]);

  // --- SUMMARY MODAL DATA FOR "NUMBER OF LOOMS RUNNING" ---
  const modalSummaryData = useMemo(() => {
    const grouped: { [key: string]: { quality: string; size: string; gsm: number; runningCount: number; stoppedCount: number; totalMeters: number; totalGrossWt: number; totalNetWt: number; avgWtCalculated: number } } = {};
    
    modalFilteredReports.forEach((report) => {
      report.rows.forEach((row) => {
        const q = (row.quality || '').trim();
        const s = (row.size || '').trim();
        const g = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0;
        const m = row.totalMeters || 0;
        const gw = row.grossWt || 0;
        const nw = row.netWt || 0;
        const isRunning = row.runningStatus === 'Running';
        
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
      const isNoLoadA = a.quality.toUpperCase().includes('NO LOAD') || a.size.toUpperCase().includes('NO LOAD');
      const isNoLoadB = b.quality.toUpperCase().includes('NO LOAD') || b.size.toUpperCase().includes('NO LOAD');
      if (isNoLoadA && !isNoLoadB) return 1;
      if (!isNoLoadA && isNoLoadB) return -1;

      const sComp = a.size.localeCompare(b.size, undefined, { numeric: true, sensitivity: 'base' });
      if (sComp !== 0) return sComp;

      if (a.gsm !== b.gsm) return a.gsm - b.gsm;

      return a.quality.localeCompare(b.quality, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [modalFilteredReports]);

  // --- SUMMARY MODAL TOTALS ---
  const modalTotals = useMemo(() => {
    let meters = 0;
    let gross = 0;
    let net = 0;
    let running = 0;
    let stopped = 0;

    modalSummaryData.forEach(item => {
      meters += item.totalMeters || 0;
      gross += item.totalGrossWt || 0;
      net += item.totalNetWt || 0;
      running += item.runningCount || 0;
      stopped += item.stoppedCount || 0;
    });

    const avgCalc = meters > 0 ? parseFloat((net / meters).toFixed(4)) : 0;

    return {
      totalMeters: meters,
      totalGrossWt: parseFloat(gross.toFixed(2)),
      totalNetWt: parseFloat(net.toFixed(2)),
      runningCount: running,
      stoppedCount: stopped,
      totalLooms: running + stopped,
      avgCalc
    };
  }, [modalSummaryData]);

  // --- EXPORT SUMMARY EXCEL REPORT ---
  const handleExportSummaryExcel = async () => {
    if (modalSummaryData.length === 0) {
      triggerAlert('info', 'No summary data available to export for the selected period.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Number of Looms Running');
      worksheet.views = [{ showGridLines: true }];

      const thickBlackBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF000000' } },
        left: { style: 'medium' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF000000' } },
        right: { style: 'medium' as const, color: { argb: 'FF000000' } },
      };

      // 1. BANNER HEADER (Row 1)
      worksheet.mergeCells('A1:I1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'FORTUNE FLEXIPACK PVT LIMITED • NUMBER OF LOOMS RUNNING SUMMARY REPORT';
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 40;
      for (let col = 1; col <= 9; col++) {
        worksheet.getRow(1).getCell(col).border = thickBlackBorder;
      }

      // 2. SUB-BANNER DATE RANGE & SHIFT (Row 2)
      worksheet.mergeCells('A2:I2');
      const dateCell = worksheet.getCell('A2');
      const periodLabel = sumFilterMode === 'single'
        ? formatDateLabel(sumSingleDate)
        : `${formatDateLabel(sumRangeStartDate)} TO ${formatDateLabel(sumRangeEndDate)}`;
      const shiftLabel = sumFilterShift === 'ALL' ? 'ALL SHIFTS' : `${sumFilterShift} SHIFT`;
      const printDateLabel = `PRINT DATE: ${formatDateDDMMMYYYY(new Date())} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      dateCell.value = `EXPORT PERIOD: ${periodLabel} • SHIFT: ${shiftLabel} • ${printDateLabel}`;
      dateCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 24;
      for (let col = 1; col <= 9; col++) {
        worksheet.getRow(2).getCell(col).border = thickBlackBorder;
      }

      // 3. KPI METRICS SUMMARY BANNER (Row 4 to 6)
      worksheet.getRow(3).height = 10; // Spacer

      worksheet.mergeCells('A4:I4');
      const mHeaderCell = worksheet.getCell('A4');
      mHeaderCell.value = 'NUMBER OF LOOMS RUNNING - SUMMARY METRICS';
      mHeaderCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      mHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(4).height = 22;
      for (let col = 1; col <= 9; col++) worksheet.getRow(4).getCell(col).border = thickBlackBorder;

      // Row 5 & 6 (KPI Row)
      worksheet.mergeCells('A5:C5'); worksheet.mergeCells('A6:C6');
      worksheet.mergeCells('D5:F5'); worksheet.mergeCells('D6:F6');
      worksheet.mergeCells('G5:I5'); worksheet.mergeCells('G6:I6');

      worksheet.getCell('A5').value = 'TOTAL LOOMS TRACKED';
      worksheet.getCell('A6').value = `${modalTotals.totalLooms} Looms (${modalTotals.runningCount} Running / ${modalTotals.stoppedCount} Stopped)`;

      worksheet.getCell('D5').value = 'TOTAL METERS WOVEN';
      worksheet.getCell('D6').value = `${modalTotals.totalMeters.toLocaleString()} Meters`;

      worksheet.getCell('G5').value = 'GROSS & NET WEIGHT';
      worksheet.getCell('G6').value = `Gross: ${modalTotals.totalGrossWt.toFixed(2)} KG | Net: ${modalTotals.totalNetWt.toFixed(2)} KG`;

      worksheet.getRow(5).height = 18;
      for (let col = 1; col <= 9; col++) {
        const c = worksheet.getRow(5).getCell(col);
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      worksheet.getRow(6).height = 24;
      for (let col = 1; col <= 9; col++) {
        const c = worksheet.getRow(6).getCell(col);
        c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      // 4. DATA TABLE HEADERS (Row 8)
      worksheet.getRow(7).height = 12; // Spacer
      const headers = ['Quality', 'Size', 'GSM', 'Total Meters (m)', 'Gross Wt (kg)', 'Net Wt (kg)', 'Avg Wt [calc] (kg)', 'Looms Running', 'Looms Stopped'];
      const headerRow = worksheet.getRow(8);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBlackBorder;
      });

      // 5. DATA ROWS
      let currentR = 9;
      modalSummaryData.forEach((item) => {
        const r = worksheet.getRow(currentR);
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

          if (colIdx === 3) {
            cell.numFmt = '#,##0';
          } else if (colIdx === 4 || colIdx === 5) {
            cell.numFmt = '#,##0.00';
          } else if (colIdx === 6) {
            cell.numFmt = '#,##0.0000';
          } else if (colIdx === 7 || colIdx === 8) {
            cell.numFmt = '#,##0';
          }
        });

        currentR++;
      });

      // 6. TOTALS ROW
      const totalsRow = worksheet.getRow(currentR);
      totalsRow.height = 26;
      for (let c = 1; c <= 9; c++) {
        const cell = totalsRow.getCell(c);
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thickBlackBorder;
      }

      totalsRow.getCell(1).value = 'TOTALS';
      totalsRow.getCell(2).value = '-';
      totalsRow.getCell(3).value = '-';
      totalsRow.getCell(4).value = modalTotals.totalMeters;
      totalsRow.getCell(4).numFmt = '#,##0';
      totalsRow.getCell(5).value = modalTotals.totalGrossWt;
      totalsRow.getCell(5).numFmt = '#,##0.00';
      totalsRow.getCell(6).value = modalTotals.totalNetWt;
      totalsRow.getCell(6).numFmt = '#,##0.00';
      totalsRow.getCell(7).value = modalTotals.avgCalc;
      totalsRow.getCell(7).numFmt = '#,##0.0000';
      totalsRow.getCell(8).value = modalTotals.runningCount;
      totalsRow.getCell(8).numFmt = '#,##0';
      totalsRow.getCell(9).value = modalTotals.stoppedCount;
      totalsRow.getCell(9).numFmt = '#,##0';

      // 7. COLUMN WIDTHS (Auto-adjusted to fit data)
      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? headers[idx].length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber >= 8) {
            const val = cell.value ? String(cell.value) : '';
            const lines = val.split('\n');
            lines.forEach(l => { if (l.length > maxLen) maxLen = l.length; });
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 40);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Number_of_Looms_Running_Summary_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      triggerAlert('success', 'Summary report exported successfully!');
    } catch (err) {
      console.error('Error exporting summary Excel:', err);
      triggerAlert('warn', 'Failed to export summary Excel report.');
    }
  };

  // --- AVAILABLE OPERATORS FOR SUMMARY DROPDOWN ---
  const availableOperatorNames = useMemo(() => {
    const set = new Set<string>();

    reports.forEach((rep) => {
      (rep.rows || []).forEach((row) => {
        const name = (row.operatorName || '').trim();
        if (name) set.add(name);
      });
    });

    employees.forEach((emp) => {
      const name = (emp.name || '').trim();
      if (name) set.add(name);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports, employees]);

  // --- SUMMARY MODAL DATA FOR "LOOM OPERATOR SUMMARY" ---
  const modalOperatorLedger = useMemo(() => {
    const groups: {
      [key: string]: {
        date: string;
        shift: string;
        operatorName: string;
        metersList: number[];
        loomNumbers: (string | number)[];
      };
    } = {};

    modalFilteredReports.forEach((report) => {
      const repDate = report.date || '';
      const repShift = (report.shift || 'DAY').toUpperCase().trim();

      (report.rows || []).forEach((row) => {
        const opName = (row.operatorName || '').trim();
        if (!opName) return;

        if (sumSelectedOperator !== 'ALL' && opName.toLowerCase() !== sumSelectedOperator.toLowerCase()) {
          return;
        }

        const meters = typeof row.totalMeters === 'number' ? row.totalMeters : parseFloat(row.totalMeters as any) || 0;
        if (meters <= 0) return;

        const key = `${repDate}||${repShift}||${opName.toLowerCase()}`;

        if (!groups[key]) {
          groups[key] = {
            date: repDate,
            shift: repShift,
            operatorName: opName,
            metersList: [],
            loomNumbers: []
          };
        }

        groups[key].metersList.push(meters);
        if (row.loomNo !== undefined && row.loomNo !== '') {
          groups[key].loomNumbers.push(row.loomNo);
        }
      });
    });

    return Object.values(groups)
      .map((g) => {
        const total = g.metersList.reduce((acc, v) => acc + v, 0);
        const count = g.metersList.length;
        const avg = count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
        const individualFormula = g.metersList.join(' + ');

        return {
          date: g.date,
          shift: g.shift,
          operatorName: g.operatorName,
          metersList: g.metersList,
          loomNumbers: g.loomNumbers,
          individualFormula,
          totalMeters: total,
          averageMeters: avg,
          loomCount: count
        };
      })
      .filter((item) => item.loomCount > 0 && item.totalMeters > 0)
      .sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const sComp = a.shift.localeCompare(b.shift);
        if (sComp !== 0) return sComp;
        return a.operatorName.localeCompare(b.operatorName);
      });
  }, [modalFilteredReports, sumSelectedOperator]);

  // Overall totals for operator summary
  const modalOperatorTotals = useMemo(() => {
    let totalMetersAll = 0;
    let totalLoomsAll = 0;

    modalOperatorLedger.forEach((item) => {
      totalMetersAll += item.totalMeters;
      totalLoomsAll += item.loomCount;
    });

    const overallAvg = totalLoomsAll > 0 ? parseFloat((totalMetersAll / totalLoomsAll).toFixed(2)) : 0;

    return {
      totalMeters: totalMetersAll,
      totalLooms: totalLoomsAll,
      overallAvg,
      totalEntries: modalOperatorLedger.length
    };
  }, [modalOperatorLedger]);

  // --- EXPORT LOOM OPERATOR SUMMARY EXCEL REPORT ---
  const handleExportOperatorSummaryExcel = async () => {
    if (modalOperatorLedger.length === 0) {
      triggerAlert('info', 'No operator summary data available to export for the selected period.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Loom Operator Summary');
      worksheet.views = [{ showGridLines: true }];

      const thickBlackBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF000000' } },
        left: { style: 'medium' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF000000' } },
        right: { style: 'medium' as const, color: { argb: 'FF000000' } },
      };

      // 1. BANNER HEADER (Row 1)
      worksheet.mergeCells('A1:G1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'FORTUNE FLEXIPACK PVT LIMITED • LOOM OPERATOR SUMMARY REPORT';
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 40;
      for (let col = 1; col <= 7; col++) worksheet.getRow(1).getCell(col).border = thickBlackBorder;

      // 2. SUB-BANNER DATE RANGE & SHIFT & OPERATOR (Row 2)
      worksheet.mergeCells('A2:G2');
      const subCell = worksheet.getCell('A2');
      const periodLabel = sumFilterMode === 'single'
        ? formatDateLabel(sumSingleDate)
        : `${formatDateLabel(sumRangeStartDate)} TO ${formatDateLabel(sumRangeEndDate)}`;
      const shiftLabel = sumFilterShift === 'ALL' ? 'ALL SHIFTS' : `${sumFilterShift} SHIFT`;
      const opLabel = sumSelectedOperator === 'ALL' ? 'ALL OPERATORS' : sumSelectedOperator.toUpperCase();
      const printDateLabel = `PRINT DATE: ${formatDateDDMMMYYYY(new Date())} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      subCell.value = `OPERATOR: ${opLabel} • EXPORT PERIOD: ${periodLabel} • SHIFT: ${shiftLabel} • ${printDateLabel}`;
      subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 24;
      for (let col = 1; col <= 7; col++) worksheet.getRow(2).getCell(col).border = thickBlackBorder;

      // 3. KPI METRICS SUMMARY BANNER (Row 4 to 6)
      worksheet.getRow(3).height = 10; // Spacer

      worksheet.mergeCells('A4:G4');
      const mHeaderCell = worksheet.getCell('A4');
      mHeaderCell.value = 'LOOM OPERATOR PERFORMANCE METRICS';
      mHeaderCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      mHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(4).height = 22;
      for (let col = 1; col <= 7; col++) worksheet.getRow(4).getCell(col).border = thickBlackBorder;

      // KPI row (Row 5 & 6)
      worksheet.mergeCells('A5:C5'); worksheet.mergeCells('A6:C6');
      worksheet.mergeCells('D5:E5'); worksheet.mergeCells('D6:E6');
      worksheet.mergeCells('F5:G5'); worksheet.mergeCells('F6:G6');

      worksheet.getCell('A5').value = 'SELECTED OPERATOR(S)';
      worksheet.getCell('A6').value = opLabel;

      worksheet.getCell('D5').value = 'TOTAL METERS WOVEN';
      worksheet.getCell('D6').value = `${modalOperatorTotals.totalMeters.toLocaleString()} m`;

      worksheet.getCell('F5').value = 'TOTAL LOOMS RUN & AVERAGE';
      worksheet.getCell('F6').value = `${modalOperatorTotals.totalLooms} Looms | Avg: ${modalOperatorTotals.overallAvg.toLocaleString()} m/loom`;

      worksheet.getRow(5).height = 18;
      for (let col = 1; col <= 7; col++) {
        const c = worksheet.getRow(5).getCell(col);
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      worksheet.getRow(6).height = 24;
      for (let col = 1; col <= 7; col++) {
        const c = worksheet.getRow(6).getCell(col);
        c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = thickBlackBorder;
      }

      // 4. DATA TABLE HEADERS (Row 8)
      worksheet.getRow(7).height = 12; // Spacer
      const headers = ['Date', 'Shift', 'Operator Name', 'Individual Loom Meters (m)', 'Total Meters (m)', 'Average Meters (m)', 'Looms Count'];
      const headerRow = worksheet.getRow(8);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBlackBorder;
      });

      // 5. DATA ROWS
      let currentR = 9;
      modalOperatorLedger.forEach((item) => {
        const r = worksheet.getRow(currentR);
        r.height = 22;

        const rowValues = [
          formatDateLabel(item.date),
          item.shift,
          item.operatorName,
          item.individualFormula,
          item.totalMeters,
          item.averageMeters,
          item.loomCount
        ];

        rowValues.forEach((val, colIdx) => {
          const cell = r.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = thickBlackBorder;

          if (colIdx === 4 || colIdx === 5) {
            cell.numFmt = '#,##0.00';
          } else if (colIdx === 6) {
            cell.numFmt = '#,##0';
          }
        });

        currentR++;
      });

      // 6. TOTALS ROW
      const totalsRow = worksheet.getRow(currentR);
      totalsRow.height = 26;
      for (let c = 1; c <= 7; c++) {
        const cell = totalsRow.getCell(c);
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thickBlackBorder;
      }

      totalsRow.getCell(1).value = 'TOTALS';
      totalsRow.getCell(2).value = '-';
      totalsRow.getCell(3).value = '-';
      totalsRow.getCell(4).value = '-';
      totalsRow.getCell(5).value = modalOperatorTotals.totalMeters;
      totalsRow.getCell(5).numFmt = '#,##0.00';
      totalsRow.getCell(6).value = modalOperatorTotals.overallAvg;
      totalsRow.getCell(6).numFmt = '#,##0.00';
      totalsRow.getCell(7).value = modalOperatorTotals.totalLooms;
      totalsRow.getCell(7).numFmt = '#,##0';

      // 7. COLUMN WIDTHS (Auto-adjusted to fit data)
      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? headers[idx].length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber >= 8) {
            const val = cell.value ? String(cell.value) : '';
            const lines = val.split('\n');
            lines.forEach(l => { if (l.length > maxLen) maxLen = l.length; });
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 40);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Loom_Operator_Summary_${opLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      triggerAlert('success', 'Loom Operator Summary exported successfully!');
    } catch (err) {
      console.error('Error exporting operator summary Excel:', err);
      triggerAlert('warn', 'Failed to export operator summary Excel report.');
    }
  };

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

  // --- SYNC DAY SHIFT ROLLS TO MASTER ROLL LEDGER DIRECTORY ---
  const syncDayShiftRollsToMasterLedger = async (
    reportDate: string,
    rowsWithRolls: LoomRunningRow[],
    existingLoomOrders: LoomOrder[]
  ) => {
    if (rowsWithRolls.length === 0) return;

    const updatedOrdersMap = new Map<string, LoomOrder>();
    existingLoomOrders.forEach(ord => {
      updatedOrdersMap.set(ord.id, JSON.parse(JSON.stringify(ord)));
    });

    const masterOrderId = 'L_RUNNING_DAY_SHIFTS_MASTER';
    let masterOrder = updatedOrdersMap.get(masterOrderId);
    if (!masterOrder) {
      masterOrder = {
        id: masterOrderId,
        orderNo: '',
        date: reportDate,
        status: 'Production',
        rows: [],
        createdAt: new Date().toISOString()
      };
      updatedOrdersMap.set(masterOrderId, masterOrder);
    } else {
      masterOrder.orderNo = '';
    }

    const modifiedOrderIds = new Set<string>();

    rowsWithRolls.forEach(row => {
      const trimmedRollNo = (row.rollNo || '').trim();
      if (!trimmedRollNo) return;

      const metersVal = (typeof row.rollMeters === 'number' ? row.rollMeters : parseFloat(row.rollMeters as any) || 0) ||
                       (typeof row.totalMeters === 'number' ? row.totalMeters : parseFloat(row.totalMeters as any) || 0);
      const grossWtVal = typeof row.grossWt === 'number' ? row.grossWt : parseFloat(row.grossWt as any) || 0;
      const coreWtVal = typeof row.coreWt === 'number' ? row.coreWt : parseFloat(row.coreWt as any) || 0;
      const netWtVal = typeof row.netWt === 'number' ? row.netWt : parseFloat(row.netWt as any) || 0;
      const avgWtCalcVal = typeof row.avgWtCalculated === 'number' ? row.avgWtCalculated : parseFloat(row.avgWtCalculated as any) || 0;
      const gsmVal = typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0;
      const denierVal = typeof row.denier === 'number' ? row.denier : parseInt(row.denier as any) || 0;
      const avgWtVal = typeof row.average === 'number' ? row.average : parseFloat(row.average as any) || 0;

      let foundExistingOrder: LoomOrder | null = null;
      let foundSubOrderIdx = -1;

      for (const ord of updatedOrdersMap.values()) {
        (ord.rows || []).forEach((subRow, sIdx) => {
          if ((subRow.rollNumbers || []).some(r => (r || '').trim().toUpperCase() === trimmedRollNo.toUpperCase())) {
            foundExistingOrder = ord;
            foundSubOrderIdx = sIdx;
          }
        });
        if (foundExistingOrder) break;
      }

      if (foundExistingOrder && foundSubOrderIdx >= 0) {
        const targetSubRow = (foundExistingOrder as LoomOrder).rows[foundSubOrderIdx];
        targetSubRow.rollGrossWt = { ...(targetSubRow.rollGrossWt || {}), [trimmedRollNo]: grossWtVal };
        targetSubRow.rollCoreWt = { ...(targetSubRow.rollCoreWt || {}), [trimmedRollNo]: coreWtVal };
        targetSubRow.rollNetWt = { ...(targetSubRow.rollNetWt || {}), [trimmedRollNo]: netWtVal };
        targetSubRow.rollAvgWtCalculated = { ...(targetSubRow.rollAvgWtCalculated || {}), [trimmedRollNo]: avgWtCalcVal };
        targetSubRow.rollMeters = { ...(targetSubRow.rollMeters || {}), [trimmedRollNo]: metersVal };
        targetSubRow.rollWarpStrength = { ...(targetSubRow.rollWarpStrength || {}), [trimmedRollNo]: row.warpStrength || '' };
        targetSubRow.rollWarpElongation = { ...(targetSubRow.rollWarpElongation || {}), [trimmedRollNo]: row.warpElongation || '' };
        targetSubRow.rollWeftStrength = { ...(targetSubRow.rollWeftStrength || {}), [trimmedRollNo]: row.weftStrength || '' };
        targetSubRow.rollWeftElongation = { ...(targetSubRow.rollWeftElongation || {}), [trimmedRollNo]: row.weftElongation || '' };
        if (row.remarks) {
          targetSubRow.rollRemarks = { ...(targetSubRow.rollRemarks || {}), [trimmedRollNo]: row.remarks };
        }
        modifiedOrderIds.add((foundExistingOrder as LoomOrder).id);
      } else {
        let matchingSubRow = masterOrder.rows.find(r => 
          (r.quality || '').trim().toLowerCase() === (row.quality || '').trim().toLowerCase() &&
          (r.size || '').trim().toLowerCase() === (row.size || '').trim().toLowerCase() &&
          r.gsm === gsmVal
        );

        if (!matchingSubRow) {
          matchingSubRow = {
            size: row.size || 'N/A',
            quality: row.quality || 'Day Shift Production',
            gsm: gsmVal,
            denier: denierVal,
            fabricWeight: avgWtVal,
            totalQuantity: 0,
            noOfRolls: 0,
            rollNumbers: [],
            rollGrossWt: {},
            rollCoreWt: {},
            rollNetWt: {},
            rollAvgWtCalculated: {},
            rollMeters: {},
            rollWarpStrength: {},
            rollWarpElongation: {},
            rollWeftStrength: {},
            rollWeftElongation: {},
            rollRemarks: {},
            rollDispatchStatus: {}
          };
          masterOrder.rows.push(matchingSubRow);
        }

        if (!matchingSubRow.rollNumbers.includes(trimmedRollNo)) {
          matchingSubRow.rollNumbers.push(trimmedRollNo);
        }
        matchingSubRow.noOfRolls = matchingSubRow.rollNumbers.length;
        matchingSubRow.rollGrossWt = { ...(matchingSubRow.rollGrossWt || {}), [trimmedRollNo]: grossWtVal };
        matchingSubRow.rollCoreWt = { ...(matchingSubRow.rollCoreWt || {}), [trimmedRollNo]: coreWtVal };
        matchingSubRow.rollNetWt = { ...(matchingSubRow.rollNetWt || {}), [trimmedRollNo]: netWtVal };
        matchingSubRow.rollAvgWtCalculated = { ...(matchingSubRow.rollAvgWtCalculated || {}), [trimmedRollNo]: avgWtCalcVal };
        matchingSubRow.rollMeters = { ...(matchingSubRow.rollMeters || {}), [trimmedRollNo]: metersVal };
        matchingSubRow.rollWarpStrength = { ...(matchingSubRow.rollWarpStrength || {}), [trimmedRollNo]: row.warpStrength || '' };
        matchingSubRow.rollWarpElongation = { ...(matchingSubRow.rollWarpElongation || {}), [trimmedRollNo]: row.warpElongation || '' };
        matchingSubRow.rollWeftStrength = { ...(matchingSubRow.rollWeftStrength || {}), [trimmedRollNo]: row.weftStrength || '' };
        matchingSubRow.rollWeftElongation = { ...(matchingSubRow.rollWeftElongation || {}), [trimmedRollNo]: row.weftElongation || '' };
        if (row.remarks || row.operatorName || row.loomNo) {
          matchingSubRow.rollRemarks = { 
            ...(matchingSubRow.rollRemarks || {}), 
            [trimmedRollNo]: row.remarks || `Loom #${row.loomNo || ''} (${row.operatorName || ''})` 
          };
        }
        if (!matchingSubRow.rollDispatchStatus?.[trimmedRollNo]) {
          matchingSubRow.rollDispatchStatus = { 
            ...(matchingSubRow.rollDispatchStatus || {}), 
            [trimmedRollNo]: 'Not Dispatched' 
          };
        }

        matchingSubRow.totalQuantity = Object.values(matchingSubRow.rollNetWt).reduce((sum, w) => sum + (w || 0), 0);

        modifiedOrderIds.add(masterOrderId);
      }
    });

    for (const orderId of modifiedOrderIds) {
      const orderToSave = updatedOrdersMap.get(orderId);
      if (orderToSave) {
        await setDoc(doc(db, 'loomOrders', orderId), orderToSave);
      }
    }
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
        mesh: row.mesh || '',
        totalMeters: typeof row.totalMeters === 'number' ? row.totalMeters : parseFloat(row.totalMeters as any) || 0,
        gsm: typeof row.gsm === 'number' ? row.gsm : parseFloat(row.gsm as any) || 0,
        denier: typeof row.denier === 'number' ? row.denier : parseInt(row.denier as any) || 0,
        average: typeof row.average === 'number' ? row.average : parseFloat(row.average as any) || 0,
        rollNo: row.rollNo || '',
        warpStrength: row.warpStrength || '',
        warpElongation: row.warpElongation || '',
        weftStrength: row.weftStrength || '',
        weftElongation: row.weftElongation || '',
        rollMeters: typeof row.rollMeters === 'number' ? row.rollMeters : parseFloat(row.rollMeters as any) || 0,
        grossWt: typeof row.grossWt === 'number' ? row.grossWt : parseFloat(row.grossWt as any) || 0,
        coreWt: typeof row.coreWt === 'number' ? row.coreWt : parseFloat(row.coreWt as any) || 0,
        netWt: typeof row.netWt === 'number' ? row.netWt : parseFloat(row.netWt as any) || 0,
        avgWtCalculated: typeof row.avgWtCalculated === 'number' ? row.avgWtCalculated : parseFloat(row.avgWtCalculated as any) || 0,
        gsmCalculated: typeof row.gsmCalculated === 'number' ? row.gsmCalculated : parseFloat(row.gsmCalculated as any) || 0,
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

      await setDoc(doc(db, 'loomRunningReports', docId), payload);

      // If we edited an old record and renamed its ID, delete the original document ID
      if (editingReportId && editingReportId !== docId) {
        await deleteDoc(doc(db, 'loomRunningReports', editingReportId));
      }

      // Sync Day Shift roll numbers and details into Master Roll Ledger Directory (loomOrders collection)
      const isDayShift = (entryShift || '').toString().toUpperCase() === 'DAY';
      const rowsWithRolls = isAllStopped ? [] : cleanRows.filter(r => (r.rollNo || '').trim() !== '');

      if (isDayShift && rowsWithRolls.length > 0) {
        await syncDayShiftRollsToMasterLedger(entryDate, rowsWithRolls, loomOrders);
      }

      triggerAlert(
        'success',
        `Loom Running Report for ${formatDateLabel(entryDate)} (${entryShift === 'NIGHT' ? 'Night Shift' : 'Day Shift'}) has been successfully saved.${isDayShift && rowsWithRolls.length > 0 ? ` (${rowsWithRolls.length} roll(s) synced to Master Roll Ledger Directory)` : ''}`
      );
      setShowAddModal(false);
      resetModalState();
    } catch (err: any) {
      console.error('Error submitting report:', err);
      triggerAlert('warn', `Failed to submit report: ${err?.message || 'Database permissions or network error'}`);
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

  // --- UPLOAD EXCEL FILE TO POPULATE PREVIEW LEDGER ---
  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'binary' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          triggerAlert('warn', 'The uploaded Excel file contains no sheets.');
          return;
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          triggerAlert('warn', 'The uploaded Excel file is empty.');
          return;
        }

        let headerRowIndex = -1;
        const colMap: { [key: string]: number } = {};

        // Search first 15 rows for header names
        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;
          const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');

          if (
            rowStr.includes('loom') ||
            rowStr.includes('quality') ||
            rowStr.includes('size') ||
            rowStr.includes('gsm') ||
            rowStr.includes('denier') ||
            rowStr.includes('meters') ||
            rowStr.includes('operator')
          ) {
            headerRowIndex = r;
            row.forEach((cellVal, colIdx) => {
              const h = String(cellVal || '').trim().toLowerCase();
              if (!h) return;
              if ((h.includes('loom') || h.includes('l/no') || h.includes('l #') || h.includes('l.no')) && colMap.loomNo === undefined) {
                colMap.loomNo = colIdx;
              } else if ((h.includes('operator') || h.includes('op name') || h.includes('opr')) && colMap.operatorName === undefined) {
                colMap.operatorName = colIdx;
              } else if (h.includes('mesh') && colMap.mesh === undefined) {
                colMap.mesh = colIdx;
              } else if ((h.includes('roll meter') || h.includes('roll mtr')) && colMap.rollMeters === undefined) {
                colMap.rollMeters = colIdx;
              } else if ((h.includes('meter') || h.includes('mtr')) && colMap.totalMeters === undefined) {
                colMap.totalMeters = colIdx;
              } else if (h.includes('quality') && colMap.quality === undefined) {
                colMap.quality = colIdx;
              } else if (h.includes('size') && colMap.size === undefined) {
                colMap.size = colIdx;
              } else if (h.includes('gsm') && !h.includes('calc') && colMap.gsm === undefined) {
                colMap.gsm = colIdx;
              } else if ((h.includes('denier') || h.includes('dnr')) && colMap.denier === undefined) {
                colMap.denier = colIdx;
              } else if ((h.includes('avg wt') || h.includes('average')) && !h.includes('calc') && colMap.average === undefined) {
                colMap.average = colIdx;
              } else if ((h.includes('roll') || h.includes('roll #')) && !h.includes('meter') && colMap.rollNo === undefined) {
                colMap.rollNo = colIdx;
              } else if (h.includes('warp') && (h.includes('strength') || h.includes('str')) && colMap.warpStrength === undefined) {
                colMap.warpStrength = colIdx;
              } else if (h.includes('warp') && (h.includes('elong') || h.includes('%')) && colMap.warpElongation === undefined) {
                colMap.warpElongation = colIdx;
              } else if (h.includes('weft') && (h.includes('strength') || h.includes('str')) && colMap.weftStrength === undefined) {
                colMap.weftStrength = colIdx;
              } else if (h.includes('weft') && (h.includes('elong') || h.includes('%')) && colMap.weftElongation === undefined) {
                colMap.weftElongation = colIdx;
              } else if ((h.includes('gross') || h.includes('gr wt')) && colMap.grossWt === undefined) {
                colMap.grossWt = colIdx;
              } else if ((h.includes('core') || h.includes('cr wt')) && colMap.coreWt === undefined) {
                colMap.coreWt = colIdx;
              } else if ((h.includes('net') || h.includes('net wt')) && colMap.netWt === undefined) {
                colMap.netWt = colIdx;
              } else if (h.includes('avg wt') && h.includes('calc') && colMap.avgWtCalculated === undefined) {
                colMap.avgWtCalculated = colIdx;
              } else if (h.includes('gsm') && h.includes('calc') && colMap.gsmCalculated === undefined) {
                colMap.gsmCalculated = colIdx;
              } else if ((h.includes('status') || h.includes('running')) && colMap.runningStatus === undefined) {
                colMap.runningStatus = colIdx;
              } else if (h.includes('remark') && colMap.remarks === undefined) {
                colMap.remarks = colIdx;
              }
            });
            break;
          }
        }

        const parsedRows: LoomRunningRow[] = [];
        const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

        for (let r = startRow; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const getCell = (colKey: string, fallbackIdx: number) => {
            const colIdx = colMap[colKey] !== undefined ? colMap[colKey] : fallbackIdx;
            if (colIdx < 0 || colIdx >= row.length) return '';
            const val = row[colIdx];
            return val !== null && val !== undefined ? String(val).trim() : '';
          };

          const loomNoStr = getCell('loomNo', 0);

          if (
            !loomNoStr ||
            loomNoStr.toLowerCase().includes('loom') ||
            loomNoStr.toLowerCase().includes('total') ||
            loomNoStr.toLowerCase().includes('s no') ||
            loomNoStr.toLowerCase().includes('s.no') ||
            loomNoStr.toLowerCase().includes('report') ||
            loomNoStr.toLowerCase().includes('company') ||
            loomNoStr.toLowerCase().includes('summary')
          ) {
            continue;
          }

          const operatorName = getCell('operatorName', 1);
          const mesh = getCell('mesh', 2);
          const metersRaw = getCell('totalMeters', 3);
          const quality = getCell('quality', 4);
          const sizeStr = getCell('size', 5);
          const gsmRaw = getCell('gsm', 6);
          const denierRaw = getCell('denier', 7);
          const avgRaw = getCell('average', 8);
          const rollNo = getCell('rollNo', 9);
          const warpStrength = getCell('warpStrength', 10);
          const warpElongation = getCell('warpElongation', 11);
          const weftStrength = getCell('weftStrength', 12);
          const weftElongation = getCell('weftElongation', 13);
          const rollMetersRaw = getCell('rollMeters', 14);
          const grossWtRaw = getCell('grossWt', 15);
          const coreWtRaw = getCell('coreWt', 16);
          const netWtRaw = getCell('netWt', 17);
          const avgWtCalculatedRaw = getCell('avgWtCalculated', 18);
          const gsmCalculatedRaw = getCell('gsmCalculated', 19);
          const statusRaw = getCell('runningStatus', 20);
          const remarksStr = getCell('remarks', 21);

          const totalMeters = parseFloat(metersRaw) || 0;
          const gsm = parseFloat(gsmRaw) || 0;
          const denier = parseInt(denierRaw, 10) || 0;

          let average = parseFloat(avgRaw) || 0;
          if (!average && sizeStr && gsm) {
            const sizeMatch = sizeStr.match(/[\d.]+/);
            const sizeNum = sizeMatch ? parseFloat(sizeMatch[0]) : 0;
            if (sizeNum > 0) {
              average = parseFloat((sizeNum * gsm).toFixed(2));
            }
          }

          const rollMeters = parseFloat(rollMetersRaw) || 0;
          const grossWt = parseFloat(grossWtRaw) || 0;
          const coreWt = parseFloat(coreWtRaw) || 0;
          let netWt = parseFloat(netWtRaw) || 0;
          if (!netWt && grossWt > 0) {
            netWt = parseFloat((grossWt - coreWt).toFixed(2));
          }

          let avgWtCalculated = parseFloat(avgWtCalculatedRaw) || 0;
          if (!avgWtCalculated && netWt > 0 && totalMeters > 0) {
            avgWtCalculated = parseFloat(((netWt * 1000) / totalMeters).toFixed(2));
          }

          const gsmCalculated = parseFloat(gsmCalculatedRaw) || 0;

          let runningStatus: 'Running' | 'Stopped' = 'Running';
          const stLower = statusRaw.toLowerCase();
          if (stLower.includes('stop') || stLower.includes('no load') || operatorName.toLowerCase().includes('no load')) {
            runningStatus = 'Stopped';
          }

          parsedRows.push({
            loomNo: loomNoStr,
            operatorName,
            mesh,
            totalMeters,
            quality,
            size: sizeStr,
            gsm,
            denier,
            average,
            rollNo,
            warpStrength,
            warpElongation,
            weftStrength,
            weftElongation,
            rollMeters,
            grossWt,
            coreWt,
            netWt,
            avgWtCalculated,
            gsmCalculated,
            runningStatus,
            remarks: remarksStr
          });
        }

        if (parsedRows.length === 0) {
          triggerAlert('warn', 'No valid loom rows found in Excel file. Please ensure columns match standard headers.');
          return;
        }

        setPreviewRows(parsedRows);
        setIsAllStopped(false);
        triggerAlert('success', `Successfully imported ${parsedRows.length} machine rows from Excel file!`);
      } catch (err: any) {
        console.error('Error reading Excel file:', err);
        triggerAlert('warn', `Failed to parse Excel file: ${err?.message || 'Invalid format'}`);
      } finally {
        if (excelFileInputRef.current) {
          excelFileInputRef.current.value = '';
        }
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- MANUALLY ADD A ROW TO PREVIEW/LEDGER ---
  const handleAddEmptyRow = () => {
    const nextLoomNo = previewRows.length > 0 
      ? String(Math.max(...previewRows.map(r => parseInt(r.loomNo) || 0)) + 1)
      : '1';

    const newRow: LoomRunningRow = {
      loomNo: nextLoomNo,
      operatorName: '',
      mesh: '',
      totalMeters: '' as any,
      quality: '',
      size: '',
      gsm: '' as any,
      denier: '' as any,
      average: '' as any,
      rollNo: '',
      warpStrength: '',
      warpElongation: '',
      weftStrength: '',
      weftElongation: '',
      rollMeters: '' as any,
      grossWt: '' as any,
      coreWt: '' as any,
      netWt: '' as any,
      avgWtCalculated: '' as any,
      gsmCalculated: '' as any,
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

    // Auto-calculate Net Wt, Avg Wt [calculated], and GSM [calculated]
    if (field === 'grossWt' || field === 'coreWt') {
      const g = typeof updatedRow.grossWt === 'number' ? updatedRow.grossWt : parseFloat(updatedRow.grossWt as any) || 0;
      const c = typeof updatedRow.coreWt === 'number' ? updatedRow.coreWt : parseFloat(updatedRow.coreWt as any) || 0;
      if (g > 0 || c > 0) {
        updatedRow.netWt = parseFloat(Math.max(0, g - c).toFixed(3));
      }
    }

    const n = typeof updatedRow.netWt === 'number' ? updatedRow.netWt : parseFloat(updatedRow.netWt as any) || 0;
    const m = (typeof updatedRow.totalMeters === 'number' ? updatedRow.totalMeters : parseFloat(updatedRow.totalMeters as any) || 0) || (typeof updatedRow.rollMeters === 'number' ? updatedRow.rollMeters : parseFloat(updatedRow.rollMeters as any) || 0);

    if (m > 0 && n > 0) {
      // Avg Wt [Calc] in grams: Net Wt (kg) * 1000 / meters
      updatedRow.avgWtCalculated = parseFloat(((n * 1000) / m).toFixed(2));

      // GSM [Calc]: Net Wt (g) / Area (m * width_in_meters)
      const sizeStr = String(updatedRow.size || '');
      const sizeMatch = sizeStr.match(/[\d.]+/);
      const sizeNum = sizeMatch ? parseFloat(sizeMatch[0]) : 0;
      if (sizeNum > 0) {
        const area = m * (sizeNum * 0.0254);
        if (area > 0) {
          updatedRow.gsmCalculated = parseFloat(((n * 1000) / area).toFixed(1));
        }
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
    if (excelFileInputRef.current) excelFileInputRef.current.value = '';
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
      const printDateMainStr = `PRINT DATE: ${formatDateDDMMMYYYY(new Date())} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      dateCell.value = `EXPORT PERIOD: ${periodLabel} • SHIFT: ${shiftLabel} • ${printDateMainStr}`;
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
      const headers = [
        'Report Date',
        'Loom No',
        'Loom Opr',
        'Mesh',
        'Meters',
        'Quality',
        'Size',
        'GSM',
        'DENIER',
        'AVG WT (g)',
        'ROLL NO',
        'WARP STRENGTH (kgs)',
        'WARP ELONGATION (%)',
        'WEFT STRENGTH (kgs)',
        'WEFT ELONGATION (%)',
        'ROLL METERS',
        'GR WT (kg)',
        'CR WT (kg)',
        'NET WT (kg)',
        'AVG WT [CALC] (g)',
        'GSM [CALC]',
        'RUNNING STATUS',
        'Remarks'
      ];
      const headerRow = worksheet.getRow(8);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
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
            row.mesh || '-',
            row.totalMeters || 0,
            row.quality || '-',
            row.size || '-',
            row.gsm || 0,
            row.denier || 0,
            row.average || 0,
            row.rollNo || '-',
            row.warpStrength || '-',
            row.warpElongation || '-',
            row.weftStrength || '-',
            row.weftElongation || '-',
            row.rollMeters || 0,
            row.grossWt || 0,
            row.coreWt || 0,
            row.netWt || 0,
            row.avgWtCalculated || 0,
            row.gsmCalculated || 0,
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

      // 7. COLUMN WIDTHS (Auto-adjusted to fit data)
      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? headers[idx].length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber >= 8) {
            const val = cell.value ? String(cell.value) : '';
            const lines = val.split('\n');
            lines.forEach(l => { if (l.length > maxLen) maxLen = l.length; });
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 40);
      });

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
      sumDateCell.value = `EXPORT PERIOD: ${periodLabel} • ${printDateMainStr}`;
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

      // 6. COLUMN WIDTHS FOR SUMMARY WORKSHEET (Auto-adjusted to fit data)
      worksheet2.columns.forEach((col, idx) => {
        let maxLen = sumHeaders[idx] ? sumHeaders[idx].length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber >= 4) {
            const val = cell.value ? String(cell.value) : '';
            const lines = val.split('\n');
            lines.forEach(l => { if (l.length > maxLen) maxLen = l.length; });
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 40);
      });

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

  // --- HELPER: FORMAT DATE TO "DD-MMM-YYYY" ---
  const formatDateLabel = (dateStr: string) => {
    return formatDateDDMMMYYYY(dateStr);
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
              onClick={handleOpenSummaryMenu}
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
                      <table className="w-full text-left border-collapse min-w-[1700px]">
                        <thead className="sticky top-0 z-20 bg-slate-900 text-slate-100 text-[10px] md:text-[11px] font-black uppercase tracking-wider select-none shadow-xs">
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[70px]">Loom No</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-left min-w-[150px]">Loom Opr</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[80px]">Mesh</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[95px]">Meters</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-left min-w-[120px]">Quality</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[80px]">Size</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[70px]">GSM</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[75px]">Denier</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[95px]">Avg Wt (g)</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[85px]">Roll No</th>
                            
                            {/* WARP HEADER */}
                            <th colSpan={2} className="py-2 px-2 border-r border-b border-slate-800 bg-amber-950/80 text-amber-200 text-center font-black">
                              WARP
                            </th>
                            
                            {/* WEFT HEADER */}
                            <th colSpan={2} className="py-2 px-2 border-r border-b border-slate-800 bg-amber-950/80 text-amber-200 text-center font-black">
                              WEFT
                            </th>
                            
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[95px]">Roll Meters</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[85px]">Gr Wt (kg)</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[80px]">Cr Wt (kg)</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[85px]">Net Wt (kg)</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-right min-w-[110px]">Avg Wt [Calc] (g)</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[90px]">GSM [Calc]</th>
                            <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 bg-slate-900 sticky top-0 text-center min-w-[115px]">Running Status</th>
                            <th rowSpan={2} className="py-2.5 px-3 bg-slate-900 sticky top-0 text-center min-w-[130px]">Remarks</th>
                          </tr>
                          <tr className="bg-slate-900 text-slate-100 text-[9px] font-black uppercase tracking-wider border-b border-slate-800">
                            <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Strength (kgs)</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Elongation (%)</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Strength (kgs)</th>
                            <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Elongation (%)</th>
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
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-semibold text-slate-800">
                                {row.mesh || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-black text-emerald-700">
                                {row.totalMeters ? row.totalMeters.toLocaleString() : '0'} <span className="text-[10px] text-slate-400 font-semibold">m</span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150">
                                {row.quality || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-semibold">
                                {row.size || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono">
                                {row.gsm ? `${row.gsm} gsm` : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-indigo-900">
                                {row.denier || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono">
                                {row.average ? `${row.average} g` : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono font-bold text-slate-900">
                                {row.rollNo || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-amber-900 font-bold bg-amber-50/20">
                                {row.warpStrength || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-amber-900 font-bold bg-amber-50/20">
                                {row.warpElongation ? `${row.warpElongation}%` : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-amber-900 font-bold bg-amber-50/20">
                                {row.weftStrength || '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono text-amber-900 font-bold bg-amber-50/20">
                                {row.weftElongation ? `${row.weftElongation}%` : '-'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-right font-mono font-bold text-slate-800">
                                {row.rollMeters != null ? row.rollMeters : '-'}
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
                              <td className="py-3 px-4 border-r border-slate-150 text-center font-mono font-black text-purple-700">
                                {row.gsmCalculated != null ? row.gsmCalculated : '-'}
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
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Mesh</span>
                              <span className="text-xs font-black text-slate-800">{row.mesh || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Total Meters</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">{row.totalMeters ? row.totalMeters.toLocaleString() : 0} m</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Quality</span>
                              <span className="text-xs font-bold text-slate-800 leading-snug block">{row.quality || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Roll No</span>
                              <span className="text-xs font-black text-slate-900 font-mono">{row.rollNo || '-'}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-dashed border-slate-150">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Size</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.size || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">GSM</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.gsm || '-'} gsm</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Denier</span>
                              <span className="text-xs font-black text-indigo-900 font-mono">{row.denier || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Avg Weight</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.average || '-'} g</span>
                            </div>
                          </div>

                          {/* WARP & WEFT Details */}
                          <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-150/80 space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                              <div>
                                <span className="text-[9px] text-amber-800 font-extrabold uppercase tracking-widest block">Warp Str / Elong</span>
                                <span className="font-mono text-amber-950">{row.warpStrength || '-'} / {row.warpElongation ? `${row.warpElongation}%` : '-'}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-amber-800 font-extrabold uppercase tracking-widest block">Weft Str / Elong</span>
                                <span className="font-mono text-amber-950">{row.weftStrength || '-'} / {row.weftElongation ? `${row.weftElongation}%` : '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-dashed border-slate-150">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Roll Meters</span>
                              <span className="text-xs font-black text-slate-800 font-mono">{row.rollMeters != null ? row.rollMeters : '-'} m</span>
                            </div>
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
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Avg Wt [Calc]</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">{row.avgWtCalculated != null ? row.avgWtCalculated : '-'} g</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">GSM [Calc]</span>
                              <span className="text-xs font-black text-purple-700 font-mono">{row.gsmCalculated != null ? row.gsmCalculated : '-'}</span>
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
                      <input
                        type="file"
                        ref={excelFileInputRef}
                        accept=".xlsx, .xls, .csv"
                        onChange={handleExcelFileUpload}
                        className="hidden"
                        id="excel-file-selector"
                      />
                      {previewRows.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => excelFileInputRef.current?.click()}
                            className="px-3 h-7 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-black text-[9px] tracking-wider uppercase transition-colors inline-flex items-center gap-1 border border-emerald-200/80 cursor-pointer"
                            title="Upload data directly from an Excel file (.xlsx, .xls, .csv)"
                          >
                            <FileSpreadsheet size={11} className="text-emerald-600" />
                            Upload Excel
                          </button>
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

                    {/* Master Roll Ledger Directory Duplicate Roll Alert Banner */}
                    {duplicateMasterRollsInPreview.length > 0 && (
                      <div className="mb-3 bg-amber-50 border-2 border-amber-300/90 rounded-2xl p-3 flex items-start gap-3 shadow-xs animate-fade-in shrink-0">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-2">
                            <span>Master Roll Directory Duplicate Roll Alert</span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-extrabold">
                              {duplicateMasterRollsInPreview.length} Roll{duplicateMasterRollsInPreview.length > 1 ? 's' : ''} Already Registered
                            </span>
                          </h4>
                          <p className="text-xs text-amber-850 font-semibold leading-relaxed">
                            The following roll number(s) inputted in this report already exist in the Master Roll Ledger Directory:
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {duplicateMasterRollsInPreview.map((item, i) => (
                              <span key={i} className="inline-flex items-center gap-1 bg-amber-200/90 border border-amber-300 text-amber-950 px-2 py-0.5 rounded-lg text-xs font-mono font-bold shadow-2xs">
                                <span className="text-amber-950 font-black">{item.rollNo}</span>
                                <span className="text-[10px] text-amber-800 font-medium">(Order #{item.orderNo})</span>
                              </span>
                            ))}
                          </div>
                          <p className="text-[11px] text-amber-800 font-medium pt-0.5">
                            Submitting this report will sync & update their roll details (Weights, Meters, Warp/Weft Strengths) in the Master Directory.
                          </p>
                        </div>
                      </div>
                    )}

                    {previewRows.length === 0 ? (
                      <div className="flex-1 border border-slate-150 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center p-8 text-center select-none min-h-[250px]">
                        <Info className="text-slate-350 mb-2" size={32} />
                        <span className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">Preview Ledger Empty</span>
                        <p className="text-[10px] text-slate-450 max-w-[360px] mt-1 mb-4 font-medium leading-relaxed">
                          Upload an Excel spreadsheet, click "Copy Data from Last Report" to fill with yesterday's machine specifications, upload an image file, or add manual rows.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => excelFileInputRef.current?.click()}
                            className="px-4 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] tracking-wider uppercase shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                            title="Upload data directly from an Excel file (.xlsx, .xls, .csv)"
                          >
                            <FileSpreadsheet size={13} />
                            Upload Excel Data
                          </button>
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
                        <table className="w-full text-left border-collapse min-w-[2000px]">
                          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-100 shadow-xs select-none">
                            <tr className="text-[10px] font-black uppercase tracking-wider border-b border-slate-800 bg-slate-900">
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[70px] bg-slate-900 sticky top-0">Loom #</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 min-w-[170px] bg-slate-900 sticky top-0">Loom Operator Name</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[80px] bg-slate-900 sticky top-0">Mesh</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Meters</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 min-w-[125px] bg-slate-900 sticky top-0">Quality</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[85px] bg-slate-900 sticky top-0">Size</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[75px] bg-slate-900 sticky top-0">GSM</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[80px] bg-slate-900 sticky top-0">Denier</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Avg Wt (g)</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[85px] bg-slate-900 sticky top-0">Roll No</th>
                              
                              {/* WARP HEADER */}
                              <th colSpan={2} className="py-2 px-2 border-r border-b border-slate-800 bg-amber-950/80 text-amber-200 text-center font-black">
                                WARP
                              </th>
                              
                              {/* WEFT HEADER */}
                              <th colSpan={2} className="py-2 px-2 border-r border-b border-slate-800 bg-amber-950/80 text-amber-200 text-center font-black">
                                WEFT
                              </th>
                              
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[95px] bg-slate-900 sticky top-0">Roll Meters</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[85px] bg-slate-900 sticky top-0">Gr Wt (kg)</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[80px] bg-slate-900 sticky top-0">Cr Wt (kg)</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[85px] bg-slate-900 sticky top-0">Net Wt (kg)</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[110px] bg-slate-900 sticky top-0">Avg Wt [Calc] (g)</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[90px] bg-slate-900 sticky top-0">GSM [Calc]</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[115px] bg-slate-900 sticky top-0">Status</th>
                              <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-800 text-center min-w-[140px] bg-slate-900 sticky top-0">Remarks</th>
                              <th rowSpan={2} className="py-2.5 px-3 text-center min-w-[50px] bg-slate-900 sticky top-0">Delete</th>
                            </tr>
                            <tr className="bg-slate-900 text-slate-100 text-[9px] font-black uppercase tracking-wider border-b border-slate-800">
                              <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Strength (kgs)</th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Elongation (%)</th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Strength (kgs)</th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-800 bg-amber-950/60 text-amber-200 min-w-[85px]">Elongation (%)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-xs font-bold text-slate-700">
                            {previewRows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                {/* 1. Loom No */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-16">
                                  <input
                                    type="text"
                                    value={row.loomNo}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'loomNo', e.target.value)}
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 font-black focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                {/* 2. Loom Opr */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-44">
                                  <OperatorSelect
                                    value={row.operatorName || ''}
                                    onChange={(val) => handleUpdatePreviewCell(idx, 'operatorName', val)}
                                    employees={employees}
                                  />
                                </td>
                                {/* 3. Mesh */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.mesh || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'mesh', e.target.value)}
                                    placeholder="Mesh"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                {/* 4. Meters */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-24 text-center">
                                  <input
                                    type="text"
                                    value={row.totalMeters === 0 || row.totalMeters === '' || row.totalMeters === undefined || row.totalMeters === null ? '' : row.totalMeters}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'totalMeters', e.target.value)}
                                    placeholder="Meters"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-emerald-700 focus:outline-none focus:bg-white font-mono text-center font-black"
                                  />
                                </td>
                                {/* 5. Quality */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150">
                                  <input
                                    type="text"
                                    value={row.quality || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'quality', e.target.value)}
                                    placeholder="Quality"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white"
                                  />
                                </td>
                                {/* 6. Size */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.size || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'size', e.target.value)}
                                    placeholder="Size"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center"
                                  />
                                </td>
                                {/* 7. GSM */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-16 text-center">
                                  <input
                                    type="text"
                                    value={row.gsm === 0 || row.gsm === '' || row.gsm === undefined || row.gsm === null ? '' : row.gsm}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'gsm', e.target.value)}
                                    placeholder="GSM"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 8. DENIER */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.denier === 0 || row.denier === '' || row.denier === undefined || row.denier === null ? '' : row.denier}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'denier', e.target.value)}
                                    placeholder="Denier"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 9. AVG WT (g) */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.average === 0 || row.average === '' || row.average === undefined || row.average === null ? '' : row.average}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'average', e.target.value)}
                                    placeholder="Avg Wt"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 10. ROLL NO */}
                                {(() => {
                                  const trimmed = (row.rollNo || '').trim().toUpperCase();
                                  const existingMatch = trimmed ? existingMasterRollsMap.get(trimmed) : null;
                                  return (
                                    <td className={`py-1.5 px-2.5 border-r border-slate-150 w-24 text-center relative transition-colors ${existingMatch ? 'bg-amber-100/90' : ''}`}>
                                      <input
                                        type="text"
                                        value={row.rollNo || ''}
                                        onChange={(e) => handleUpdatePreviewCell(idx, 'rollNo', e.target.value)}
                                        placeholder="Roll #"
                                        className={`w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs font-mono text-center font-bold focus:outline-none focus:bg-white ${existingMatch ? 'text-amber-950' : 'text-slate-855'}`}
                                      />
                                      {existingMatch && (
                                        <div className="text-[9px] font-black text-amber-900 bg-amber-200/90 rounded px-1 py-0.5 mt-0.5 leading-tight truncate border border-amber-300" title={`Already in Master Roll Directory under Order #${existingMatch.orderNo} (${existingMatch.orderDate})`}>
                                          ⚠️ In Master Dir
                                        </div>
                                      )}
                                    </td>
                                  );
                                })()}
                                {/* 11. WARP Strength */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center bg-amber-50/20">
                                  <input
                                    type="text"
                                    value={row.warpStrength || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'warpStrength', e.target.value)}
                                    placeholder="Warp Str"
                                    className="w-full bg-transparent border-b border-transparent focus:border-amber-500 px-1 py-0.5 text-xs text-amber-950 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* WARP Elongation */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center bg-amber-50/20">
                                  <input
                                    type="text"
                                    value={row.warpElongation || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'warpElongation', e.target.value)}
                                    placeholder="Warp Elong"
                                    className="w-full bg-transparent border-b border-transparent focus:border-amber-500 px-1 py-0.5 text-xs text-amber-950 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 12. WEFT Strength */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center bg-amber-50/20">
                                  <input
                                    type="text"
                                    value={row.weftStrength || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'weftStrength', e.target.value)}
                                    placeholder="Weft Str"
                                    className="w-full bg-transparent border-b border-transparent focus:border-amber-500 px-1 py-0.5 text-xs text-amber-950 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* WEFT Elongation */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center bg-amber-50/20">
                                  <input
                                    type="text"
                                    value={row.weftElongation || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'weftElongation', e.target.value)}
                                    placeholder="Weft Elong"
                                    className="w-full bg-transparent border-b border-transparent focus:border-amber-500 px-1 py-0.5 text-xs text-amber-950 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 13. ROLL METERS */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.rollMeters === 0 || row.rollMeters === '' || row.rollMeters === undefined || row.rollMeters === null ? '' : row.rollMeters}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'rollMeters', e.target.value)}
                                    placeholder="Roll Mtr"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center font-bold"
                                  />
                                </td>
                                {/* 14. GR WT (kg) */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.grossWt === 0 || row.grossWt === '' || row.grossWt === undefined || row.grossWt === null ? '' : row.grossWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'grossWt', e.target.value)}
                                    placeholder="Gross"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center font-bold"
                                  />
                                </td>
                                {/* 15. CR WT (kg) */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.coreWt === 0 || row.coreWt === '' || row.coreWt === undefined || row.coreWt === null ? '' : row.coreWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'coreWt', e.target.value)}
                                    placeholder="Core"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-855 focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 16. NET WT (kg) */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.netWt === 0 || row.netWt === '' || row.netWt === undefined || row.netWt === null ? '' : row.netWt}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'netWt', e.target.value)}
                                    placeholder="Net"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-indigo-700 font-bold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 17. AVG WT [CALC] (g) */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-24 text-center">
                                  <input
                                    type="text"
                                    value={row.avgWtCalculated === 0 || row.avgWtCalculated === '' || row.avgWtCalculated === undefined || row.avgWtCalculated === null ? '' : row.avgWtCalculated}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'avgWtCalculated', e.target.value)}
                                    placeholder="Avg Calc"
                                    className="w-full bg-transparent border-b border-transparent focus:border-emerald-500 px-1 py-0.5 text-xs text-emerald-700 font-extrabold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 18. GSM [CALC] */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-20 text-center">
                                  <input
                                    type="text"
                                    value={row.gsmCalculated === 0 || row.gsmCalculated === '' || row.gsmCalculated === undefined || row.gsmCalculated === null ? '' : row.gsmCalculated}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'gsmCalculated', e.target.value)}
                                    placeholder="GSM Calc"
                                    className="w-full bg-transparent border-b border-transparent focus:border-purple-500 px-1 py-0.5 text-xs text-purple-700 font-extrabold focus:outline-none focus:bg-white font-mono text-center"
                                  />
                                </td>
                                {/* 19. RUNNING STATUS */}
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
                                {/* Remarks */}
                                <td className="py-1.5 px-2.5 border-r border-slate-150 w-40 text-center">
                                  <input
                                    type="text"
                                    value={row.remarks || ''}
                                    onChange={(e) => handleUpdatePreviewCell(idx, 'remarks', e.target.value)}
                                    placeholder="Remarks (if any)"
                                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-400 px-1 py-0.5 text-xs text-slate-850 focus:outline-none focus:bg-white text-center font-semibold"
                                  />
                                </td>
                                {/* Delete */}
                                <td className="py-1.5 px-2.5 text-center w-12">
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePreviewRow(idx)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="Delete row"
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

      {/* 📊 WINDOW 1: SUMMARY SELECTION MENU MODAL */}
      {showSummaryMenuModal && !selectedSummaryType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in" id="summary-menu-modal-overlay">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100 shadow-2xs">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-wide">
                    View Summary Reports
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Select a summary category below to inspect aggregated loom statistics
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSummaryMenuModal(false)}
                className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body: Summary Category Buttons */}
            <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 gap-3.5">
                {/* Button 1: Number of looms running */}
                <button
                  type="button"
                  onClick={() => setSelectedSummaryType('looms_running')}
                  className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-indigo-200 hover:border-indigo-600 bg-indigo-50/40 hover:bg-indigo-50 transition-all cursor-pointer shadow-xs hover:shadow-md group flex items-center justify-between gap-4"
                  id="btn-summary-looms-running"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <Activity size={20} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-indigo-900">
                          Number of looms running
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                          Available Report
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        View aggregated metrics of running vs. stopped looms grouped by Quality, Size, and GSM with totals.
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-indigo-600 group-hover:translate-x-1 transition-transform">
                    <ChevronRight size={20} />
                  </div>
                </button>

                {/* Button 2: Loom Operator Summary */}
                <button
                  type="button"
                  onClick={() => setSelectedSummaryType('operator_summary')}
                  className="w-full text-left p-4 sm:p-5 rounded-2xl border-2 border-indigo-200 hover:border-indigo-600 bg-indigo-50/40 hover:bg-indigo-50 transition-all cursor-pointer shadow-xs hover:shadow-md group flex items-center justify-between gap-4"
                  id="btn-summary-loom-operator"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <Users size={20} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-extrabold text-slate-900 group-hover:text-indigo-900">
                          Loom Operator Summary
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                          Available Report
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        View operator ledger with individual meters (e.g. 1200 + 1350 + 1100), total meters sum, and shift averages.
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-indigo-600 group-hover:translate-x-1 transition-transform">
                    <ChevronRight size={20} />
                  </div>
                </button>

                {/* Additional Summary Modules placeholder cards */}
                <div className="p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 opacity-60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                      <Cpu size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Production Efficiency Summary</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Future module • Coming soon</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold uppercase">Locked</span>
                </div>

                <div className="p-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 opacity-60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                      <Flame size={18} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Quality &amp; Wastage Analysis</span>
                      <span className="text-[10px] text-slate-400 font-semibold">Future module • Coming soon</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold uppercase">Locked</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-150 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSummaryMenuModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 WINDOW 2: SUMMARY DETAIL MODAL ("NUMBER OF LOOMS RUNNING") */}
      {showSummaryMenuModal && selectedSummaryType === 'looms_running' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 z-50 animate-fade-in" id="summary-detail-modal-overlay">
          <div className="bg-white rounded-3xl w-full max-w-5xl 2xl:max-w-6xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-150 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedSummaryType(null)}
                  className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 flex items-center gap-1 transition-all cursor-pointer text-xs font-extrabold shrink-0 active:scale-95 shadow-2xs"
                  title="Back to summary categories"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">Back</span>
                </button>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100 shadow-2xs">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                    Number of Looms Running Summary
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                    Summarized by Quality, Size &amp; GSM
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedSummaryType(null);
                  setShowSummaryMenuModal(false);
                }}
                className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Control Toolbar (Date Filter Range/Single, Shift Selector, Export Excel) */}
            <div className="p-4 bg-indigo-50/40 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                {/* Filter Mode Selector */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setSumFilterMode('single')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      sumFilterMode === 'single'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setSumFilterMode('range')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      sumFilterMode === 'range'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Date Range
                  </button>
                </div>

                {/* Date Picker Inputs */}
                {sumFilterMode === 'single' ? (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                    <CalendarIcon size={14} className="text-indigo-500 shrink-0" />
                    <input
                      type="date"
                      value={sumSingleDate}
                      onChange={(e) => setSumSingleDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                    <CalendarIcon size={14} className="text-indigo-500 shrink-0" />
                    <input
                      type="date"
                      value={sumRangeStartDate}
                      onChange={(e) => setSumRangeStartDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                    <span className="text-slate-400 font-bold text-xs">to</span>
                    <input
                      type="date"
                      value={sumRangeEndDate}
                      onChange={(e) => setSumRangeEndDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                )}

                {/* Shift Filter Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-slate-400">Shift:</span>
                  <select
                    value={sumFilterShift}
                    onChange={(e) => setSumFilterShift(e.target.value as 'ALL' | 'DAY' | 'NIGHT')}
                    className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">✨ All Shifts</option>
                    <option value="DAY">☀️ Day Shift</option>
                    <option value="NIGHT">🌙 Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Export Excel Button */}
              <button
                type="button"
                onClick={handleExportSummaryExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/20 active:scale-95 shrink-0"
                id="btn-export-summary-excel"
              >
                <FileSpreadsheet size={15} />
                Export Excel
              </button>
            </div>

            {/* KPI Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Looms Tracked</span>
                <span className="font-black text-slate-900 text-sm">{modalTotals.totalLooms} Looms</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">
                  {modalTotals.runningCount} Running / {modalTotals.stoppedCount} Stopped
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Total Meters Woven</span>
                <span className="font-black text-emerald-700 text-sm font-mono">{modalTotals.totalMeters.toLocaleString()} m</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">
                  Filtered Period Total
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Total Gross Weight</span>
                <span className="font-black text-slate-800 text-sm font-mono">{modalTotals.totalGrossWt.toFixed(2)} kg</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">Combined Fabric + Core</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Total Net Weight</span>
                <span className="font-black text-indigo-700 text-sm font-mono">{modalTotals.totalNetWt.toFixed(2)} kg</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">Avg Calc: {modalTotals.avgCalc} kg/m</span>
              </div>
            </div>

            {/* Content / Scrollable area */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {modalSummaryData.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold uppercase tracking-wider text-xs">
                  No active running loom entries found for this period and shift filter.
                </div>
              ) : (
                <>
                  {/* Desktop View Table */}
                  <div className="hidden sm:block border border-slate-150 rounded-2xl overflow-x-auto overflow-y-auto max-h-[480px] shadow-xs relative">
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
                        {modalSummaryData.map((item, idx) => (
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
                      <tfoot className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 font-extrabold text-xs text-slate-900">
                        <tr>
                          <td className="px-3.5 py-3 whitespace-nowrap">TOTALS</td>
                          <td className="px-3.5 py-3 whitespace-nowrap">-</td>
                          <td className="px-3.5 py-3 whitespace-nowrap">-</td>
                          <td className="px-3.5 py-3 text-right font-mono font-black text-emerald-800 whitespace-nowrap">
                            {modalTotals.totalMeters.toLocaleString()} m
                          </td>
                          <td className="px-3.5 py-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {modalTotals.totalGrossWt.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-3 text-right font-mono font-black text-indigo-900 whitespace-nowrap">
                            {modalTotals.totalNetWt.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-3 text-right font-mono font-black text-emerald-800 whitespace-nowrap">
                            {modalTotals.avgCalc}
                          </td>
                          <td className="px-3.5 py-3 text-center whitespace-nowrap text-emerald-700">
                            {modalTotals.runningCount} Running
                          </td>
                          <td className="px-3.5 py-3 text-center whitespace-nowrap text-rose-700">
                            {modalTotals.stoppedCount} Stopped
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile View Card List */}
                  <div className="block sm:hidden space-y-3">
                    {modalSummaryData.map((item, idx) => (
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
            <div className="p-4 sm:p-5 border-t border-slate-150 bg-slate-50 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setSelectedSummaryType(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer border border-slate-200 flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                Back to Summaries
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSummaryType(null);
                  setShowSummaryMenuModal(false);
                }}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 WINDOW 3: SUMMARY DETAIL MODAL ("LOOM OPERATOR SUMMARY") */}
      {showSummaryMenuModal && selectedSummaryType === 'operator_summary' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 z-50 animate-fade-in" id="summary-operator-modal-overlay">
          <div className="bg-white rounded-3xl w-full max-w-5xl 2xl:max-w-6xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-150 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedSummaryType(null)}
                  className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 flex items-center gap-1 transition-all cursor-pointer text-xs font-extrabold shrink-0 active:scale-95 shadow-2xs"
                  title="Back to summary categories"
                >
                  <ChevronLeft size={16} />
                  <span className="hidden sm:inline">Back</span>
                </button>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100 shadow-2xs">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                    Loom Operator Summary
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                    Operator-wise Loom Meter Breakdown, Totals &amp; Averages
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedSummaryType(null);
                  setShowSummaryMenuModal(false);
                }}
                className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Control Toolbar (Filter Mode, Dates, Shift Selector, Operator Dropdown, Export Excel) */}
            <div className="p-4 bg-indigo-50/40 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                {/* Filter Mode Selector */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setSumFilterMode('single')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      sumFilterMode === 'single'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setSumFilterMode('range')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      sumFilterMode === 'range'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Date Range
                  </button>
                </div>

                {/* Date Picker Inputs */}
                {sumFilterMode === 'single' ? (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                    <CalendarIcon size={14} className="text-indigo-500 shrink-0" />
                    <input
                      type="date"
                      value={sumSingleDate}
                      onChange={(e) => setSumSingleDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                    <CalendarIcon size={14} className="text-indigo-500 shrink-0" />
                    <input
                      type="date"
                      value={sumRangeStartDate}
                      onChange={(e) => setSumRangeStartDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                    <span className="text-slate-400 font-bold text-xs">to</span>
                    <input
                      type="date"
                      value={sumRangeEndDate}
                      onChange={(e) => setSumRangeEndDate(e.target.value)}
                      className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                    />
                  </div>
                )}

                {/* Shift Filter Dropdown */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-slate-400">Shift:</span>
                  <select
                    value={sumFilterShift}
                    onChange={(e) => setSumFilterShift(e.target.value as 'ALL' | 'DAY' | 'NIGHT')}
                    className="text-xs font-black text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">✨ All Shifts</option>
                    <option value="DAY">☀️ Day Shift</option>
                    <option value="NIGHT">🌙 Night Shift</option>
                  </select>
                </div>

                {/* Operator Dropdown Selector */}
                <div className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-xl px-2.5 py-1 shadow-2xs ring-2 ring-indigo-500/10">
                  <Users size={14} className="text-indigo-600 shrink-0" />
                  <span className="text-[10px] font-black uppercase text-indigo-500">Operator:</span>
                  <select
                    value={sumSelectedOperator}
                    onChange={(e) => setSumSelectedOperator(e.target.value)}
                    className="text-xs font-black text-slate-900 bg-transparent focus:outline-none cursor-pointer max-w-[180px] truncate"
                    id="select-summary-operator"
                  >
                    <option value="ALL">✨ All Operators</option>
                    {availableOperatorNames.map((opName) => (
                      <option key={opName} value={opName}>
                        👤 {opName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Export Excel Button */}
              <button
                type="button"
                onClick={handleExportOperatorSummaryExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs tracking-wider uppercase transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/20 active:scale-95 shrink-0"
                id="btn-export-operator-summary-excel"
              >
                <FileSpreadsheet size={15} />
                Export Excel
              </button>
            </div>

            {/* KPI Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Selected Operator</span>
                <span className="font-black text-indigo-900 text-sm truncate block">
                  {sumSelectedOperator === 'ALL' ? '✨ All Operators' : sumSelectedOperator}
                </span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">
                  {modalOperatorTotals.totalEntries} Ledger Record(s)
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Total Meters Woven</span>
                <span className="font-black text-emerald-700 text-sm font-mono">{modalOperatorTotals.totalMeters.toLocaleString()} m</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">
                  Combined Sum
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Total Looms Run</span>
                <span className="font-black text-slate-900 text-sm font-mono">{modalOperatorTotals.totalLooms} Looms</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">Logged Loom Operations</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-0.5">Overall Avg Meters</span>
                <span className="font-black text-indigo-700 text-sm font-mono">{modalOperatorTotals.overallAvg.toLocaleString()} m/loom</span>
                <span className="text-[10px] text-slate-500 block font-semibold mt-0.5">Average per Loom</span>
              </div>
            </div>

            {/* Content / Scrollable Ledger Area */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {modalOperatorLedger.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold uppercase tracking-wider text-xs">
                  No loom running records found for the selected operator and filter criteria.
                </div>
              ) : (
                <>
                  {/* Desktop View Ledger Table */}
                  <div className="hidden sm:block border border-slate-150 rounded-2xl overflow-x-auto overflow-y-auto max-h-[480px] shadow-xs relative">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                      <thead className="sticky top-0 z-10 bg-slate-50 shadow-2xs">
                        <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <th className="px-4 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">Date</th>
                          <th className="px-3.5 py-3.5 text-center whitespace-nowrap bg-slate-50 sticky top-0">Shift</th>
                          <th className="px-4 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">Operator Name</th>
                          <th className="px-4 py-3.5 whitespace-nowrap bg-slate-50 sticky top-0">Loom Operation Meters (Individual)</th>
                          <th className="px-4 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Total Sum (m)</th>
                          <th className="px-4 py-3.5 text-right whitespace-nowrap bg-slate-50 sticky top-0">Average Meters (m)</th>
                          <th className="px-3.5 py-3.5 text-center whitespace-nowrap bg-slate-50 sticky top-0">Looms Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalOperatorLedger.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs font-bold text-slate-700">
                            <td className="px-4 py-3.5 font-extrabold text-slate-800 whitespace-nowrap">
                              {formatDateLabel(item.date)}
                            </td>
                            <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                item.shift === 'DAY'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              }`}>
                                {item.shift === 'DAY' ? '☀️ DAY' : '🌙 NIGHT'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-extrabold text-slate-900 whitespace-nowrap">
                              {item.operatorName}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-slate-800 whitespace-nowrap">
                              <span className="inline-block bg-indigo-50/70 text-indigo-900 border border-indigo-150 rounded-lg px-2.5 py-1 font-mono font-black text-xs tracking-tight shadow-2xs">
                                {item.individualFormula}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap text-sm">
                              {item.totalMeters.toLocaleString()} m
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono font-black text-indigo-700 whitespace-nowrap text-sm">
                              {item.averageMeters.toLocaleString()} m
                            </td>
                            <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full font-black text-xs">
                                {item.loomCount} {item.loomCount === 1 ? 'Loom' : 'Looms'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 font-extrabold text-xs text-slate-900">
                        <tr>
                          <td className="px-4 py-3.5 whitespace-nowrap font-black">TOTALS</td>
                          <td className="px-3.5 py-3.5 text-center whitespace-nowrap">-</td>
                          <td className="px-4 py-3.5 whitespace-nowrap">-</td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 font-semibold text-[11px]">
                            {modalOperatorTotals.totalEntries} Shift Group(s)
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-800 text-sm whitespace-nowrap">
                            {modalOperatorTotals.totalMeters.toLocaleString()} m
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-black text-indigo-900 text-sm whitespace-nowrap">
                            {modalOperatorTotals.overallAvg.toLocaleString()} m
                          </td>
                          <td className="px-3.5 py-3.5 text-center whitespace-nowrap text-slate-800 font-black">
                            {modalOperatorTotals.totalLooms} Looms
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile View Card List */}
                  <div className="block sm:hidden space-y-3">
                    {modalOperatorLedger.map((item, idx) => (
                      <div key={idx} className="bg-slate-50/50 border border-slate-150 rounded-2xl p-4 space-y-3 shadow-2xs">
                        <div className="flex justify-between items-center gap-2 border-b border-slate-150 pb-2.5">
                          <div>
                            <span className="text-xs font-black text-slate-900 block">{item.operatorName}</span>
                            <span className="text-[10px] text-slate-500 font-bold block">{formatDateLabel(item.date)}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            item.shift === 'DAY'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}>
                            {item.shift === 'DAY' ? '☀️ DAY' : '🌙 NIGHT'}
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block mb-0.5">Individual Meter Readings</span>
                            <span className="inline-block bg-indigo-50/80 text-indigo-900 border border-indigo-200 rounded-lg px-2.5 py-1 font-mono font-black text-xs">
                              {item.individualFormula}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-150">
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Total Sum</span>
                              <span className="text-xs font-black text-emerald-700 font-mono">{item.totalMeters.toLocaleString()} m</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Average</span>
                              <span className="text-xs font-black text-indigo-700 font-mono">{item.averageMeters.toLocaleString()} m</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block leading-none mb-1">Looms</span>
                              <span className="text-xs font-bold text-slate-800 font-mono">{item.loomCount} Run</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-150 bg-slate-50 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setSelectedSummaryType(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer border border-slate-200 flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                Back to Summaries
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSummaryType(null);
                  setShowSummaryMenuModal(false);
                }}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer"
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
