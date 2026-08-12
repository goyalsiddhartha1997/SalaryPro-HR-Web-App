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
  Users,
  Sun,
  Moon,
  Package,
  Gauge,
  Zap,
  TrendingUp,
  Download,
  MessageSquare
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { formatDateDDMMMYYYY } from '../utils/dateUtils';
import {
  TapePlantRunningReport as ITapePlantRunningReport,
  TapePlantRunningRow,
  TapePlantProductionReport,
  RawMaterialItem,
  Employee
} from '../types';

interface TapePlantRunningReportProps {
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
}

export default function TapePlantRunningReport({
  triggerAlert,
  viewOnly = false
}: TapePlantRunningReportProps) {
  // --- FIRESTORE DATA STREAMS ---
  const [runningReports, setRunningReports] = useState<ITapePlantRunningReport[]>([]);
  const [productionReports, setProductionReports] = useState<TapePlantProductionReport[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  // --- DATE FILTER STATES ---
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

  // Search filter inside table
  const [searchQuery, setSearchQuery] = useState('');

  // --- MODAL / FORM STATES ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [entryDate, setEntryDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [entryShift, setEntryShift] = useState<'DAY' | 'NIGHT'>('DAY');
  const [totalEmployeesInput, setTotalEmployeesInput] = useState<string>('0');
  const [remarksInput, setRemarksInput] = useState<string>('');
  const [roundsList, setRoundsList] = useState<TapePlantRunningRow[]>([
    { id: '1', roundNo: 1, denier: 600, quality: 'PP Clear', strength: 3.5, elongation: 22, tapeWidth: 2.8 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- STREAM RUNNING REPORTS FROM FIRESTORE ---
  useEffect(() => {
    setLoading(true);
    const q = collection(db, 'tapePlantRunningReports');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ITapePlantRunningReport[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as ITapePlantRunningReport) });
        });
        list.sort((a, b) => b.date.localeCompare(a.date));
        setRunningReports(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'tapePlantRunningReports');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // --- STREAM PRODUCTION REPORTS FROM FIRESTORE FOR WASTAGE & RAW MATERIAL SYNC ---
  useEffect(() => {
    const q = collection(db, 'tapePlantProductions');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TapePlantProductionReport[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as TapePlantProductionReport);
        });
        setProductionReports(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'tapePlantProductions');
      }
    );
    return () => unsubscribe();
  }, []);

  // --- STREAM RAW MATERIALS FOR INVENTORY CONSUMPTION LOOKUP ---
  useEffect(() => {
    const q = collection(db, 'rawMaterials');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: RawMaterialItem[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as RawMaterialItem);
        });
        setRawMaterials(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'rawMaterials');
      }
    );
    return () => unsubscribe();
  }, []);

  // --- DATE CHANGE HANDLERS (NEXT / PREVIOUS ARROWS) ---
  const handlePrevDate = () => {
    if (!singleDate) return;
    const parts = singleDate.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setSingleDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  const handleNextDate = () => {
    if (!singleDate) return;
    const parts = singleDate.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setSingleDate(`${yyyy}-${mm}-${dd}`);
    }
  };

  // --- FILTERED & SORTED RUNNING REPORTS (SEPARATE LEDGERS) ---
  const filteredRunningReports = useMemo(() => {
    const list = runningReports.filter((r) => {
      const dateMatch =
        filterMode === 'single'
          ? r.date === singleDate
          : r.date >= rangeStartDate && r.date <= rangeEndDate;

      if (!dateMatch) return false;

      if (filterShift !== 'ALL') {
        const rShift = (r.shift || 'DAY').toUpperCase();
        if (rShift !== filterShift) return false;
      }

      return true;
    });

    // Sort by date ascending, then shift DAY before NIGHT
    return list.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      const shiftA = (a.shift || 'DAY').toUpperCase();
      const shiftB = (b.shift || 'DAY').toUpperCase();
      if (shiftA === shiftB) return 0;
      return shiftA === 'DAY' ? -1 : 1;
    });
  }, [runningReports, filterMode, singleDate, rangeStartDate, rangeEndDate, filterShift]);

  // Search filtered reports
  const searchedReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredRunningReports;

    return filteredRunningReports.filter((rep) => {
      const dateStr = rep.date.toLowerCase();
      const shiftStr = (rep.shift || 'DAY').toLowerCase();
      const remarksStr = (rep.remarks || '').toLowerCase();

      if (dateStr.includes(q) || shiftStr.includes(q) || remarksStr.includes(q)) {
        return true;
      }

      return (rep.rounds || []).some(
        (row) =>
          String(row.roundNo).toLowerCase().includes(q) ||
          String(row.denier).toLowerCase().includes(q) ||
          (row.quality || '').toLowerCase().includes(q) ||
          String(row.strength).toLowerCase().includes(q) ||
          String(row.elongation).toLowerCase().includes(q) ||
          String(row.tapeWidth !== undefined ? row.tapeWidth : '').toLowerCase().includes(q)
      );
    });
  }, [filteredRunningReports, searchQuery]);

  // --- MATCHED PRODUCTION REPORTS (FOR WASTAGE & RAW MATERIAL USAGE SYNC) ---
  const matchedProductionReports = useMemo(() => {
    return productionReports.filter((p) => {
      if (!p.date) return false;
      const dateMatch =
        filterMode === 'single'
          ? p.date === singleDate
          : p.date >= rangeStartDate && p.date <= rangeEndDate;

      if (!dateMatch) return false;

      if (filterShift !== 'ALL') {
        const pShift = (p.shift || 'day').toUpperCase();
        if (pShift !== filterShift) return false;
      }

      return true;
    });
  }, [productionReports, filterMode, singleDate, rangeStartDate, rangeEndDate, filterShift]);

  // --- CALCULATE SYNCED METRICS ---
  const metrics = useMemo(() => {
    let totalRawMaterialKg = 0;
    matchedProductionReports.forEach((p) => {
      if (p.usage) {
        const items = p.usage.split(/[,;\n]+/);
        items.forEach((item) => {
          const trimmed = item.trim();
          if (!trimmed) return;
          const match = trimmed.match(/([\d\.]+)/);
          if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 0) {
              totalRawMaterialKg += val;
            }
          }
        });
      }
    });

    if (totalRawMaterialKg === 0) {
      rawMaterials.forEach((item) => {
        if (item.logs) {
          item.logs.forEach((log) => {
            if (log.type === 'use_stock') {
              const dateMatch =
                filterMode === 'single'
                  ? log.date === singleDate
                  : log.date >= rangeStartDate && log.date <= rangeEndDate;
              if (dateMatch) {
                const logShift = String(log.shift || 'Day Shift').toUpperCase();
                if (filterShift === 'ALL') {
                  totalRawMaterialKg += log.quantity || 0;
                } else if (filterShift === 'DAY' && (logShift.includes('DAY') || logShift === 'DAY')) {
                  totalRawMaterialKg += log.quantity || 0;
                } else if (filterShift === 'NIGHT' && (logShift.includes('NIGHT') || logShift === 'NIGHT')) {
                  totalRawMaterialKg += log.quantity || 0;
                }
              }
            }
          });
        }
      });
    }

    let totalRounds = 0;
    filteredRunningReports.forEach((r) => {
      totalRounds += (r.rounds || []).length;
    });

    let totalWastageKg = 0;
    matchedProductionReports.forEach((p) => {
      if (!p.isStopped) {
        totalWastageKg += p.wastage || 0;
      }
    });

    let totalEmployees = 0;
    filteredRunningReports.forEach((r) => {
      const matchedP = matchedProductionReports.find(
        (p) => p.date === r.date && (p.shift || 'day').toUpperCase() === (r.shift || 'DAY').toUpperCase()
      );
      if (matchedP) {
        const prodEmp = (matchedP.operatorsCount || 0) + (matchedP.windermenCount || 0) + (matchedP.helpersCount || 0);
        if (prodEmp > 0) {
          totalEmployees += prodEmp;
          return;
        }
      }
      totalEmployees += r.totalEmployees || 0;
    });

    if (totalEmployees === 0) {
      matchedProductionReports.forEach((p) => {
        totalEmployees += (p.operatorsCount || 0) + (p.windermenCount || 0) + (p.helpersCount || 0);
      });
    }

    return {
      totalRawMaterialKg: parseFloat(totalRawMaterialKg.toFixed(2)),
      totalRounds,
      totalWastageKg: parseFloat(totalWastageKg.toFixed(2)),
      totalEmployees
    };
  }, [
    matchedProductionReports,
    filteredRunningReports,
    rawMaterials,
    filterMode,
    singleDate,
    rangeStartDate,
    rangeEndDate,
    filterShift
  ]);

  // Helper to compute summary statistics for a single report's rounds
  const computeReportStats = (rounds: TapePlantRunningRow[]) => {
    let denierSum = 0;
    let strengthSum = 0;
    let elongationSum = 0;
    let tapeWidthSum = 0;
    const count = rounds.length;

    rounds.forEach((r) => {
      const den = typeof r.denier === 'number' ? r.denier : parseFloat(String(r.denier)) || 0;
      const str = typeof r.strength === 'number' ? r.strength : parseFloat(String(r.strength)) || 0;
      const elo = typeof r.elongation === 'number' ? r.elongation : parseFloat(String(r.elongation)) || 0;
      const tw = typeof r.tapeWidth === 'number' ? r.tapeWidth : parseFloat(String(r.tapeWidth)) || 0;

      denierSum += den;
      strengthSum += str;
      elongationSum += elo;
      tapeWidthSum += tw;
    });

    return {
      totalRoundsCount: count,
      avgDenier: count > 0 ? Math.round(denierSum / count) : 0,
      avgStrength: count > 0 ? parseFloat((strengthSum / count).toFixed(2)) : 0,
      avgElongation: count > 0 ? parseFloat((elongationSum / count).toFixed(2)) : 0,
      avgTapeWidth: count > 0 ? parseFloat((tapeWidthSum / count).toFixed(2)) : 0
    };
  };

  // Helper to lookup matching Tape Plant Production Report for active modal date & shift
  const currentMatchingProd = useMemo(() => {
    if (!entryDate || !entryShift) return null;
    return productionReports.find(
      (p) => p.date === entryDate && (p.shift || 'day').toUpperCase() === entryShift.toUpperCase()
    );
  }, [productionReports, entryDate, entryShift]);

  // Reactive effect: Auto-sync total employees from matching tape plant production report when modal date/shift changes
  useEffect(() => {
    if (showAddModal && currentMatchingProd) {
      const count = (currentMatchingProd.operatorsCount || 0) + (currentMatchingProd.windermenCount || 0) + (currentMatchingProd.helpersCount || 0);
      if (count > 0) {
        setTotalEmployeesInput(String(count));
      }
    }
  }, [entryDate, entryShift, currentMatchingProd, showAddModal]);

  // --- FORM HANDLERS FOR ADD / EDIT ---
  const handleOpenAddModal = (reportToEdit?: ITapePlantRunningReport) => {
    if (viewOnly) {
      triggerAlert('warn', 'Access Denied. View-only mode active.');
      return;
    }

    if (reportToEdit) {
      setEditingId(reportToEdit.id);
      setEntryDate(reportToEdit.date);
      const shiftVal = reportToEdit.shift || 'DAY';
      setEntryShift(shiftVal);
      setRemarksInput(reportToEdit.remarks || '');
      setRoundsList(
        reportToEdit.rounds && reportToEdit.rounds.length > 0
          ? reportToEdit.rounds.map((r) => ({
              ...r,
              tapeWidth: r.tapeWidth !== undefined ? r.tapeWidth : 2.8
            }))
          : [{ id: '1', roundNo: 1, denier: 600, quality: 'PP Clear', strength: 3.5, elongation: 22, tapeWidth: 2.8 }]
      );
      const matchingP = productionReports.find(
        (p) => p.date === reportToEdit.date && (p.shift || 'day').toUpperCase() === shiftVal.toUpperCase()
      );
      const prodEmp = matchingP ? ((matchingP.operatorsCount || 0) + (matchingP.windermenCount || 0) + (matchingP.helpersCount || 0)) : 0;
      setTotalEmployeesInput(String(prodEmp > 0 ? prodEmp : (reportToEdit.totalEmployees || 0)));
    } else {
      const selD = singleDate || new Date().toISOString().split('T')[0];
      const selS = filterShift === 'NIGHT' ? 'NIGHT' : 'DAY';
      setEditingId(null);
      setEntryDate(selD);
      setEntryShift(selS);
      setRemarksInput('');
      setRoundsList([
        { id: '1', roundNo: 1, denier: 600, quality: 'PP Clear', strength: 3.5, elongation: 22, tapeWidth: 2.8 }
      ]);
      const matchingP = productionReports.find(
        (p) => p.date === selD && (p.shift || 'day').toUpperCase() === selS.toUpperCase()
      );
      const prodEmp = matchingP ? ((matchingP.operatorsCount || 0) + (matchingP.windermenCount || 0) + (matchingP.helpersCount || 0)) : 0;
      setTotalEmployeesInput(String(prodEmp));
    }
    setShowAddModal(true);
  };

  // --- COPY DATA FROM LAST REPORT ---
  const handleCopyLastReportData = () => {
    if (runningReports.length === 0) {
      triggerAlert('info', 'No previous tape plant running reports found in database.');
      return;
    }

    // Find the latest report that has round entries and is not the current editing report
    const lastReport =
      runningReports.find((r) => r.id !== editingId && r.rounds && r.rounds.length > 0) ||
      runningReports.find((r) => r.rounds && r.rounds.length > 0);

    if (!lastReport || !lastReport.rounds || lastReport.rounds.length === 0) {
      triggerAlert('info', 'No previous report with round entries found to copy from.');
      return;
    }

    // Clone the round rows with new IDs
    const copiedRounds: TapePlantRunningRow[] = lastReport.rounds.map((r, idx) => ({
      id: Date.now().toString() + '_' + idx,
      roundNo: r.roundNo || idx + 1,
      denier: r.denier,
      quality: r.quality || 'Silver',
      strength: r.strength,
      elongation: r.elongation,
      tapeWidth: r.tapeWidth !== undefined ? r.tapeWidth : 2.8,
      remarks: r.remarks || ''
    }));

    setRoundsList(copiedRounds);
    if (lastReport.totalEmployees) {
      setTotalEmployeesInput(String(lastReport.totalEmployees));
    }
    if (lastReport.remarks) {
      setRemarksInput(lastReport.remarks);
    }

    triggerAlert(
      'success',
      `Copied ${copiedRounds.length} rounds from previous report dated ${lastReport.date} (${lastReport.shift || 'DAY'})`
    );
  };

  const handleAddRoundRow = () => {
    const nextRoundNo = roundsList.length + 1;
    const lastRow = roundsList[roundsList.length - 1];
    setRoundsList((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        roundNo: nextRoundNo,
        denier: lastRow ? lastRow.denier : 600,
        quality: lastRow ? lastRow.quality : 'PP Clear',
        strength: lastRow ? lastRow.strength : 3.5,
        elongation: lastRow ? lastRow.elongation : 22,
        tapeWidth: lastRow && lastRow.tapeWidth !== undefined ? lastRow.tapeWidth : 2.8
      }
    ]);
  };

  const handleRemoveRoundRow = (id: string) => {
    if (roundsList.length <= 1) {
      triggerAlert('warn', 'At least one round entry is required.');
      return;
    }
    setRoundsList((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRoundChange = (id: string, field: keyof TapePlantRunningRow, val: any) => {
    setRoundsList((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: val };
        }
        return item;
      })
    );
  };

  const handleSaveReport = async () => {
    if (viewOnly) return;
    if (!entryDate) {
      triggerAlert('warn', 'Please select a valid date.');
      return;
    }

    if (roundsList.length === 0) {
      triggerAlert('warn', 'Please add at least one round entry.');
      return;
    }

    setIsSubmitting(true);
    try {
      const docId = editingId || `${entryDate}-${entryShift.toLowerCase()}`;
      const docRef = doc(db, 'tapePlantRunningReports', docId);

      const payload: ITapePlantRunningReport = {
        id: docId,
        date: entryDate,
        shift: entryShift,
        rounds: roundsList.map((r, idx) => ({
          id: r.id || String(idx + 1),
          roundNo: r.roundNo || idx + 1,
          denier: typeof r.denier === 'number' ? r.denier : parseFloat(String(r.denier)) || 0,
          quality: r.quality || 'PP Clear',
          strength: typeof r.strength === 'number' ? r.strength : parseFloat(String(r.strength)) || 0,
          elongation: typeof r.elongation === 'number' ? r.elongation : parseFloat(String(r.elongation)) || 0,
          tapeWidth: typeof r.tapeWidth === 'number' ? r.tapeWidth : parseFloat(String(r.tapeWidth)) || 0,
          remarks: r.remarks || ''
        })),
        totalEmployees: parseInt(totalEmployeesInput, 10) || 0,
        remarks: remarksInput.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });
      triggerAlert('success', `Tape Plant Running Report saved for ${entryDate} (${entryShift})`);
      setShowAddModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tapePlantRunningReports');
      triggerAlert('warn', 'Failed to save report to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReport = async (reportId: string, dateStr: string, shiftStr: string) => {
    if (viewOnly) {
      triggerAlert('warn', 'Access Denied. View-only mode active.');
      return;
    }

    if (!confirm(`Are you sure you want to delete Tape Plant Running Report for ${dateStr} (${shiftStr})?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'tapePlantRunningReports', reportId));
      triggerAlert('success', `Report for ${dateStr} (${shiftStr}) deleted.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tapePlantRunningReports');
      triggerAlert('warn', 'Failed to delete report.');
    }
  };

  // --- EXPORT TO EXCEL ---
  const handleExportExcel = async () => {
    if (searchedReports.length === 0) {
      triggerAlert('info', 'No tape plant running data available to export.');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Tape Plant Running Report');
      sheet.views = [{ showGridLines: true }];

      let periodInfo =
        filterMode === 'single'
          ? `Date: ${formatDateDDMMMYYYY(singleDate)}`
          : `Date Range: ${formatDateDDMMMYYYY(rangeStartDate)} to ${formatDateDDMMMYYYY(rangeEndDate)}`;
      periodInfo += ` | Shift: ${filterShift}`;

      const thickBlackBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF000000' } },
        left: { style: 'medium' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF000000' } },
        right: { style: 'medium' as const, color: { argb: 'FF000000' } }
      };

      // Title Banner (Row 1)
      sheet.mergeCells('A1:F1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'FORTUNE FLEXIPACK PVT LIMITED • TAPE PLANT RUNNING REPORT';
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let col = 1; col <= 6; col++) {
        sheet.getCell(1, col).border = thickBlackBorder;
      }

      // Metadata Sub-banner (Row 2)
      sheet.mergeCells('A2:F2');
      const subCell = sheet.getCell('A2');
      subCell.value = `${periodInfo} | Printed: ${formatDateDDMMMYYYY(new Date())}`;
      subCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
      subCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let col = 1; col <= 6; col++) {
        sheet.getCell(2, col).border = thickBlackBorder;
      }

      // Summary Metrics Rows (2 Rows: Row 3 & Row 4)
      sheet.mergeCells('A3:C3');
      sheet.mergeCells('D3:F3');
      sheet.mergeCells('A4:C4');
      sheet.mergeCells('D4:F4');

      sheet.getCell('A3').value = `Total Raw Material Usage: ${metrics.totalRawMaterialKg.toLocaleString('en-IN')} kg`;
      sheet.getCell('D3').value = `Total Rounds: ${metrics.totalRounds}`;
      sheet.getCell('A4').value = `Total Wastage: ${metrics.totalWastageKg.toLocaleString('en-IN')} kg`;
      sheet.getCell('D4').value = `Total Employees: ${metrics.totalEmployees}`;

      for (let r = 3; r <= 4; r++) {
        for (let col = 1; col <= 6; col++) {
          const cell = sheet.getCell(r, col);
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = thickBlackBorder;
        }
      }

      sheet.addRow([]); // Blank Spacer

      // Iterate through each report (separate ledger per date & shift)
      searchedReports.forEach((rep, repIndex) => {
        const stats = computeReportStats(rep.rounds || []);

        // Report Section Header
        const startRowIndex = sheet.rowCount + 1;
        sheet.mergeCells(`A${startRowIndex}:F${startRowIndex}`);
        const headerCell = sheet.getCell(`A${startRowIndex}`);
        headerCell.value = `LEDGER ENTRY #${repIndex + 1}: DATE: ${formatDateDDMMMYYYY(rep.date)} (${rep.date}) | SHIFT: ${(rep.shift || 'DAY').toUpperCase()} SHIFT | STAFF: ${rep.totalEmployees || 0} EMPLOYEES`;
        headerCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        headerCell.alignment = { horizontal: 'left', vertical: 'middle' };

        // Table Column Headers
        const headers = ['Round Number', 'Denier', 'Quality', 'Strength (kgs)', 'Elongation (%)', 'Tape Width (mm)'];
        const tableHeaderRow = sheet.addRow(headers);
        tableHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
          cell.border = thickBlackBorder;
        });

        // Data Rows for this report
        (rep.rounds || []).forEach((row) => {
          const r = sheet.addRow([
            `Round #${row.roundNo}`,
            row.denier,
            row.quality || 'Standard',
            row.strength,
            row.elongation,
            row.tapeWidth ?? '—'
          ]);

          r.eachCell((cell) => {
            cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            cell.border = thickBlackBorder;
          });
        });

        // Report Summary / Averages Row
        const summaryRow = sheet.addRow([
          'Shift Totals / Avg',
          `Avg: ${stats.avgDenier} D`,
          `${stats.totalRoundsCount} Rounds`,
          `Avg: ${stats.avgStrength} kg`,
          `Avg: ${stats.avgElongation}%`,
          `Avg: ${stats.avgTapeWidth} mm`
        ]);

        summaryRow.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
          cell.border = thickBlackBorder;
        });

        // Remarks Row (After the last row in each ledger)
        const remarksRowIndex = sheet.rowCount + 1;
        sheet.mergeCells(`A${remarksRowIndex}:F${remarksRowIndex}`);
        const remarksCell = sheet.getCell(`A${remarksRowIndex}`);
        remarksCell.value = `Shift Remarks (${formatDateDDMMMYYYY(rep.date)} - ${(rep.shift || 'DAY').toUpperCase()} SHIFT): ${rep.remarks && rep.remarks.trim() ? rep.remarks : 'No shift remarks recorded.'}`;
        remarksCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF1E293B' } };
        remarksCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        for (let col = 1; col <= 6; col++) {
          sheet.getCell(remarksRowIndex, col).border = thickBlackBorder;
        }

        sheet.addRow([]); // Blank Spacer row between ledgers
      });

      // Auto-fit Column Widths
      sheet.columns.forEach((col, idx) => {
        let maxLen = 16;
        sheet.eachRow((row) => {
          const cell = row.getCell(idx + 1);
          const val = cell.value != null ? String(cell.value) : '';
          if (val.length > maxLen && val.length < 50) {
            maxLen = val.length;
          }
        });
        col.width = Math.min(Math.max(maxLen + 3, 12), 40);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Tape_Plant_Running_Report_${filterMode === 'single' ? singleDate : `${rangeStartDate}_to_${rangeEndDate}`}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerAlert('success', 'Tape Plant Running Report Excel downloaded successfully.');
    } catch (err) {
      console.error('Error generating Excel:', err);
      triggerAlert('warn', 'Failed to generate Excel file.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-3 sm:p-6 space-y-5 animate-fade-in">
      {/* ==================== 1. PAGE HEADER ==================== */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-2xs shrink-0">
            <Sparkles size={24} className="stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Tape Plant Running Report
              </h1>
              <span className="bg-indigo-100 text-indigo-800 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                Live Plant Rounds
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Round-wise denier, quality, strength (kgs) & elongation (%) monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
          {!viewOnly && (
            <button
              type="button"
              onClick={() => handleOpenAddModal()}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus size={16} className="stroke-[2.5]" />
              <span>Add Running Entry</span>
            </button>
          )}
        </div>
      </div>

      {/* ==================== 2. DATE FILTERS & EXPORT TOOLBAR ==================== */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Mode Toggle & Shift Selection */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Single vs Range Mode Switcher */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setFilterMode('single')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  filterMode === 'single'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Single Date
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('range')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  filterMode === 'range'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Date Range
              </button>
            </div>

            {/* Date Pickers with Left/Right Arrows */}
            {filterMode === 'single' ? (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1">
                <button
                  type="button"
                  onClick={handlePrevDate}
                  className="h-8 w-8 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1.5 px-2">
                  <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleNextDate}
                  className="h-8 w-8 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 active:scale-95 transition-all cursor-pointer shadow-2xs"
                  title="Next Day"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">From:</span>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(e) => setRangeStartDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">To:</span>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Shift Selector */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setFilterShift('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  filterShift === 'ALL'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Shifts
              </button>
              <button
                type="button"
                onClick={() => setFilterShift('DAY')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                  filterShift === 'DAY'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sun size={12} />
                <span>Day</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterShift('NIGHT')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                  filterShift === 'NIGHT'
                    ? 'bg-indigo-900 text-white font-black shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Moon size={12} />
                <span>Night</span>
              </button>
            </div>
          </div>

          {/* Right: Export Excel Button */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export formatted Excel worksheet"
            >
              <Download size={15} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== 3. METRICS CARDS BANNER ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Total Raw Material Usage */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Total Raw Material Usage
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 font-mono">
                {metrics.totalRawMaterialKg.toLocaleString('en-IN')}
              </span>
              <span className="text-xs font-bold text-slate-500">kg</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 block mt-0.5">
              Synced with Production Reports
            </span>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-600 border border-amber-100 rounded-xl flex items-center justify-center shrink-0">
            <Package size={20} />
          </div>
        </div>

        {/* Metric 2: Total No. of Rounds */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Total No. of Rounds
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-indigo-700 font-mono">
                {metrics.totalRounds}
              </span>
              <span className="text-xs font-bold text-slate-500">Rounds</span>
            </div>
            <span className="text-[10px] font-bold text-indigo-500 block mt-0.5">
              Tested Quality Rounds
            </span>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <Gauge size={20} />
          </div>
        </div>

        {/* Metric 3: Total Wastage */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Total Wastage
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-rose-700 font-mono">
                {metrics.totalWastageKg.toLocaleString('en-IN')}
              </span>
              <span className="text-xs font-bold text-slate-500">kg</span>
            </div>
            <span className="text-[10px] font-bold text-rose-500 block mt-0.5">
              Synced with Tape Plant Prod Report
            </span>
          </div>
          <div className="w-10 h-10 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <Flame size={20} />
          </div>
        </div>

        {/* Metric 4: Total Employees */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Total Employees
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900 font-mono">
                {metrics.totalEmployees}
              </span>
              <span className="text-xs font-bold text-slate-500">Staff</span>
            </div>
            <span className="text-[10px] font-bold text-sky-600 block mt-0.5">
              Synced from Tape Plant Prod Report
            </span>
          </div>
          <div className="w-10 h-10 bg-sky-50 text-sky-600 border border-sky-100 rounded-xl flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* ==================== 4. LEDGER HEADER: DATE & SHIFT DISPLAY ==================== */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-300">
            <CalendarIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                Active Ledger Context
              </span>
              <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-extrabold px-2 py-0.2 rounded-full border border-indigo-400/30 font-mono">
                {searchedReports.length} Separate Ledger{searchedReports.length === 1 ? '' : 's'} ({metrics.totalRounds} Total Rounds)
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-white tracking-wide mt-0.5">
              Date:{' '}
              <span className="text-amber-300">
                {filterMode === 'single'
                  ? formatDateDDMMMYYYY(singleDate)
                  : `${formatDateDDMMMYYYY(rangeStartDate)} to ${formatDateDDMMMYYYY(rangeEndDate)}`}
              </span>{' '}
              <span className="text-slate-400 mx-1.5">|</span> Shift:{' '}
              <span className="text-sky-300 uppercase">{filterShift}</span>
            </h2>
          </div>
        </div>

        {/* Local Search Input inside Table */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search round, denier, quality..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ==================== 5. SEPARATED LEDGERS SECTION ==================== */}
      <div className="space-y-6">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 font-semibold shadow-xs">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
            <span>Loading Tape Plant Running Reports from database...</span>
          </div>
        ) : searchedReports.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-xs">
            <AlertTriangle size={28} className="mx-auto mb-2 text-amber-500" />
            <p className="font-bold text-slate-700 text-sm">No running report entries found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No rounds recorded for the selected date filter and shift. Click "Add Running Entry" above to log rounds.
            </p>
          </div>
        ) : (
          searchedReports.map((report) => {
            const stats = computeReportStats(report.rounds || []);
            const shiftUpper = (report.shift || 'DAY').toUpperCase();

            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all hover:shadow-md"
              >
                {/* Ledger Header */}
                <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-800 text-amber-300 font-mono font-black text-xs px-3 py-1 rounded-xl border border-slate-700">
                      <CalendarIcon size={13} className="text-amber-400" />
                      <span>{formatDateDDMMMYYYY(report.date)} ({report.date})</span>
                    </div>
                    <span
                      className={`text-[11px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wider flex items-center gap-1 ${
                        shiftUpper === 'NIGHT'
                          ? 'bg-indigo-900 text-indigo-200 border border-indigo-700'
                          : 'bg-amber-500 text-slate-950 font-black'
                      }`}
                    >
                      {shiftUpper === 'NIGHT' ? <Moon size={12} /> : <Sun size={12} />}
                      <span>{shiftUpper} SHIFT</span>
                    </span>
                    <span className="bg-slate-800 text-slate-300 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-700 flex items-center gap-1">
                      <Users size={12} className="text-sky-400" />
                      <span>Staff: {report.totalEmployees || 0}</span>
                    </span>
                    <span className="bg-indigo-950 text-indigo-300 text-[11px] font-bold px-2.5 py-1 rounded-xl border border-indigo-800/80">
                      {(report.rounds || []).length} Rounds Logged
                    </span>
                  </div>

                  {!viewOnly && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(report)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Edit2 size={13} />
                        <span>Edit Ledger</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(report.id, report.date, report.shift || 'DAY')}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-rose-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Ledger Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-extrabold text-[10.5px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Round Number</th>
                        <th className="py-2.5 px-3">Denier</th>
                        <th className="py-2.5 px-3">Quality</th>
                        <th className="py-2.5 px-3">Strength (kgs)</th>
                        <th className="py-2.5 px-3">Elongation (%)</th>
                        <th className="py-2.5 px-3">Tape Width (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 bg-white">
                      {(report.rounds || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                            No round specifications recorded in this shift report.
                          </td>
                        </tr>
                      ) : (
                        (report.rounds || []).map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-black text-indigo-900">
                              Round #{row.roundNo}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {row.denier} <span className="text-[10px] text-slate-400">D</span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200/80 font-medium">
                                {row.quality || 'Standard'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                              {row.strength} <span className="text-[10px] text-slate-400">kg</span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                              {row.elongation}%
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-800">
                              {row.tapeWidth ?? '—'} <span className="text-[10px] text-slate-400">mm</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-bold text-xs uppercase tracking-wider border-t-2 border-slate-800">
                      <tr>
                        <td className="py-2.5 px-3 font-black text-amber-300">Shift Totals / Avg</td>
                        <td className="py-2.5 px-3 font-mono font-black text-white">Avg: {stats.avgDenier} D</td>
                        <td className="py-2.5 px-3 font-bold text-slate-300">{stats.totalRoundsCount} Rounds</td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-300">Avg: {stats.avgStrength} kg</td>
                        <td className="py-2.5 px-3 font-mono font-black text-sky-300">Avg: {stats.avgElongation}%</td>
                        <td className="py-2.5 px-3 font-mono font-black text-amber-300">Avg: {stats.avgTapeWidth} mm</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Remarks Banner AFTER THE LAST ROW IN EACH LEDGER */}
                <div className="bg-slate-50 border-t border-slate-200 p-3.5 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0 mt-0.5 shadow-2xs">
                      <MessageSquare size={16} />
                    </div>
                    <div className="space-y-1 w-full">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 block">
                        Shift Remarks & Log Notes ({formatDateDDMMMYYYY(report.date)} - {shiftUpper} SHIFT):
                      </span>
                      {report.remarks && report.remarks.trim() ? (
                        <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap break-words bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                          {report.remarks}
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-slate-400 italic">
                          No shift remarks recorded for this entry.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ==================== 6. ADD / EDIT ENTRY MODAL ==================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-auto space-y-0">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-300">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight">
                    {editingId ? 'Edit Tape Plant Running Entry' : 'Log Tape Plant Running Entry'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Record round-wise quality specs, denier, strength, and elongation
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Header Details Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                {/* Date */}
                <div>
                  <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Entry Date
                  </label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Shift */}
                <div>
                  <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Shift
                  </label>
                  <select
                    value={entryShift}
                    onChange={(e) => setEntryShift(e.target.value as 'DAY' | 'NIGHT')}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DAY">DAY SHIFT</option>
                    <option value="NIGHT">NIGHT SHIFT</option>
                  </select>
                </div>

                {/* Total Employees */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500">
                      Total Employees
                    </label>
                    {currentMatchingProd && (
                      <span className="text-[9.5px] font-bold text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                        Synced ({currentMatchingProd.operatorsCount || 0} Ops + {currentMatchingProd.windermenCount || 0} Wind + {currentMatchingProd.helpersCount || 0} Help)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={totalEmployeesInput}
                    onChange={(e) => setTotalEmployeesInput(e.target.value)}
                    placeholder="e.g. 7"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Rounds Table Input Section */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Gauge size={14} className="text-indigo-600" />
                    <span>Round Specifications Ledger ({roundsList.length} Rounds)</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLastReportData}
                      className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      title="Copy all rounds from previous report"
                    >
                      <Copy size={13} />
                      <span>Copy Last Report Data</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddRoundRow}
                      className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Manual Row</span>
                    </button>
                  </div>
                </div>

                {roundsList.length === 0 ? (
                  <div className="border border-dashed border-slate-300 rounded-2xl bg-slate-50/80 p-8 text-center space-y-3">
                    <Info className="mx-auto text-slate-400" size={32} />
                    <div>
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider">
                        No Round Entries Added Yet
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Copy previous report data or start adding manual round entries below.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCopyLastReportData}
                        className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <Copy size={14} />
                        Copy Data from Last Report
                      </button>
                      <button
                        type="button"
                        onClick={handleAddRoundRow}
                        className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <Plus size={14} />
                        Add Manual Row
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-extrabold text-[10.5px] uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3 border-b border-slate-200 w-20">Round #</th>
                          <th className="py-2.5 px-3 border-b border-slate-200 w-28">Denier</th>
                          <th className="py-2.5 px-3 border-b border-slate-200">Quality</th>
                          <th className="py-2.5 px-3 border-b border-slate-200 w-28">Strength (kgs)</th>
                          <th className="py-2.5 px-3 border-b border-slate-200 w-28">Elongation (%)</th>
                          <th className="py-2.5 px-3 border-b border-slate-200 w-28">Tape Width (mm)</th>
                          <th className="py-2.5 px-3 border-b border-slate-200 text-center w-12">
                            Del
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 bg-white">
                        {roundsList.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50">
                            {/* Round # */}
                            <td className="py-2 px-3 w-20">
                              <input
                                type="number"
                                min="1"
                                value={row.roundNo}
                                onChange={(e) =>
                                  handleRoundChange(row.id, 'roundNo', parseInt(e.target.value, 10) || 1)
                                }
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-black text-indigo-900 focus:outline-none focus:bg-white"
                              />
                            </td>

                            {/* Denier */}
                            <td className="py-2 px-3 w-28">
                              <input
                                type="number"
                                value={row.denier}
                                onChange={(e) =>
                                  handleRoundChange(row.id, 'denier', parseFloat(e.target.value) || 0)
                                }
                                placeholder="600"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:bg-white"
                              />
                            </td>

                            {/* Quality (Dropdown with Silver, Natural, Janta, Gold, A1 + Custom Entry) */}
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    list={`quality-presets-${row.id}`}
                                    value={row.quality}
                                    onChange={(e) =>
                                      handleRoundChange(row.id, 'quality', e.target.value)
                                    }
                                    placeholder="Type or select quality..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <datalist id={`quality-presets-${row.id}`}>
                                    <option value="Silver" />
                                    <option value="Natural" />
                                    <option value="Janta" />
                                    <option value="Gold" />
                                    <option value="A1" />
                                  </datalist>
                                </div>
                                <select
                                  value={
                                    ['Silver', 'Natural', 'Janta', 'Gold', 'A1'].includes(row.quality)
                                      ? row.quality
                                      : ''
                                  }
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleRoundChange(row.id, 'quality', e.target.value);
                                    }
                                  }}
                                  className="bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg py-1 px-1.5 text-[10.5px] font-extrabold text-slate-700 cursor-pointer focus:outline-none shrink-0 transition-colors"
                                  title="Quick Select Quality"
                                >
                                  <option value="">Dropdown...</option>
                                  <option value="Silver">Silver</option>
                                  <option value="Natural">Natural</option>
                                  <option value="Janta">Janta</option>
                                  <option value="Gold">Gold</option>
                                  <option value="A1">A1</option>
                                </select>
                              </div>
                            </td>

                            {/* Strength (kgs) */}
                            <td className="py-2 px-3 w-28">
                              <input
                                type="number"
                                step="0.01"
                                value={row.strength}
                                onChange={(e) =>
                                  handleRoundChange(row.id, 'strength', parseFloat(e.target.value) || 0)
                                }
                                placeholder="3.5"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-emerald-800 focus:outline-none focus:bg-white"
                              />
                            </td>

                            {/* Elongation (%) */}
                            <td className="py-2 px-3 w-28">
                              <input
                                type="number"
                                step="0.1"
                                value={row.elongation}
                                onChange={(e) =>
                                  handleRoundChange(row.id, 'elongation', parseFloat(e.target.value) || 0)
                                }
                                placeholder="22"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-sky-800 focus:outline-none focus:bg-white"
                              />
                            </td>

                            {/* Tape Width (mm) */}
                            <td className="py-2 px-3 w-28">
                              <input
                                type="number"
                                step="0.1"
                                value={row.tapeWidth !== undefined ? row.tapeWidth : ''}
                                onChange={(e) =>
                                  handleRoundChange(row.id, 'tapeWidth', parseFloat(e.target.value) || 0)
                                }
                                placeholder="2.8"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-800 focus:outline-none focus:bg-white"
                              />
                            </td>

                            {/* Delete Row Button */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRoundRow(row.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Shift / Running Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder="e.g. Smooth extrusion run, checked at 2-hour intervals..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 h-10 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveReport}
                className="px-6 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>{isSubmitting ? 'Saving...' : 'Save Running Entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
