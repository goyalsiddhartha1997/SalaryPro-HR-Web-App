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
  Package,
  Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { formatDateDDMMMYYYY } from '../utils/dateUtils';
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
  const [remarksVal, setRemarksVal] = useState<string>('');
  const [operatorsVal, setOperatorsVal] = useState<string>('0');
  const [windermenVal, setWindermenVal] = useState<string>('0');
  const [helpersVal, setHelpersVal] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shiftVal, setShiftVal] = useState<'day' | 'night'>('day');
  const [editingRecord, setEditingRecord] = useState<TapePlantProductionReport | null>(null);

  // --- STATE FOR FILTERS ---
  const [filterMode, setFilterMode] = useState<'month' | 'range' | 'all'>('month');
  const [filterShift, setFilterShift] = useState<'all' | 'day' | 'night'>('all');
  
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
        const dateA = a.date || '';
        const dateB = b.date || '';
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        const shiftA = a.shift || '';
        const shiftB = b.shift || '';
        return shiftB.localeCompare(shiftA);
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

      const catUpper = (category || '').toUpperCase();
      const nameUpper = (itemName || '').toUpperCase();

      if (
        catUpper.includes('PP') ||
        catUpper.includes('POLYPROPYLENE') ||
        nameUpper.includes('PP ') ||
        nameUpper === 'PP' ||
        nameUpper.startsWith('PP-') ||
        nameUpper.startsWith('PP_')
      ) {
        ppSum += qty;
      } else if (
        catUpper.includes('FILLER') ||
        catUpper.includes('CALCIUM') ||
        catUpper.includes('CC') ||
        nameUpper.includes('CALCIUM') ||
        nameUpper.includes('FILLER') ||
        nameUpper.includes('CC') ||
        nameUpper === 'CC' ||
        nameUpper.startsWith('CC ') ||
        nameUpper.startsWith('CC-')
      ) {
        ccSum += qty;
      } else if (
        catUpper.includes('LDPE') ||
        catUpper.includes('LD') ||
        nameUpper.includes('LDPE') ||
        nameUpper.includes('LD') ||
        nameUpper === 'LD'
      ) {
        ldSum += qty;
      } else if (
        catUpper.includes('TPT') ||
        nameUpper.includes('TPT')
      ) {
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

  // Helper to check if a date is past the 10:00 AM cutoff on the next day
  const isPast10AmCutoff = (dateStr: string): boolean => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return true;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return true;

    // Cutoff is 10:00 AM local time on the day AFTER dateStr
    const deadline = new Date(year, month - 1, day + 1, 10, 0, 0, 0);
    const now = new Date();
    return now >= deadline;
  };

  // Run the automatic ledger synchronization
  useEffect(() => {
    if (loadingReports || loadingMaterials || viewOnly || isSyncing) return;

    const syncMissingOrChangedLedgers = async () => {
      setIsSyncing(true);
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const dateSet = new Set<string>();

        // Include dates from start limit to today
        const current = new Date("2026-07-01");
        const todayObj = new Date(todayStr);
        while (current <= todayObj) {
          dateSet.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }

        // Include any dates that have raw material usage logs
        rawMaterials.forEach(item => {
          if (item.logs) {
            item.logs.forEach(log => {
              if (log.type === 'use_stock' && log.date) {
                dateSet.add(log.date);
              }
            });
          }
        });

        // Include any dates present in existing production reports
        reports.forEach(r => {
          if (r.date) {
            dateSet.add(r.date);
          }
        });

        const datesToSync = Array.from(dateSet).sort();
        const reportMap = new Map<string, TapePlantProductionReport>();
        reports.forEach(r => {
          reportMap.set(r.id, r);
        });

        let updatedCount = 0;

        for (const date of datesToSync) {
          for (const shift of ['day', 'night'] as const) {
            const docId = `${date}-${shift}`;
            const existing = reportMap.get(docId);
            const isManualOverride = existing?.isAutoGenerated === false;
            
            // Calculate the current calculated state based on raw material logs
            const calculated = calculateMaterialsForShift(date, shift);

            if (!calculated.isStopped) {
              // Raw material HAS been logged for this shift
              if (isManualOverride) {
                // If user previously manually marked it as plant stopped, but raw material was newly deducted, update to running
                if (existing.isStopped) {
                  const payload: TapePlantProductionReport = {
                    ...existing,
                    isStopped: false,
                    usage: calculated.usageText,
                    wastage: calculated.totalWastage,
                  };
                  await setDoc(doc(db, 'tapePlantProductions', docId), payload);
                  updatedCount++;
                }
                // Otherwise, preserve user's manual override for usage, wastage, manpower, remarks
              } else {
                // Auto-generated or missing record
                const payload: TapePlantProductionReport = {
                  id: docId,
                  date,
                  shift,
                  usage: calculated.usageText,
                  wastage: calculated.totalWastage,
                  isStopped: false,
                  isAutoGenerated: true,
                  remarks: existing?.remarks || '',
                  createdAt: existing?.createdAt || new Date().toISOString(),
                  operatorsCount: existing?.operatorsCount ?? 0,
                  windermenCount: existing?.windermenCount ?? 0,
                  helpersCount: existing?.helpersCount ?? 0,
                };

                const isDiff = !existing || 
                  existing.usage !== calculated.usageText || 
                  existing.wastage !== calculated.totalWastage || 
                  existing.isStopped !== false;

                if (isDiff) {
                  await setDoc(doc(db, 'tapePlantProductions', docId), payload);
                  updatedCount++;
                }
              }
            } else {
              // NO raw material usage logged for this shift
              const pastCutoff = isPast10AmCutoff(date);

              if (pastCutoff) {
                // Only auto-create or keep Plant Stopped entry if past 10:00 AM on the day after date
                if (isManualOverride) {
                  // User manually set this entry -> preserve user's manual override
                  continue;
                }

                const payload: TapePlantProductionReport = {
                  id: docId,
                  date,
                  shift,
                  usage: calculated.usageText,
                  wastage: 0,
                  isStopped: true,
                  isAutoGenerated: true,
                  remarks: existing?.remarks || '',
                  createdAt: existing?.createdAt || new Date().toISOString(),
                  operatorsCount: existing?.operatorsCount ?? 0,
                  windermenCount: existing?.windermenCount ?? 0,
                  helpersCount: existing?.helpersCount ?? 0,
                };

                const isDiff = !existing ||
                  existing.usage !== calculated.usageText ||
                  existing.isStopped !== true;

                if (isDiff) {
                  await setDoc(doc(db, 'tapePlantProductions', docId), payload);
                  updatedCount++;
                }
              } else {
                // NOT past 10:00 AM on the next day yet.
                if (isManualOverride) {
                  // Manual override exists -> preserve user's manual entry
                  continue;
                }

                // If premature auto-generated entry exists, clean it up from Firestore
                if (existing) {
                  await deleteDoc(doc(db, 'tapePlantProductions', docId));
                  updatedCount++;
                }
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
    setRemarksVal('');
    setOperatorsVal('0');
    setWindermenVal('0');
    setHelpersVal('0');
    setEditingRecord(null);
  };

  const handleEditClick = (r: TapePlantProductionReport) => {
    setEditingRecord(r);
    setEntryDate(r.date);
    setIsStopped(r.isStopped);
    setShiftVal(r.shift);
    setUsageVal(r.isStopped ? '' : r.usage);
    setWastageVal(r.wastage ? String(r.wastage) : '');
    setRemarksVal(r.remarks || '');
    setOperatorsVal(r.operatorsCount !== undefined ? String(r.operatorsCount) : '0');
    setWindermenVal(r.windermenCount !== undefined ? String(r.windermenCount) : '0');
    setHelpersVal(r.helpersCount !== undefined ? String(r.helpersCount) : '0');
    setShowAddModal(true);
  };

  const formatManpower = (report: TapePlantProductionReport) => {
    const ops = report.operatorsCount || 0;
    const winders = report.windermenCount || 0;
    const helpers = report.helpersCount || 0;
    if (ops === 0 && winders === 0 && helpers === 0) {
      return '0 Ops, 0 Windermen, 0 Helpers';
    }
    return `${ops} Ops, ${winders} Windermen, ${helpers} Helpers`;
  };

  const formatDateLabel = (dateStr?: string) => {
    return formatDateDDMMMYYYY(dateStr);
  };

  // --- FILTERED REPORTS DATA ---
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (!r || !r.date) return false;

      // Date filtering
      let dateMatch = true;
      if (filterMode === 'month') {
        const parts = r.date.split('-'); // [YYYY, MM, DD]
        if (parts.length === 3) {
          const rYear = parseInt(parts[0], 10);
          const rMonth = parseInt(parts[1], 10);
          dateMatch = rYear === selectedYear && rMonth === selectedMonth;
        } else {
          dateMatch = false;
        }
      } else if (filterMode === 'range') {
        const start = rangeStartDate || '0000-00-00';
        const end = rangeEndDate || '9999-99-99';
        dateMatch = r.date >= start && r.date <= end;
      }

      if (!dateMatch) return false;

      // Shift filtering
      if (filterShift !== 'all') {
        return (r.shift || 'day').toLowerCase() === filterShift.toLowerCase();
      }

      return true;
    }).sort((a, b) => {
      // Sorted chronologically ascending for the ledger report
      const dateA = a.date || '';
      const dateB = b.date || '';
      const dateComp = dateA.localeCompare(dateB);
      if (dateComp !== 0) return dateComp;
      const shiftA = a.shift || '';
      const shiftB = b.shift || '';
      return shiftA.localeCompare(shiftB);
    });
  }, [reports, filterMode, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, filterShift]);

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

  // --- RAW MATERIALS CONSUMPTION BREAKDOWN FOR SELECTED DATE RANGE ---
  const materialSummary = useMemo(() => {
    let ppTotal = 0;
    let ccTotal = 0;
    let ldTotal = 0;
    let tptTotal = 0;
    const othersMap: Record<string, number> = {};

    filteredReports.forEach(r => {
      if (r.isStopped || !r.usage) return;
      const usageStr = r.usage.trim();
      if (
        usageStr.toLowerCase().includes('plant stopped') || 
        usageStr.toLowerCase().includes('no usage logged')
      ) return;

      // Split chunks by comma, semicolon or newline
      const items = usageStr.split(/[,;\n]+/);

      items.forEach(item => {
        const trimmed = item.trim();
        if (!trimmed) return;

        let name = '';
        let qtyNum = 0;

        if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          name = parts[0].trim();
          const qtyMatch = parts[1].match(/([\d\.]+)/);
          if (qtyMatch) {
            qtyNum = parseFloat(qtyMatch[1]);
          }
        } else if (trimmed.includes('-')) {
          const parts = trimmed.split('-');
          name = parts[0].trim();
          const qtyMatch = parts[1].match(/([\d\.]+)/);
          if (qtyMatch) {
            qtyNum = parseFloat(qtyMatch[1]);
          }
        } else {
          const numMatch = trimmed.match(/([\d\.]+)/);
          if (numMatch) {
            qtyNum = parseFloat(numMatch[1]);
            name = trimmed.replace(/[\d\.]+/g, '').replace(/kg|kgs|ton|tons|g/gi, '').trim();
          }
        }

        if (isNaN(qtyNum) || qtyNum <= 0) return;

        const normName = name.toUpperCase();

        if (normName === 'PP' || normName.includes('POLYPROPYLENE') || normName.startsWith('PP ')) {
          ppTotal += qtyNum;
        } else if (normName === 'CC' || normName.includes('FILLER') || normName.includes('CALCIUM') || normName.startsWith('CC ')) {
          ccTotal += qtyNum;
        } else if (normName === 'LD' || normName.includes('LDPE') || normName.startsWith('LD ')) {
          ldTotal += qtyNum;
        } else if (normName === 'TPT' || normName.startsWith('TPT ')) {
          tptTotal += qtyNum;
        } else {
          const cleanKey = name || 'Other Material';
          othersMap[cleanKey] = (othersMap[cleanKey] || 0) + qtyNum;
        }
      });
    });

    const sumOthers = Object.values(othersMap).reduce((a, b) => a + b, 0);
    const totalAll = ppTotal + ccTotal + ldTotal + tptTotal + sumOthers;

    return {
      pp: parseFloat(ppTotal.toFixed(2)),
      cc: parseFloat(ccTotal.toFixed(2)),
      ld: parseFloat(ldTotal.toFixed(2)),
      tpt: parseFloat(tptTotal.toFixed(2)),
      others: othersMap,
      totalAll: parseFloat(totalAll.toFixed(2))
    };
  }, [filteredReports]);

  // Dynamic label for the currently active date filter
  const selectedDateRangeLabel = useMemo(() => {
    let dateText = '';
    if (filterMode === 'month') {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      dateText = `${months[selectedMonth - 1] || ''} ${selectedYear}`;
    } else if (filterMode === 'range') {
      dateText = `${formatDateLabel(rangeStartDate)} to ${formatDateLabel(rangeEndDate)}`;
    } else {
      dateText = 'All Dates';
    }

    let shiftText = '';
    if (filterShift === 'day') shiftText = ' (Day Shift)';
    if (filterShift === 'night') shiftText = ' (Night Shift)';

    return `${dateText}${shiftText}`;
  }, [filterMode, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, filterShift]);

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
        operatorsCount: parseInt(operatorsVal, 10) || 0,
        windermenCount: parseInt(windermenVal, 10) || 0,
        helpersCount: parseInt(helpersVal, 10) || 0,
        isAutoGenerated: false, // Mark as manually overridden/saved
        remarks: remarksVal || '',
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
  const handleExportToExcel = async () => {
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

      // Calculate material consumption for export range
      let ppTotal = 0;
      let ccTotal = 0;
      let ldTotal = 0;
      let tptTotal = 0;
      const othersMap: Record<string, number> = {};
      let sumWastage = 0;
      let activeShifts = 0;
      let stoppedShifts = 0;

      exportData.forEach(r => {
        if (r.isStopped) {
          stoppedShifts++;
          return;
        }
        activeShifts++;
        sumWastage += r.wastage || 0;

        if (r.usage) {
          const usageStr = r.usage.trim();
          if (
            !usageStr.toLowerCase().includes('plant stopped') &&
            !usageStr.toLowerCase().includes('no usage logged')
          ) {
            const items = usageStr.split(/[,;\n]+/);
            items.forEach(item => {
              const trimmed = item.trim();
              if (!trimmed) return;

              let name = '';
              let qtyNum = 0;

              if (trimmed.includes(':')) {
                const parts = trimmed.split(':');
                name = parts[0].trim();
                const qtyMatch = parts[1].match(/([\d\.]+)/);
                if (qtyMatch) qtyNum = parseFloat(qtyMatch[1]);
              } else if (trimmed.includes('-')) {
                const parts = trimmed.split('-');
                name = parts[0].trim();
                const qtyMatch = parts[1].match(/([\d\.]+)/);
                if (qtyMatch) qtyNum = parseFloat(qtyMatch[1]);
              } else {
                const numMatch = trimmed.match(/([\d\.]+)/);
                if (numMatch) {
                  qtyNum = parseFloat(numMatch[1]);
                  name = trimmed.replace(/[\d\.]+/g, '').replace(/kg|kgs|ton|tons|g/gi, '').trim();
                }
              }

              if (isNaN(qtyNum) || qtyNum <= 0) return;

              const normName = name.toUpperCase();
              if (normName === 'PP' || normName.includes('POLYPROPYLENE') || normName.startsWith('PP ')) {
                ppTotal += qtyNum;
              } else if (normName === 'CC' || normName.includes('FILLER') || normName.includes('CALCIUM') || normName.startsWith('CC ')) {
                ccTotal += qtyNum;
              } else if (normName === 'LD' || normName.includes('LDPE') || normName.startsWith('LD ')) {
                ldTotal += qtyNum;
              } else if (normName === 'TPT' || normName.startsWith('TPT ')) {
                tptTotal += qtyNum;
              } else {
                const cleanKey = name || 'Other Material';
                othersMap[cleanKey] = (othersMap[cleanKey] || 0) + qtyNum;
              }
            });
          }
        }
      });

      const sumOthers = Object.values(othersMap).reduce((a, b) => a + b, 0);
      const totalAllMaterials = ppTotal + ccTotal + ldTotal + tptTotal + sumOthers;

      const hasRemarks = exportData.some(r => !!r.remarks && r.remarks.trim().length > 0);
      const numCols = hasRemarks ? 6 : 5;
      const endColLetter = hasRemarks ? 'F' : 'E';

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Tape Plant Summary');

      const thickBlackBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF000000' } },
        left: { style: 'medium' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF000000' } },
        right: { style: 'medium' as const, color: { argb: 'FF000000' } },
      };

      // 1. TOP BANNER (Rows 1 & 2 merged)
      const startDateFormatted = formatDateDDMMMYYYY(exportStartDate);
      const endDateFormatted = formatDateDDMMMYYYY(exportEndDate);
      const printDateTapeStr = `PRINT DATE: ${formatDateDDMMMYYYY(new Date())} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      const bannerText = `FFPL [TAPE PLANT PRODUCTION REPORT SUMMARY] - Date Range: ${startDateFormatted} to ${endDateFormatted} • ${printDateTapeStr}`;

      worksheet.mergeCells(`A1:${endColLetter}2`);
      const titleCell = worksheet.getCell('A1');
      titleCell.value = bannerText;
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      worksheet.getRow(1).height = 24;
      worksheet.getRow(2).height = 24;

      for (let r = 1; r <= 2; r++) {
        for (let c = 1; c <= numCols; c++) {
          worksheet.getRow(r).getCell(c).border = thickBlackBorder;
        }
      }

      // 2. SECTION HEADERS (Row 3)
      worksheet.mergeCells('A3:B3');
      worksheet.mergeCells(`C3:${endColLetter}3`);

      const leftHeaderCell = worksheet.getCell('A3');
      leftHeaderCell.value = 'REPORT SUMMARY METRICS';
      leftHeaderCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
      leftHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const rightHeaderCell = worksheet.getCell('C3');
      rightHeaderCell.value = 'RAW MATERIALS CONSUMPTION SUMMARY';
      rightHeaderCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
      rightHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.getRow(3).height = 24;

      for (let c = 1; c <= numCols; c++) {
        worksheet.getRow(3).getCell(c).border = thickBlackBorder;
      }

      // 3. METRICS CARDS (Rows 4 - 8+)
      const leftMetrics: [string, string][] = [
        ['Total Active Shifts', `${activeShifts} shifts`],
        ['Total Stopped Shifts', `${stoppedShifts} shifts`],
        ['Total Shifts Recorded', `${exportData.length} shifts`],
        ['Total Wastage Recorded', `${sumWastage.toFixed(1)} KG`]
      ];

      const rightMetrics: [string, string][] = [
        ['Total Used PP (Polypropylene)', `${ppTotal.toFixed(2)} KG`],
        ['Total Used CC (Calcium / Filler)', `${ccTotal.toFixed(2)} KG`],
        ['Total Used LD (LDPE Granules)', `${ldTotal.toFixed(2)} KG`],
        ['Total Used TPT (Tape Line Additive)', `${tptTotal.toFixed(2)} KG`],
        ...Object.entries(othersMap).map(([mName, mQty]): [string, string] => [`Total Used ${mName}`, `${mQty.toFixed(2)} KG`]),
        ['Sum of All Materials Combined', `${totalAllMaterials.toFixed(2)} KG`]
      ];

      const maxMetricRows = Math.max(leftMetrics.length, rightMetrics.length);

      for (let i = 0; i < maxMetricRows; i++) {
        const rowIdx = 4 + i;
        const row = worksheet.getRow(rowIdx);
        row.height = 22;

        // Left side (A & B)
        if (i < leftMetrics.length) {
          const [lbl, val] = leftMetrics[i];
          const cellA = row.getCell(1);
          const cellB = row.getCell(2);
          cellA.value = lbl;
          cellA.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
          cellA.alignment = { vertical: 'middle', horizontal: 'center' };
          cellA.border = thickBlackBorder;

          cellB.value = val;
          cellB.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
          cellB.alignment = { vertical: 'middle', horizontal: 'center' };
          cellB.border = thickBlackBorder;
        } else {
          row.getCell(1).border = thickBlackBorder;
          row.getCell(2).border = thickBlackBorder;
        }

        // Right side (C & D / E)
        if (i < rightMetrics.length) {
          const [lbl, val] = rightMetrics[i];
          const cellC = row.getCell(3);
          const cellD = row.getCell(4);
          cellC.value = lbl;
          cellC.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
          cellC.alignment = { vertical: 'middle', horizontal: 'center' };
          cellC.border = thickBlackBorder;

          cellD.value = val;
          cellD.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
          cellD.alignment = { vertical: 'middle', horizontal: 'center' };
          cellD.border = thickBlackBorder;

          for (let c = 5; c <= numCols; c++) {
            row.getCell(c).border = thickBlackBorder;
          }
        } else {
          for (let c = 3; c <= numCols; c++) {
            row.getCell(c).border = thickBlackBorder;
          }
        }
      }

      const tableHeaderRowIdx = 4 + maxMetricRows + 1; // row 10
      worksheet.getRow(tableHeaderRowIdx - 1).height = 12; // spacer row height

      // 4. DATA TABLE HEADER
      const headerRow = worksheet.getRow(tableHeaderRowIdx);
      headerRow.height = 26;
      const headers = ['Date', 'Shift', 'Raw Material Usage', 'Wastage', 'Manpower Present'];
      if (hasRemarks) headers.push('Remarks');

      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thickBlackBorder;
      });

      // 5. DATA ROWS
      const tableDataStartRow = tableHeaderRowIdx + 1;
      exportData.forEach((r, rIdx) => {
        const rowNum = tableDataStartRow + rIdx;
        const row = worksheet.getRow(rowNum);
        row.height = 22;

        const displayDate = formatDateDDMMMYYYY(r.date);
        const shiftLabel = r.shift ? r.shift.toUpperCase() : 'DAY';
        const manpowerStr = formatManpower(r);

        let rowVals: string[] = [];
        if (r.isStopped) {
          rowVals = [displayDate, shiftLabel, 'Plant Stopped / Not Running', '0 KG', manpowerStr];
          if (hasRemarks) rowVals.push(r.remarks || '');
        } else {
          rowVals = [
            displayDate,
            shiftLabel,
            r.usage || '',
            `${r.wastage || 0} KG`,
            manpowerStr
          ];
          if (hasRemarks) rowVals.push(r.remarks || '');
        }

        rowVals.forEach((val, colIdx) => {
          const cell = row.getCell(colIdx + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          cell.border = thickBlackBorder;
        });
      });

      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? headers[idx].length : 10;
        col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
          if (rowNumber >= tableHeaderRowIdx) {
            const val = cell.value ? String(cell.value) : '';
            const lines = val.split('\n');
            lines.forEach(l => { if (l.length > maxLen) maxLen = l.length; });
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 10), 45);
      });

      // 6. TOTALS ROW AT BOTTOM
      const totalsRowIdx = tableDataStartRow + exportData.length;
      const totRow = worksheet.getRow(totalsRowIdx);
      totRow.height = 26;
      totRow.getCell(1).value = 'TOTALS';
      totRow.getCell(2).value = `${exportData.length} shifts`;
      totRow.getCell(3).value = `Raw Materials Sum: ${totalAllMaterials.toFixed(2)} KG`;
      totRow.getCell(4).value = `${sumWastage.toFixed(1)} KG`;
      if (hasRemarks) totRow.getCell(5).value = '';

      for (let c = 1; c <= numCols; c++) {
        const cell = totRow.getCell(c);
        cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = thickBlackBorder;
      }

      const fileName = `Tape_Plant_Production_Report_${exportStartDate}_to_${exportEndDate}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);

      triggerAlert('success', `Spreadsheet downloaded as ${fileName}`);
      setShowExportModal(false);
    } catch (err) {
      console.error('Excel generation failed:', err);
      triggerAlert('warn', 'Failed to generate Excel sheet.');
    } finally {
      setIsExporting(false);
    }
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        
        {/* Metric 1 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Shifts Logged</p>
              <h3 className="text-base sm:text-2xl font-black text-slate-800 mt-2">
                {totals.totalShifts ? `${totals.totalShifts.toLocaleString()} Shifts` : '0 Shifts'}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold shrink-0">
              <Package className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </div>
          </div>
          <p className="text-[8.5px] sm:text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
            For selected date filters
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Active Running</p>
              <h3 className="text-base sm:text-2xl font-black text-emerald-700 mt-2">
                {totals.runningShifts ? `${totals.runningShifts.toLocaleString()} Run` : '0 Run'}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <Activity className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </div>
          </div>
          <p className="text-[8.5px] sm:text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
            Shifts with material usage
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Plant Not Running</p>
              <h3 className="text-base sm:text-2xl font-black text-rose-700 mt-2">
                {totals.stoppedShifts ? `${totals.stoppedShifts.toLocaleString()} Stop` : '0 Stop'}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
              <Lock className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </div>
          </div>
          <p className="text-[8.5px] sm:text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
            Stopped shifts recorded
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-150 rounded-3xl p-4 sm:p-6 shadow-xs relative overflow-hidden select-none hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/40 rounded-full translate-x-4 -translate-y-4 -z-0"></div>
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Total Line Wastage</p>
              <h3 className="text-base sm:text-2xl font-black text-indigo-700 mt-2">
                {totals.wastage ? `${totals.wastage.toLocaleString()} KG` : '0 KG'}
              </h3>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <Trash2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </div>
          </div>
          <p className="text-[8.5px] sm:text-[9.5px] text-slate-400 font-medium mt-3 uppercase tracking-wider">
            Accumulated shift waste
          </p>
        </div>

      </div>

      {/* 📦 RAW MATERIALS CONSUMPTION SUMMARY FOR SELECTED DATE RANGE */}
      <div className="bg-white border border-slate-150 rounded-3xl p-5 md:p-6 mb-8 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 font-bold">
              <Package size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Raw Materials Consumption Summary
              </h3>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                Total materials used in selected date range (<span className="text-slate-700 font-bold">{selectedDateRangeLabel}</span>)
              </p>
            </div>
          </div>
          
          <div className="self-start sm:self-auto px-3.5 py-1.5 bg-amber-500 text-slate-950 border border-amber-400 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
            <Sparkles size={13} className="text-slate-950" />
            <span>Sum of All Materials: <strong className="font-mono text-xs font-black">{materialSummary.totalAll.toLocaleString()} KG</strong></span>
          </div>
        </div>

        {/* Material Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
          
          {/* PP Card */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">Total Used PP</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-2xs"></span>
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-slate-900 font-mono tracking-tight">
                {materialSummary.pp.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">KG</span>
              </div>
              <p className="text-[9px] text-amber-700 font-bold mt-0.5 uppercase tracking-wide">Polypropylene</p>
            </div>
          </div>

          {/* CC Card */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">Total Used CC</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs"></span>
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-slate-900 font-mono tracking-tight">
                {materialSummary.cc.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">KG</span>
              </div>
              <p className="text-[9px] text-emerald-700 font-bold mt-0.5 uppercase tracking-wide">Calcium / Filler</p>
            </div>
          </div>

          {/* LD Card */}
          <div className="bg-sky-50/60 border border-sky-200/80 rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-sky-900 uppercase tracking-wider">Total Used LD</span>
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-2xs"></span>
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-slate-900 font-mono tracking-tight">
                {materialSummary.ld.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">KG</span>
              </div>
              <p className="text-[9px] text-sky-700 font-bold mt-0.5 uppercase tracking-wide">LDPE Granules</p>
            </div>
          </div>

          {/* TPT Card */}
          <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-wider">Total Used TPT</span>
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-2xs"></span>
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-slate-900 font-mono tracking-tight">
                {materialSummary.tpt.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">KG</span>
              </div>
              <p className="text-[9px] text-indigo-700 font-bold mt-0.5 uppercase tracking-wide">Tape Line Additive</p>
            </div>
          </div>

          {/* Other Materials Cards (Dynamic) */}
          {Object.entries(materialSummary.others).map(([matName, matQty]) => (
            <div key={matName} className="bg-purple-50/60 border border-purple-200/80 rounded-2xl p-3.5 flex flex-col justify-between hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider truncate" title={`Total Used ${matName}`}>
                  Total Used {matName}
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-2xs"></span>
              </div>
              <div>
                <div className="text-base sm:text-xl font-black text-slate-900 font-mono tracking-tight">
                  {matQty.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">KG</span>
                </div>
                <p className="text-[9px] text-purple-700 font-bold mt-0.5 uppercase tracking-wide truncate">{matName}</p>
              </div>
            </div>
          ))}

          {/* GRAND TOTAL CARD (Sum of All Materials) */}
          <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-md col-span-2 sm:col-span-1 md:col-span-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Sum of All</span>
              <Sparkles size={13} className="text-amber-400" />
            </div>
            <div>
              <div className="text-base sm:text-xl font-black text-white font-mono tracking-tight">
                {materialSummary.totalAll.toLocaleString()} <span className="text-xs font-bold text-slate-300 font-sans">KG</span>
              </div>
              <p className="text-[9px] text-slate-300 font-medium mt-0.5 uppercase tracking-wide">All Materials Combined</p>
            </div>
          </div>

        </div>
      </div>
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

            {/* Shift Filter Dropdown */}
            <div className="w-full sm:w-40 shrink-0">
              <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Shift Filter</label>
              <select
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value as 'all' | 'day' | 'night')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 focus:bg-white focus:outline-hidden cursor-pointer"
              >
                <option value="all">✨ All Shifts</option>
                <option value="day">☀️ Day Shift</option>
                <option value="night">🌙 Night Shift</option>
              </select>
            </div>

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
          <>
            {/* 📱 Mobile Card List View (Visible only on mobile devices) */}
            <div className="block md:hidden divide-y divide-slate-150">
              {filteredReports.map((report) => (
                <div 
                  key={report.id} 
                  className={`p-4 flex flex-col gap-3.5 transition-all hover:bg-slate-50/50 ${report.isStopped ? 'bg-rose-50/20' : 'bg-white'}`}
                  id={`card-${report.id}`}
                >
                  {/* Card Header: Date & Shift */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={14} className="text-slate-400" />
                      <span className="font-mono text-xs font-bold text-slate-800">{formatDateLabel(report.date)}</span>
                    </div>
                    
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                      report.shift === 'day' 
                        ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      {report.shift === 'day' ? (
                        <Sun size={9} className="text-amber-500 stroke-[2]" />
                      ) : (
                        <Moon size={9} className="text-purple-600 stroke-[2]" />
                      )}
                      {report.shift === 'day' ? 'Day Shift' : 'Night Shift'}
                    </span>
                  </div>

                  {/* Card Body: Usage and Wastage */}
                  <div className="space-y-3">
                    <div>
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Raw Material Usage Details</span>
                      {report.isStopped ? (
                        <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest animate-pulse">
                          <AlertTriangle size={11} className="shrink-0" />
                          {report.usage || "Plant Stopped / Not Running"}
                        </span>
                      ) : (
                        <p className="text-slate-700 text-xs font-semibold leading-relaxed bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100">
                          {report.usage}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50/30 p-2 rounded-xl border border-slate-100/50">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">Wastage weight</span>
                        {report.isStopped ? (
                          <span className="text-slate-350 font-bold">—</span>
                        ) : (
                          <span className="text-slate-850 font-mono text-xs font-bold">
                            {report.wastage || 0} <span className="text-[9px] text-slate-400 font-extrabold uppercase">kg</span>
                          </span>
                        )}
                      </div>

                      <div className="bg-slate-50/30 p-2 rounded-xl border border-slate-100/50">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5">Manpower Present</span>
                        <span className="text-slate-800 font-bold text-xs block truncate">
                          {formatManpower(report)}
                        </span>
                      </div>
                    </div>

                    {report.remarks && (
                      <div className="bg-amber-50/30 p-2.5 rounded-2xl border border-amber-100/40 text-[11px] text-slate-600 font-medium italic">
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block not-italic mb-1">Remarks</span>
                        "{report.remarks}"
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  {!viewOnly && (
                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleEditClick(report)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl transition-all cursor-pointer text-[10px] font-extrabold uppercase tracking-wider border border-slate-200"
                        title="Edit / Override Report"
                      >
                        <Edit2 size={11} className="stroke-[2.5]" />
                        Edit
                      </button>
                      
                      {!report.isAutoGenerated && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(report.id, `${formatDateLabel(report.date)} (${report.shift.toUpperCase()})`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-xl transition-all cursor-pointer text-[10px] font-extrabold uppercase tracking-wider border border-rose-100"
                          title="Delete Manual Override"
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 💻 Desktop Table View (Hidden on mobile screens, shown on md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[10px] font-black uppercase tracking-wider border-b border-slate-800 select-none">
                    <th className="py-3 px-6 border-r border-slate-800">Date</th>
                    <th className="py-3 px-6 border-r border-slate-800 text-center">Shift</th>
                    <th className="py-3 px-6 border-r border-slate-800">Raw Material Usage Description</th>
                    <th className="py-3 px-6 border-r border-slate-800 text-center">Wastage (kg)</th>
                    <th className="py-3 px-6 border-r border-slate-800 text-center">Manpower Present</th>
                    <th className="py-3 px-6 border-r border-slate-800 text-center">Remarks</th>
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

                      {/* Manpower Present */}
                      <td className="py-4 px-6 border-r border-slate-150 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-extrabold bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                            <Users size={12} className="text-emerald-600 shrink-0" />
                            <span>{formatManpower(report)}</span>
                          </span>
                          <span className={`text-[9px] font-extrabold uppercase ${report.isAutoGenerated ? 'text-emerald-600' : 'text-indigo-600'}`}>
                            {report.isAutoGenerated ? 'Auto Synced' : 'Manual Override'}
                          </span>
                        </div>
                      </td>

                      {/* Remarks Column */}
                      <td className="py-4 px-6 border-r border-slate-150 text-center font-normal text-slate-500 italic max-w-[180px] truncate" title={report.remarks || ''}>
                        {report.remarks || '—'}
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
          </>
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

              {/* Manpower Attendance Input Section */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-emerald-600" />
                    <span>Staff Attendance Present (Manpower)</span>
                  </span>
                  <span className="text-[9.5px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">
                    Operators / Windermen / Helpers
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block mb-1 text-[9.5px] font-black text-slate-500 uppercase tracking-wider">
                      Operators Present
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={operatorsVal}
                      onChange={(e) => setOperatorsVal(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-black text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[9.5px] font-black text-slate-500 uppercase tracking-wider">
                      Windermen Present
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={windermenVal}
                      onChange={(e) => setWindermenVal(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-black text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 text-[9.5px] font-black text-slate-500 uppercase tracking-wider">
                      Helpers Present
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={helpersVal}
                      onChange={(e) => setHelpersVal(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-black text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks optional field */}
              <div>
                <label className="block mb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Changed screen filter, low voltage during shift, machine maintenance"
                  value={remarksVal}
                  onChange={(e) => setRemarksVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden"
                />
              </div>

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
