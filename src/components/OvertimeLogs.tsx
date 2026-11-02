/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { Clock, Calendar as CalendarIcon, Plus, Info, History, Trash2, Edit, Check, X, Search, Zap, Loader2, ArrowRight, UserCheck, ArrowUpDown, ArrowUp, ArrowDown, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { Employee } from '../types';
import { formatDateDDMMMYYYY } from '../utils/dateUtils';

interface OvertimeLog {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  arrTime: string; // "HH:MM"
  outTime: string; // "HH:MM"
  shiftPattern: string; // e.g. "Triple Shift", "Night Overtime", "Regular OT"
  remarks: string;
  empShift?: string; // from Employee profile
  empShiftTime?: string; // from Employee profile
  createdAt: string;
}

interface OvertimeLogsProps {
  employees: Employee[];
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
  ledgerMonth: number; // 1-indexed (e.g., 5 is May)
  ledgerYear: number;
  setLedgerMonth?: (m: number) => void;
  setLedgerYear?: (y: number) => void;
}

// Helper calculating overtime logs duration
const calculateHoursWorked = (arr: string, out: string) => {
  if (!arr || !out) return 0;
  const [arrHrs, arrMins] = arr.split(':').map(Number);
  const [outHrs, outMins] = out.split(':').map(Number);
  if (isNaN(arrHrs) || isNaN(arrMins) || isNaN(outHrs) || isNaN(outMins)) return 0;
  
  let diffMins = (outHrs * 60 + outMins) - (arrHrs * 60 + arrMins);
  if (diffMins < 0) {
    diffMins += 24 * 60; // Over midnight Cross
  }
  return diffMins / 60;
};

export default function OvertimeLogs({
  employees,
  triggerAlert,
  viewOnly = false,
  ledgerMonth,
  ledgerYear,
  setLedgerMonth,
  setLedgerYear
}: OvertimeLogsProps) {
  // --- STATE FOR FORM ---
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [arrTime, setArrTime] = useState<string>('08:00');
  const [outTime, setOutTime] = useState<string>('20:00');
  const [shiftPattern, setShiftPattern] = useState<string>('Day Overtime Shift [08:00-20:00]');
  const [remarks, setRemarks] = useState<string>('');
  
  const [formDay, setFormDay] = useState<number>(() => new Date().getDate());
  const [formMonth, setFormMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed
  const [formYear, setFormYear] = useState<number>(() => new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // --- STATE FOR EDITING ---
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  // --- STATE FOR SEARCH & FILTERS ON THE TABLE ---
  const [filterDay, setFilterDay] = useState<number>(-1); // -1 is All
  const [filterMonth, setFilterMonth] = useState<number>(-1); // -1 is All
  const [filterYear, setFilterYear] = useState<number>(ledgerYear);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // --- STATE FOR AUTOCOMPLETE IN FORM ---
  const [empSearch, setEmpSearch] = useState<string>('');
  const [showSug, setShowSug] = useState<boolean>(false);

  // --- STATE FOR DELETE CONFIRMATION ---
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // --- STATE FOR EXCEL EXPORT ---
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportMonth, setExportMonth] = useState<number>(ledgerMonth || (new Date().getMonth() + 1));
  const [exportYear, setExportYear] = useState<number>(ledgerYear || new Date().getFullYear());
  const [exportEmployeeScope, setExportEmployeeScope] = useState<'all' | 'active' | 'inactive'>('all');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Eligible employee collections for export scoping
  const totalEligibleEmployees = useMemo(() => {
    return employees.filter(emp => emp.id && !emp.id.toUpperCase().startsWith('EMP_TEMP_') && (emp.name || '').trim() !== '');
  }, [employees]);

  const activeEmployeesCount = useMemo(() => {
    return totalEligibleEmployees.filter(emp => (emp.activeStatus || 'ACTIVE').toUpperCase() === 'ACTIVE').length;
  }, [totalEligibleEmployees]);

  const inactiveEmployeesCount = useMemo(() => {
    return totalEligibleEmployees.filter(emp => (emp.activeStatus || '').toUpperCase() === 'INACTIVE').length;
  }, [totalEligibleEmployees]);

  // --- STATE FOR SORTING ---
  const [sortField, setSortField] = useState<'date' | 'employeeId' | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // --- REAL-TIME OVERTIME LOGS FROM FIRESTORE ---
  const [allLogs, setAllLogs] = useState<OvertimeLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);

  // Sync real-time stream of overtime logs
  useEffect(() => {
    setLoadingLogs(true);
    const q = collection(db, 'overtimeLogs');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: OvertimeLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push(docSnap.data() as OvertimeLog);
      });
      // Sort in descending order of createdAt
      logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllLogs(logs);
      setLoadingLogs(false);
    }, (err) => {
      console.error("Failed to stream overtime logs", err);
      setLoadingLogs(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync state when page-level ledger period changes
  useEffect(() => {
    setFilterMonth(ledgerMonth - 1);
    setFilterYear(ledgerYear);
    setFormMonth(ledgerMonth - 1);
    setFormYear(ledgerYear);
    setExportMonth(ledgerMonth);
    setExportYear(ledgerYear);
  }, [ledgerMonth, ledgerYear]);

  // Ascending-ordered valid employee active list for popover autocomplete
  const sortedEmployees = useMemo(() => {
    return [...employees]
      .filter(emp => emp.id && !emp.id.toUpperCase().startsWith('EMP_TEMP_') && emp.name)
      .sort((a, b) => {
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);
        if (isNaN(idA) && isNaN(idB)) return a.id.localeCompare(b.id);
        if (isNaN(idA)) return 1;
        if (isNaN(idB)) return -1;
        return idA - idB;
      });
  }, [employees]);

  // Current selected employee profile info
  const selectedEmployeeInfo = useMemo(() => {
    return employees.find(emp => emp.id === selectedEmpId) || null;
  }, [employees, selectedEmpId]);

  // Months array
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper days in month
  const getDaysInMonth = (year: number, monthIdx: number) => {
    return new Date(year, monthIdx + 1, 0).getDate();
  };

  const formDaysInMonth = getDaysInMonth(formYear, formMonth);

  // Keep day in check
  useEffect(() => {
    if (formDay > formDaysInMonth) {
      setFormDay(formDaysInMonth);
    }
  }, [formMonth, formYear, formDaysInMonth, formDay]);

  // ISO date mapping helper
  const formatIsoDate = (yr: number, moIdx: number, dy: number) => {
    return `${yr}-${String(moIdx + 1).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
  };

  // Pre-defined shift pattern tags for easier logging
  const patternList = [
    'Day Overtime Shift [08:00-20:00]',
    'Night Overtime Shift [20:00-08:00]'
  ];

  // Filter logs list based on form inputs / user selection
  const filteredrecordedLogs = useMemo(() => {
    const seen = new Set<string>();
    const uniqueLogs = allLogs.filter(log => {
      if (!log || !log.id) return false;
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });

    return uniqueLogs.filter(log => {
      // log.date is YYYY-MM-DD
      const dateParts = log.date.split('-');
      if (dateParts.length === 3) {
        const yr = parseInt(dateParts[0], 10);
        const mo = parseInt(dateParts[1], 10) - 1; // 0-indexed
        const dy = parseInt(dateParts[2], 10);

        const matchesYear = yr === filterYear;
        const matchesMonth = filterMonth === -1 || mo === filterMonth;
        const matchesDay = filterDay === -1 || dy === filterDay;

        // Name or ID searchQuery check
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch = !query || 
          log.employeeName.toLowerCase().includes(query) || 
          log.employeeId.toLowerCase().includes(query) ||
          (log.shiftPattern && log.shiftPattern.toLowerCase().includes(query)) ||
          (log.remarks && log.remarks.toLowerCase().includes(query));

        return matchesYear && matchesMonth && matchesDay && matchesSearch;
      }
      return false;
    });
  }, [allLogs, filterDay, filterMonth, filterYear, searchQuery]);

  // Sort filtered Overtime log entries based on active sort parameters (EMP ID or OT Date)
  const sortedRecordedLogs = useMemo(() => {
    const list = [...filteredrecordedLogs];
    if (!sortField) return list;

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = a.date.localeCompare(b.date);
      } else if (sortField === 'employeeId') {
        comparison = a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredrecordedLogs, sortField, sortDirection]);

  // Handle Form Submission (Create or Edit Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Contact authorized administrator to lock records.');
      return;
    }

    if (!selectedEmpId) {
      triggerAlert('warn', 'Please select or search an active employee profile first.');
      return;
    }

    const targetEmp = employees.find(emp => emp.id === selectedEmpId);
    if (!targetEmp) {
      triggerAlert('warn', 'Selected employee profile could not be retrieved from roster.');
      return;
    }

    if (!arrTime || !outTime) {
      triggerAlert('warn', 'Please enter valid Arrival (Arr) time and Exit (Out) time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanEmpId = selectedEmpId.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const logId = editingLogId || `OT_${Date.now()}_${cleanEmpId}`;
      const logRef = doc(db, 'overtimeLogs', logId);

      const targetIsoDate = formatIsoDate(formYear, formMonth, formDay);

      const overtimePayload: OvertimeLog = {
        id: logId,
        employeeId: selectedEmpId,
        employeeName: targetEmp.name,
        date: targetIsoDate,
        arrTime: arrTime,
        outTime: outTime,
        shiftPattern: shiftPattern,
        remarks: remarks.trim(),
        empShift: targetEmp.shift || 'N/A',
        empShiftTime: targetEmp.shiftTime || 'N/A',
        createdAt: editingLogId 
          ? (allLogs.find(l => l.id === editingLogId)?.createdAt || new Date().toISOString()) 
          : new Date().toISOString()
      };

      await setDoc(logRef, overtimePayload);

      triggerAlert(
        'success', 
        editingLogId 
          ? `Successfully updated Overtime Log record for ${targetEmp.name} (${selectedEmpId}).`
          : `Successfully registered Overtime Log for ${targetEmp.name} (${selectedEmpId}) on ${formDay} ${months[formMonth]} ${formYear}.`
      );

      // Reset
      setRemarks('');
      setEmpSearch('');
      setSelectedEmpId('');
      setArrTime('08:00');
      setOutTime('20:00');
      setShiftPattern('Day Overtime Shift [08:00-20:00]');
      setEditingLogId(null);
    } catch (err: any) {
      console.error('Error recording overtime log database entry', err);
      triggerAlert('warn', 'Failed to lock Overtime record. Check Firestore permission rule constraints.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load log data into form elements for modification
  const handleEditInit = (log: OvertimeLog) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied.');
      return;
    }

    setEditingLogId(log.id);
    setSelectedEmpId(log.employeeId);
    setEmpSearch(`${log.employeeName} (${log.employeeId})`);
    setArrTime(log.arrTime);
    setOutTime(log.outTime);
    setShiftPattern(log.shiftPattern);
    setRemarks(log.remarks || '');

    // Parse date YYYY-MM-DD
    const dateParts = log.date.split('-');
    if (dateParts.length === 3) {
      const yr = parseInt(dateParts[0], 10);
      const mo = parseInt(dateParts[1], 10) - 1;
      const dy = parseInt(dateParts[2], 10);
      setFormYear(yr);
      setFormMonth(mo);
      setFormDay(dy);
    }

    triggerAlert('info', `Loaded Overtime details of ${log.employeeName} into form. Make changes and click Save Changes.`);
  };

  // Delete matching log record
  const handleDeleteLog = async (logId: string) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'overtimeLogs', logId));
      triggerAlert('success', 'Logged Overtime record deleted successfully.');
    } catch (err) {
      console.error('Error deleting overtime log', err);
      triggerAlert('warn', 'Failed to remove entry from cloud ledger. Re-verify permissions.');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // --- EXPORT TO EXCEL (PA FORMAT WITH OVERTIME METRICS) ---
  const handleExportOvertimeReport = (
    targetMonth: number, 
    targetYear: number, 
    scope: 'all' | 'active' | 'inactive' = 'all'
  ) => {
    // targetMonth is 1-indexed (1 to 12)
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthYearText = `${shortMonths[targetMonth - 1]}-${String(targetYear).slice(-2)}`;
    const fullMonthName = months[targetMonth - 1];

    // Total days in selected month
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    // Filter relevant logs for the month
    const monthLogs = allLogs.filter(log => log && log.date && log.date.startsWith(monthStr));

    // Filter employees by scope (All, Active, Inactive)
    const eligibleBase = [...employees]
      .filter(emp => emp.id && !emp.id.toUpperCase().startsWith('EMP_TEMP_') && (emp.name || '').trim() !== '');

    let filteredByScope = eligibleBase;
    let scopeLabel = 'All Employees';
    if (scope === 'active') {
      filteredByScope = eligibleBase.filter(emp => (emp.activeStatus || 'ACTIVE').toUpperCase() === 'ACTIVE');
      scopeLabel = 'Active Employees';
    } else if (scope === 'inactive') {
      filteredByScope = eligibleBase.filter(emp => (emp.activeStatus || '').toUpperCase() === 'INACTIVE');
      scopeLabel = 'Inactive Employees';
    }

    // Sort employees: first by Department, then by Designation, then by Employee Name
    const sortedForExport = filteredByScope.sort((a, b) => {
      const deptA = (a.department || '').trim();
      const deptB = (b.department || '').trim();
      const deptComp = deptA.localeCompare(deptB, undefined, { sensitivity: 'base' });
      if (deptComp !== 0) return deptComp;

      const desA = (a.designation || a.role || '').trim();
      const desB = (b.designation || b.role || '').trim();
      const desComp = desA.localeCompare(desB, undefined, { sensitivity: 'base' });
      if (desComp !== 0) return desComp;

      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      const nameComp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (nameComp !== 0) return nameComp;

      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    if (sortedForExport.length === 0) {
      triggerAlert('warn', `No ${scopeLabel.toLowerCase()} found for export.`);
      return;
    }

    // Determine max day with logs in the selected month
    const activeDatesSet = new Set<string>();
    monthLogs.forEach(l => {
      if (l.date) activeDatesSet.add(l.date);
    });

    let maxDayWithLogs = 0;
    activeDatesSet.forEach(dateStr => {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = parseInt(parts[2], 10);
        if (!isNaN(d) && d > maxDayWithLogs) {
          maxDayWithLogs = d;
        }
      }
    });

    const now = new Date();
    const currentYr = now.getFullYear();
    const currentMo = now.getMonth() + 1; // 1-indexed
    const isPastMonth = targetYear < currentYr || (targetYear === currentYr && targetMonth < currentMo);
    const isCurrentMonth = targetYear === currentYr && targetMonth === currentMo;
    const effectiveCutoffDay = isPastMonth 
      ? daysInMonth 
      : (isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : maxDayWithLogs);

    // ================= SHEET 1: OVERTIME P-A REPORT =================
    const titleRow = [`Monthly Overtime Attendance Report (${scopeLabel}) - ${fullMonthName} ${targetYear} (${monthYearText})`];
    const headerRow = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Designation',
      'Total Number of Overtime Shifts',
      'Total Number of Overtime Hours'
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      headerRow.push(String(d));
    }
    headerRow.push('Total OT Days');
    headerRow.push('Estimated OT Pay (₹)');

    const rows: any[][] = [
      titleRow,
      headerRow
    ];

    // Tracking grand totals
    let grandTotalShifts = 0;
    let grandTotalHours = 0;
    let grandTotalOtDays = 0;
    let grandTotalEstPay = 0;
    const dailyOtHeadcount: number[] = new Array(daysInMonth).fill(0);

    sortedForExport.forEach((emp) => {
      const empCode = emp.id;
      const empName = emp.name || '';
      const dept = emp.department || 'Unassigned';
      const designation = emp.designation || '-';

      // Find all overtime logs for this employee in this month
      const empMonthLogs = monthLogs.filter(l => l.employeeId === emp.id);

      // Total hours and shifts
      const totalEmpHours = Math.round(
        empMonthLogs.reduce((acc, l) => acc + calculateHoursWorked(l.arrTime, l.outTime), 0) * 100
      ) / 100;

      // Overtime shifts (12 hours = 1 shift standard)
      const totalEmpShifts = totalEmpHours > 0
        ? (totalEmpHours % 12 === 0 ? totalEmpHours / 12 : Math.round((totalEmpHours / 12) * 100) / 100)
        : 0;

      // Estimated OT Pay
      const monthlySalary = emp.monthlySalary || 0;
      const otDailyRate = emp.salaryType === 'daily'
        ? monthlySalary
        : (daysInMonth > 0 ? monthlySalary / daysInMonth : 0);
      const estEmpPay = Math.round((totalEmpHours / 12) * otDailyRate);

      let empOtDaysCount = 0;
      const datePAValues: string[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayLogs = empMonthLogs.filter(l => l.date === dateStr);
        const dayHours = dayLogs.reduce((acc, l) => acc + calculateHoursWorked(l.arrTime, l.outTime), 0);

        if (dayHours > 0 || dayLogs.length > 0) {
          datePAValues.push('P');
          empOtDaysCount++;
          dailyOtHeadcount[d - 1]++;
        } else {
          // If no overtime worked on this day
          if (d <= effectiveCutoffDay) {
            datePAValues.push('A');
          } else {
            datePAValues.push('');
          }
        }
      }

      grandTotalShifts += totalEmpShifts;
      grandTotalHours += totalEmpHours;
      grandTotalOtDays += empOtDaysCount;
      grandTotalEstPay += estEmpPay;

      const empRow = [
        empCode,
        empName,
        dept,
        designation,
        totalEmpShifts,
        totalEmpHours,
        ...datePAValues,
        empOtDaysCount,
        estEmpPay
      ];

      rows.push(empRow);
    });

    // Summary / Total Row at the bottom
    const summaryRow = [
      'Total Summary',
      `${sortedForExport.length} Staff`,
      'ALL DEPTS',
      '-',
      Math.round(grandTotalShifts * 100) / 100,
      Math.round(grandTotalHours * 100) / 100,
      ...dailyOtHeadcount.map(count => (count > 0 ? count : '-')),
      grandTotalOtDays,
      Math.round(grandTotalEstPay)
    ];
    rows.push(summaryRow);

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    const getCellRef = (c: number, r: number): string => {
      let colName = '';
      let temp = c;
      while (temp >= 0) {
        colName = String.fromCharCode((temp % 26) + 65) + colName;
        temp = Math.floor(temp / 26) - 1;
      }
      return `${colName}${r + 1}`;
    };

    // Styling
    const titleStyle = {
      font: { bold: true, name: "Calibri", sz: 12, color: { rgb: "1F497D" } },
      alignment: { horizontal: 'left', vertical: 'center' }
    };

    const headerStyle = {
      fill: { fgColor: { rgb: "F2F2F2" } },
      font: { bold: true, name: "Calibri", sz: 10, color: { rgb: "000000" } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: "D9D9D9" } },
        bottom: { style: 'medium', color: { rgb: "808080" } },
        left: { style: 'thin', color: { rgb: "D9D9D9" } },
        right: { style: 'thin', color: { rgb: "D9D9D9" } }
      }
    };

    const presentStyle = {
      fill: { fgColor: { rgb: "C6EFCE" } },
      font: { color: { rgb: "006100" }, bold: true, name: "Calibri", sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: "E0E0E0" } },
        bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
        left: { style: 'thin', color: { rgb: "E0E0E0" } },
        right: { style: 'thin', color: { rgb: "E0E0E0" } }
      }
    };

    const shortHoursStyle = {
      fill: { fgColor: { rgb: "FFEB9C" } },
      font: { color: { rgb: "9C6500" }, bold: true, name: "Calibri", sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: "E0E0E0" } },
        bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
        left: { style: 'thin', color: { rgb: "E0E0E0" } },
        right: { style: 'thin', color: { rgb: "E0E0E0" } }
      }
    };

    const absentStyle = {
      fill: { fgColor: { rgb: "FFC7CE" } },
      font: { color: { rgb: "9C0006" }, bold: true, name: "Calibri", sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: "E0E0E0" } },
        bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
        left: { style: 'thin', color: { rgb: "E0E0E0" } },
        right: { style: 'thin', color: { rgb: "E0E0E0" } }
      }
    };

    const summaryCountStyle = {
      font: { bold: true, name: "Calibri", sz: 10, color: { rgb: "1F497D" } },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const totalSummaryRowStyle = {
      fill: { fgColor: { rgb: "E9EEF4" } },
      font: { bold: true, name: "Calibri", sz: 10, color: { rgb: "1F497D" } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: "1F497D" } },
        bottom: { style: 'double', color: { rgb: "1F497D" } }
      }
    };

    const infoStyle = {
      font: { name: "Calibri", sz: 10 },
      alignment: { horizontal: 'left', vertical: 'center' }
    };

    const normalCenterStyle = {
      font: { name: "Calibri", sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const totalRowIndex = rows.length - 1;

    for (let r = 0; r < rows.length; r++) {
      const rowData = rows[r];
      for (let c = 0; c < rowData.length; c++) {
        const cellRef = getCellRef(c, r);
        if (!worksheet[cellRef]) continue;

        if (r === 0) {
          worksheet[cellRef].s = titleStyle;
        } else if (r === 1) {
          worksheet[cellRef].s = headerStyle;
        } else if (r === totalRowIndex) {
          worksheet[cellRef].s = totalSummaryRowStyle;
        } else {
          // Employee rows (r >= 2 && r < totalRowIndex)
          const emp = sortedForExport[r - 2];
          if (c === 0) {
            worksheet[cellRef].s = normalCenterStyle;
          } else if (c === 1 || c === 2 || c === 3) {
            worksheet[cellRef].s = infoStyle;
          } else if (c === 4 || c === 5) {
            worksheet[cellRef].s = summaryCountStyle;
          } else if (c >= 6 && c < 6 + daysInMonth) {
            const val = worksheet[cellRef].v;
            const d = c - 5; // 1-based day
            const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayLogs = monthLogs.filter(l => l.employeeId === emp.id && l.date === dateStr);
            const dayHours = dayLogs.reduce((acc, l) => acc + calculateHoursWorked(l.arrTime, l.outTime), 0);

            if (val === 'P') {
              // 85% rule: 85% of 12-hour shift = 10.2 hours
              if (dayHours > 0 && dayHours < 10.2) {
                worksheet[cellRef].s = shortHoursStyle;
              } else {
                worksheet[cellRef].s = presentStyle;
              }
            } else if (val === 'A') {
              worksheet[cellRef].s = absentStyle;
            } else {
              worksheet[cellRef].s = normalCenterStyle;
            }
          } else {
            // Extra summary columns: Total OT Days & Estimated OT Pay
            worksheet[cellRef].s = summaryCountStyle;
          }
        }
      }
    }

    // Column widths
    const colWidths = [
      { wch: 14 }, // Employee Code
      { wch: 24 }, // Employee Name
      { wch: 18 }, // Department
      { wch: 20 }, // Designation
      { wch: 30 }, // Total Number of Overtime Shifts
      { wch: 28 }, // Total Number of Overtime Hours
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      colWidths.push({ wch: 5 });
    }
    colWidths.push({ wch: 15 }); // Total OT Days
    colWidths.push({ wch: 22 }); // Estimated OT Pay (₹)
    worksheet['!cols'] = colWidths;

    // Freeze panes: first 6 columns frozen (Emp Code, Name, Dept, Designation, Shifts, Hours), top 2 rows frozen
    worksheet['!views'] = [
      { state: 'frozen', ySplit: 2, xSplit: 6, topLeftCell: 'G3', activePane: 'bottomRight' }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, `Overtime P-A`);

    // ================= SHEET 2: OVERTIME DAILY HOURS =================
    const hoursHeaderRow = [
      'Employee Code',
      'Employee Name',
      'Department',
      'Designation',
      'Total OT Hours',
      'Total OT Shifts'
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      hoursHeaderRow.push(String(d));
    }
    hoursHeaderRow.push('Estimated OT Pay (₹)');

    const hoursRows: any[][] = [
      [`Daily Overtime Hours Report - ${fullMonthName} ${targetYear}`],
      hoursHeaderRow
    ];

    const dailyTotalHoursCol: number[] = new Array(daysInMonth).fill(0);

    sortedForExport.forEach((emp) => {
      const empMonthLogs = monthLogs.filter(l => l.employeeId === emp.id);
      const totalEmpHours = Math.round(
        empMonthLogs.reduce((acc, l) => acc + calculateHoursWorked(l.arrTime, l.outTime), 0) * 100
      ) / 100;
      const totalEmpShifts = totalEmpHours > 0
        ? (totalEmpHours % 12 === 0 ? totalEmpHours / 12 : Math.round((totalEmpHours / 12) * 100) / 100)
        : 0;

      const monthlySalary = emp.monthlySalary || 0;
      const otDailyRate = emp.salaryType === 'daily'
        ? monthlySalary
        : (daysInMonth > 0 ? monthlySalary / daysInMonth : 0);
      const estEmpPay = Math.round((totalEmpHours / 12) * otDailyRate);

      const dayHoursArr: any[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayLogs = empMonthLogs.filter(l => l.date === dateStr);
        const dayHours = dayLogs.reduce((acc, l) => acc + calculateHoursWorked(l.arrTime, l.outTime), 0);
        if (dayHours > 0) {
          const rounded = Math.round(dayHours * 100) / 100;
          dayHoursArr.push(rounded);
          dailyTotalHoursCol[d - 1] += rounded;
        } else {
          dayHoursArr.push(d <= effectiveCutoffDay ? 0 : '-');
        }
      }

      hoursRows.push([
        emp.id,
        emp.name || '',
        emp.department || 'Unassigned',
        emp.designation || '-',
        totalEmpHours,
        totalEmpShifts,
        ...dayHoursArr,
        estEmpPay
      ]);
    });

    // Total hours footer
    hoursRows.push([
      'Total Overtime Hours',
      `${sortedForExport.length} Staff`,
      'ALL DEPTS',
      '-',
      Math.round(grandTotalHours * 100) / 100,
      Math.round(grandTotalShifts * 100) / 100,
      ...dailyTotalHoursCol.map(h => (h > 0 ? Math.round(h * 10) / 10 : '-')),
      Math.round(grandTotalEstPay)
    ]);

    const hoursWorksheet = XLSX.utils.aoa_to_sheet(hoursRows);
    hoursWorksheet['!cols'] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      ...Array.from({ length: daysInMonth }, () => ({ wch: 6 })),
      { wch: 22 }
    ];
    hoursWorksheet['!views'] = [
      { state: 'frozen', ySplit: 2, xSplit: 6, topLeftCell: 'G3', activePane: 'bottomRight' }
    ];

    // Apply styles to Sheet 2
    for (let r = 0; r < hoursRows.length; r++) {
      for (let c = 0; c < hoursRows[r].length; c++) {
        const cellRef = getCellRef(c, r);
        if (!hoursWorksheet[cellRef]) continue;
        if (r === 0) hoursWorksheet[cellRef].s = titleStyle;
        else if (r === 1) hoursWorksheet[cellRef].s = headerStyle;
        else if (r === hoursRows.length - 1) hoursWorksheet[cellRef].s = totalSummaryRowStyle;
        else {
          if (c === 0) hoursWorksheet[cellRef].s = normalCenterStyle;
          else if (c >= 1 && c <= 3) hoursWorksheet[cellRef].s = infoStyle;
          else hoursWorksheet[cellRef].s = summaryCountStyle;
        }
      }
    }

    XLSX.utils.book_append_sheet(workbook, hoursWorksheet, `Overtime Daily Hours`);

    // ================= SHEET 3: ALL OVERTIME LOGS REGISTER =================
    const logRegisterRows: any[][] = [
      [`Detailed Overtime Logs Register - ${fullMonthName} ${targetYear}`],
      [
        'Log Date',
        'Day',
        'Employee Code',
        'Employee Name',
        'Department',
        'Designation',
        'In Time',
        'Out Time',
        'Hours Worked',
        'Equivalent Shifts (12h)',
        'Shift Pattern',
        'Remarks / Notes'
      ]
    ];

    // Sort monthLogs by date ascending, then employeeId ascending
    const sortedMonthLogs = [...monthLogs].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const numA = parseInt(a.employeeId, 10);
      const numB = parseInt(b.employeeId, 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
      return a.employeeId.localeCompare(b.employeeId);
    });

    sortedMonthLogs.forEach(log => {
      const emp = employees.find(e => e.id === log.employeeId);
      const hrs = calculateHoursWorked(log.arrTime, log.outTime);
      const shifts = hrs > 0 ? (hrs % 12 === 0 ? hrs / 12 : Math.round((hrs / 12) * 100) / 100) : 0;
      const dateObj = new Date(log.date);
      const dayName = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString('en-US', { weekday: 'short' });

      logRegisterRows.push([
        log.date,
        dayName,
        log.employeeId,
        log.employeeName || emp?.name || '',
        emp?.department || 'Unassigned',
        emp?.designation || '-',
        log.arrTime || '-',
        log.outTime || '-',
        Math.round(hrs * 100) / 100,
        shifts,
        log.shiftPattern || 'Overtime Shift',
        log.remarks || '-'
      ]);
    });

    const logsWorksheet = XLSX.utils.aoa_to_sheet(logRegisterRows);
    logsWorksheet['!cols'] = [
      { wch: 14 }, // Date
      { wch: 8 },  // Day
      { wch: 14 }, // Employee Code
      { wch: 24 }, // Employee Name
      { wch: 18 }, // Department
      { wch: 20 }, // Designation
      { wch: 12 }, // In Time
      { wch: 12 }, // Out Time
      { wch: 14 }, // Hours Worked
      { wch: 22 }, // Equivalent Shifts
      { wch: 28 }, // Shift Pattern
      { wch: 35 }  // Remarks
    ];
    logsWorksheet['!views'] = [
      { state: 'frozen', ySplit: 2, xSplit: 0, topLeftCell: 'A3', activePane: 'bottomLeft' }
    ];

    for (let r = 0; r < logRegisterRows.length; r++) {
      for (let c = 0; c < logRegisterRows[r].length; c++) {
        const cellRef = getCellRef(c, r);
        if (!logsWorksheet[cellRef]) continue;
        if (r === 0) logsWorksheet[cellRef].s = titleStyle;
        else if (r === 1) logsWorksheet[cellRef].s = headerStyle;
        else {
          if (c === 0 || c === 1 || c === 2 || c === 6 || c === 7) logsWorksheet[cellRef].s = normalCenterStyle;
          else if (c === 8 || c === 9) logsWorksheet[cellRef].s = summaryCountStyle;
          else logsWorksheet[cellRef].s = infoStyle;
        }
      }
    }

    XLSX.utils.book_append_sheet(workbook, logsWorksheet, `Overtime Logs Register`);

    // Write file
    const scopeSlug = scope === 'all' ? 'AllStaff' : (scope === 'active' ? 'Active' : 'Inactive');
    XLSX.writeFile(workbook, `Monthly_Overtime_Report_${scopeSlug}_${monthYearText}.xlsx`);
    triggerAlert('success', `Exported Overtime Attendance Excel report for ${sortedForExport.length} ${scopeLabel.toLowerCase()} (${fullMonthName} ${targetYear})`);
  };

  const handleTriggerExport = () => {
    setIsExporting(true);
    try {
      handleExportOvertimeReport(exportMonth, exportYear, exportEmployeeScope);
      setShowExportModal(false);
    } catch (err: any) {
      console.error('Export failed', err);
      triggerAlert('warn', 'Failed to generate Overtime Excel report. Please verify browser permissions.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full flex flex-col font-sans text-slate-705 animate-fade-in pb-10" id="overtime-employee-logs-panel">
      
      {/* Page Header Title */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Zap className="text-emerald-500 animate-pulse" size={24} />
            Employee Overtime Logs
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Registry to log and search overtime profiles, triple shift consecutive hours, and active work patterns
          </p>
        </div>

        {/* Display Period Filter selectors & Export Excel button unified in the same line */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-slate-100/80 border border-slate-200/60 rounded-2xl p-1.5 flex items-center gap-2 text-xs font-semibold text-slate-550 shadow-sm flex-nowrap">
            <div className="flex items-center gap-1.5 pl-2">
              <CalendarIcon size={15} className="text-emerald-500 shrink-0" />
              <span className="shrink-0 font-bold uppercase tracking-wider text-[10px] text-slate-450 hidden sm:inline">Active Ledger:</span>
            </div>
            
            <select
              value={filterMonth}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFilterMonth(val);
                if (val !== -1) {
                  setExportMonth(val + 1);
                  if (setLedgerMonth) setLedgerMonth(val + 1);
                }
              }}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            >
              <option value={-1}>All Months</option>
              {months.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>

            <select
              value={filterYear}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFilterYear(val);
                setExportYear(val);
                if (setLedgerYear) {
                  setLedgerYear(val);
                }
              }}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <div className="h-5 w-px bg-slate-300 mx-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl px-3.5 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider shadow-sm hover:shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Export Monthly Overtime Report to Excel (.xlsx)"
            >
              <FileSpreadsheet size={15} className="text-emerald-200 shrink-0" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="overtime-logs-main-grid">
        
        {/* ================= LEFT GRID: FORM CARD ================= */}
        <div className="lg:col-span-5 flex flex-col gap-6" id="overtime-logs-form-container">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${editingLogId ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                {editingLogId ? <Edit size={16} /> : <Plus size={16} />}
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  {editingLogId ? 'Edit Overtime Log' : 'Log Employee Overtime'}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  {editingLogId ? `Updating record of ${selectedEmployeeInfo?.name || 'Staff'}` : 'Submit overtime work schedule details'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-sans">
              
              {/* Employee Autocomplete Select Box */}
              <div className="relative">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  1. Search Registered Staff <span className="text-rose-500 font-bold">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Type name or code to query..."
                    value={empSearch}
                    onChange={(e) => {
                      setEmpSearch(e.target.value);
                      setShowSug(true);
                      if (!e.target.value) {
                        setSelectedEmpId('');
                      }
                    }}
                    onFocus={() => setShowSug(true)}
                    onBlur={() => setTimeout(() => setShowSug(false), 250)}
                    disabled={!!editingLogId}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-9 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75"
                  />
                  {empSearch && !editingLogId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmpSearch('');
                        setSelectedEmpId('');
                      }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-black p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {showSug && !editingLogId && (
                  <div className="absolute z-30 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 font-medium">
                    {sortedEmployees
                      .filter(emp => {
                        const q = empSearch.toLowerCase().trim();
                        return (
                          emp.name.toLowerCase().includes(q) ||
                          emp.id.toLowerCase().includes(q)
                        );
                      })
                      .map(emp => (
                        <button
                          key={emp.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedEmpId(emp.id);
                            setEmpSearch(`${emp.name} (${emp.id})`);
                            setShowSug(false);
                          }}
                          className="w-full text-left py-2.5 px-4 text-xs hover:bg-emerald-50/70 hover:text-emerald-850 flex items-center justify-between font-bold"
                        >
                          <span className="text-slate-800">{emp.name}</span>
                          <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black">Code {emp.id}</span>
                        </button>
                      ))}
                    {sortedEmployees.filter(emp => {
                      const q = empSearch.toLowerCase().trim();
                      return emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="py-3 px-4 text-xs italic text-slate-400 text-center uppercase tracking-wider font-bold">
                        No employees found matching query
                      </div>
                    )}
                  </div>
                )}

                {/* Legacy Alternative Select Dropdown */}
                <div className="mt-2 text-[10px] text-slate-400">
                  <span className="font-bold">OR select directly from listing dropdown:</span>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => {
                      const idVal = e.target.value;
                      setSelectedEmpId(idVal);
                      if (idVal) {
                        const matching = sortedEmployees.find(emp => emp.id === idVal);
                        if (matching) {
                          setEmpSearch(`${matching.name} (${matching.id})`);
                        }
                      } else {
                        setEmpSearch('');
                      }
                    }}
                    disabled={!!editingLogId}
                    className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-bold text-slate-700 cursor-pointer focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 text-ellipsis select-text"
                  >
                    <option value="">-- Choose Staff Profile --</option>
                    {sortedEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} (Code {emp.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Employee Metadata Badge Info */}
              {selectedEmployeeInfo && (
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3.5 text-xs text-emerald-800 animate-fadeIn flex flex-col gap-1 md:gap-1.5 font-bold">
                  <div className="flex items-center gap-1.5">
                    <UserCheck size={14} className="text-emerald-600 animate-pulse shrink-0" />
                    <span className="font-black uppercase tracking-wider text-[9.5px] text-emerald-700">Matched Roster Employee Details:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-[10.5px]">
                    <div className="bg-white/80 px-2 py-1.5 rounded-lg border border-emerald-100">
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold leading-none mb-0.5">Assigned Shift</span>
                      <span className="font-black uppercase text-slate-800 inline-flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedEmployeeInfo.shift === 'NIGHT' ? 'bg-amber-400' : 'bg-emerald-500'}`}></span>
                        {selectedEmployeeInfo.shift || 'DAY'}
                      </span>
                    </div>
                    <div className="bg-white/80 px-2 py-1.5 rounded-lg border border-emerald-100">
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold leading-none mb-0.5">Shift Hours</span>
                      <span className="font-black text-slate-705 font-mono">{selectedEmployeeInfo.shiftTime || '08:00 - 20:00'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Time Fields & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                
                {/* Date Dropdowns */}
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                    2. Overtime Date Info <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    
                    {/* Day */}
                    <select
                      value={formDay}
                      onChange={(e) => setFormDay(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
                    >
                      {Array.from({ length: formDaysInMonth }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>

                    {/* Month */}
                    <select
                      value={formMonth}
                      onChange={(e) => setFormMonth(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-1 hover:bg-white text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
                    >
                      {months.map((m, idx) => (
                        <option key={idx} value={idx}>
                          {m.slice(0, 3)}
                        </option>
                      ))}
                    </select>

                    {/* Year */}
                    <select
                      value={formYear}
                      onChange={(e) => setFormYear(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>

                  </div>
                </div>

                {/* Arr Time */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                    Arr Time <span className="text-emerald-600 font-bold">(In)</span>
                  </label>
                  <input
                    type="text"
                    value={arrTime}
                    placeholder="e.g. 08:00"
                    onChange={(e) => setArrTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-slate-700 text-center focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Out Time */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                    Out Time <span className="text-rose-500 font-bold">(Out)</span>
                  </label>
                  <input
                    type="text"
                    value={outTime}
                    placeholder="e.g. 20:00"
                    onChange={(e) => setOutTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-slate-700 text-center focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Pattern Suggestion Badge helpers */}
                <div className="flex flex-col justify-end text-[10px] text-slate-400 font-semibold mb-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => { setArrTime('08:00'); setOutTime('20:00'); }}
                      className="bg-slate-150/50 hover:bg-emerald-50 hover:text-emerald-700 rounded px-1.5 py-0.5"
                    >
                      Day bounds
                    </button>
                    <button
                      type="button"
                      onClick={() => { setArrTime('20:00'); setOutTime('08:00'); }}
                      className="bg-slate-150/50 hover:bg-indigo-50 hover:text-indigo-750 rounded px-1.5 py-0.5"
                    >
                      Night bounds
                    </button>
                  </div>
                </div>

              </div>

              {/* Shift Work Pattern */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  3. Overtime Type / Shift Pattern <span className="text-rose-500 font-bold">*</span>
                </label>
                <select
                  value={shiftPattern}
                  onChange={(e) => setShiftPattern(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                >
                  {patternList.map((pat, idx) => (
                    <option key={idx} value={pat}>
                      {pat}
                    </option>
                  ))}
                  <option value="Custom Shift Pattern">Custom Shift Duration</option>
                </select>
                
                {shiftPattern === 'Custom Shift Pattern' && (
                  <input
                    type="text"
                    placeholder="Specify custom shift description (e.g. Triple Shift overlap)"
                    onChange={(e) => setShiftPattern(e.target.value)}
                    className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none"
                  />
                )}
              </div>

              {/* Remarks Box */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  4. Overtime Work Log Remarks
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Record reasons, triple shift sequence details, or any other critical operational annotations..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-ellipsis select-text"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2.5 mt-2">
                {editingLogId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLogId(null);
                      setSelectedEmpId('');
                      setEmpSearch('');
                      setArrTime('08:00');
                      setOutTime('20:00');
                      setRemarks('');
                      setShiftPattern('Day Overtime Shift [08:00-20:00]');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs tracking-wider uppercase transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`py-3 px-4.5 rounded-xl capitalize font-black text-xs tracking-wider uppercase text-white shadow-md transition-all cursor-pointer ${
                    editingLogId ? 'flex-[2]' : 'w-full'
                  } ${
                    isSubmitting
                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                      : editingLogId
                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10 animate-pulse'
                        : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/10'
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-1">
                      <Loader2 className="animate-spin" size={14} />
                      Saving...
                    </span>
                  ) : editingLogId ? (
                    'Save Changes'
                  ) : (
                    'Record Overtime Log'
                  )}
                </button>
              </div>

            </form>

          </div>

          {/* Quick Informational Tip Card */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex gap-3 text-slate-550 animate-fadeIn" id="overtime-info-alert">
            <Info className="text-emerald-500 shrink-0 mt-0.5" size={16} />
            <div className="text-[11px] font-medium leading-normal select-text">
              <span className="font-extrabold text-slate-700 block uppercase tracking-wider text-[9.5px] mb-1">Shift Pattern Explanations</span>
              Day shift hours run from <span className="font-bold text-slate-800">08:00 to 20:00</span>. For triple-shift consecutive working models, log separate sequential rows or specify the duration in work remarks to keep accurate records for audits.
            </div>
          </div>
        </div>

        {/* ================= RIGHT GRID: REAL-TIME SEARCHABLE LOGS TABLE ================= */}
        <div className="lg:col-span-7 flex flex-col min-h-[400px]" id="overtime-logs-table-container">
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm flex flex-col flex-1 h-full">
            
            {/* Table Filters Panel */}
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 mb-4" id="overtime-logs-filter-group">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <History className="text-slate-550 animate-pulse" size={17} />
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Recorded Overtime Logs History
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2.5 py-1 rounded-full font-mono animate-fadeIn">
                    {filteredrecordedLogs.length} Records Found
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (filterMonth !== -1) setExportMonth(filterMonth + 1);
                      if (filterYear) setExportYear(filterYear);
                      setShowExportModal(true);
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Export Overtime Report to Excel"
                  >
                    <Download size={12} className="text-emerald-700" />
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              {/* Day, Month, Year search and filter metrics */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs">
                
                {/* Employee / Remarks fuzzy query search */}
                <div className="md:col-span-6 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder="Search name, code,Remarks,Pattern..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-8 pr-4.5 text-[11px] font-bold text-slate-750 placeholder-slate-400 focus:bg-white focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Specific Day filer dropdown */}
                <div className="md:col-span-3">
                  <select
                    value={filterDay}
                    onChange={(e) => setFilterDay(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2 text-[11px] font-bold text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value={-1}>All Days</option>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Day {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Specific Month filter dropdown */}
                <div className="md:col-span-3">
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2 text-[11px] font-bold text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value={-1}>All Months</option>
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            </div>

            {loadingLogs ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1 gap-2.5">
                <Loader2 size={32} className="text-emerald-500 animate-spin" />
                <span className="text-xs text-slate-400 font-extrabold uppercase font-mono tracking-wider">Syncing Cloud Logs...</span>
              </div>
            ) : filteredrecordedLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 flex-1 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center px-4.5 text-xs text-slate-400 select-text font-bold">
                <Clock className="text-slate-300 stroke-[1.5] mb-2" size={32} />
                <p className="uppercase tracking-wide">No Overtime logs recorded</p>
                <p className="text-[10px] text-slate-350 font-medium normal-case mt-0.5">
                  Refine filter selections above or record a new overtime log entry on the left panel
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto text-[11px] flex-1 max-h-[500px] overflow-y-auto pr-1">
                <table className="w-full text-left border-collapse select-text relative">
                  <thead>
                    <tr className="border-b border-slate-150 text-[9px] font-black tracking-wider text-slate-400 uppercase sticky top-0 bg-white z-10 select-none">
                      <th 
                        className="py-2.5 pr-2 cursor-pointer hover:text-slate-700 transition-colors"
                        onClick={() => {
                          if (sortField === 'employeeId') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('employeeId');
                            setSortDirection('asc');
                          }
                        }}
                        title="Sort by Emp ID"
                      >
                        <span className="inline-flex items-center gap-1">
                          Emp ID
                          {sortField === 'employeeId' ? (
                            sortDirection === 'asc' ? <ArrowUp size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-emerald-500" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-300" />
                          )}
                        </span>
                      </th>
                      <th className="py-2.5 pr-2">Employee Name</th>
                      <th 
                        className="py-2.5 pr-2 cursor-pointer hover:text-slate-700 transition-colors"
                        onClick={() => {
                          if (sortField === 'date') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField('date');
                            setSortDirection('asc');
                          }
                        }}
                        title="Sort by OT Date"
                      >
                        <span className="inline-flex items-center gap-1">
                          OT Date
                          {sortField === 'date' ? (
                            sortDirection === 'asc' ? <ArrowUp size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-emerald-500" />
                          ) : (
                            <ArrowUpDown size={11} className="text-slate-300" />
                          )}
                        </span>
                      </th>
                      <th className="py-2.5 pr-2">Times (Arr-Out)</th>
                      <th className="py-2.5 pr-2">Shift Pattern / Remarks</th>
                      <th className="py-2.5 text-right pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {sortedRecordedLogs.map((log) => {
                      // Format log date to show neatly, standard ISO is YYYY-MM-DD
                      const displayDateStr = formatDateDDMMMYYYY(log.date);

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3 font-mono font-black text-slate-600">{log.employeeId}</td>
                          <td className="py-3 font-extrabold text-slate-800 whitespace-nowrap">{log.employeeName}</td>
                          <td className="py-3 font-mono font-bold text-slate-500 whitespace-nowrap uppercase text-[9.5px]">
                            {displayDateStr}
                          </td>
                          <td className="py-3 whitespace-nowrap text-slate-650">
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-bold flex items-center gap-1 text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded-lg border border-slate-200">
                                {log.arrTime} <ArrowRight size={8} className="text-slate-400" /> {log.outTime}
                              </span>
                              <span className="text-[9.5px] text-emerald-600 font-black font-mono">
                                ⏱️ {calculateHoursWorked(log.arrTime, log.outTime).toFixed(1)} hrs ({Math.min(100, (calculateHoursWorked(log.arrTime, log.outTime) / 12 * 100)).toFixed(0)}% Shift)
                              </span>
                            </div>
                          </td>
                          <td className="py-3 font-medium max-w-[200px]">
                            <div className="text-[10.5px] font-black text-emerald-800 uppercase tracking-tight truncate" title={log.shiftPattern}>
                              {log.shiftPattern}
                            </div>
                            {log.remarks ? (
                              <div className="text-[10px] text-slate-450 italic uppercase truncate font-medium mt-0.5" title={log.remarks}>
                                "{log.remarks}"
                              </div>
                            ) : (
                              <div className="text-[9.5px] text-slate-350 italic">No remarks</div>
                            )}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap pr-1.5">
                            {deleteConfirmId === log.id ? (
                              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[10px]">
                                <span className="text-rose-700 font-extrabold uppercase text-[9px] font-sans">Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="text-emerald-700 hover:text-emerald-900 font-black p-0.5"
                                  title="Yes, delete confirm"
                                >
                                  <Check size={14} className="stroke-[3]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-rose-700 hover:text-rose-900 font-black p-0.5"
                                  title="Cancel"
                                >
                                  <X size={14} className="stroke-[3]" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex gap-1 animate-fadeIn">
                                <button
                                  type="button"
                                  onClick={() => handleEditInit(log)}
                                  disabled={viewOnly}
                                  className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-100/55 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                  title="Edit entry"
                                >
                                  <Edit size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(log.id)}
                                  disabled={viewOnly}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
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

      </div>

      {/* ================= MODAL: EXPORT OVERTIME TO EXCEL ================= */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col animate-scaleUp">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-white shadow-inner">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">Export Overtime Report</h3>
                  <p className="text-[11px] text-emerald-100 font-medium">
                    Generate PA attendance format Excel report for all employees
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl p-1.5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5">
              
              {/* 1. Employee Scope Selection (3 Options) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    1. Select Employee Category <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">Choose which staff to include</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {/* Option 1: All Employees */}
                  <button
                    type="button"
                    onClick={() => setExportEmployeeScope('all')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      exportEmployeeScope === 'all'
                        ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 shadow-sm ring-2 ring-emerald-500/25'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 w-full">
                      <span className="text-[11px] font-black uppercase tracking-tight">All Staff</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        exportEmployeeScope === 'all' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                      }`}>
                        {exportEmployeeScope === 'all' && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900">{totalEligibleEmployees.length} Staff</span>
                    <span className="text-[9.5px] text-slate-450 font-semibold mt-0.5">Active & Inactive</span>
                  </button>

                  {/* Option 2: Active Employees */}
                  <button
                    type="button"
                    onClick={() => setExportEmployeeScope('active')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      exportEmployeeScope === 'active'
                        ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 shadow-sm ring-2 ring-emerald-500/25'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 w-full">
                      <span className="text-[11px] font-black uppercase tracking-tight text-emerald-800">Active</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        exportEmployeeScope === 'active' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                      }`}>
                        {exportEmployeeScope === 'active' && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900">{activeEmployeesCount} Staff</span>
                    <span className="text-[9.5px] text-emerald-650 font-semibold mt-0.5">Currently Working</span>
                  </button>

                  {/* Option 3: Inactive Employees */}
                  <button
                    type="button"
                    onClick={() => setExportEmployeeScope('inactive')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      exportEmployeeScope === 'inactive'
                        ? 'border-amber-500 bg-amber-50/80 text-amber-950 shadow-sm ring-2 ring-amber-500/25'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 w-full">
                      <span className="text-[11px] font-black uppercase tracking-tight text-amber-800">Inactive</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        exportEmployeeScope === 'inactive' ? 'border-amber-600 bg-amber-600' : 'border-slate-300 bg-white'
                      }`}>
                        {exportEmployeeScope === 'inactive' && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                    </div>
                    <span className="text-xs font-black text-slate-900">{inactiveEmployeesCount} Staff</span>
                    <span className="text-[9.5px] text-amber-650 font-semibold mt-0.5">Exited / Resigned</span>
                  </button>
                </div>
              </div>

              {/* 2. Month and Year Selectors */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  2. Select Report Period
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-[9.5px] font-bold text-slate-500 mb-1">Month</span>
                    <select
                      value={exportMonth}
                      onChange={(e) => setExportMonth(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 cursor-pointer focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {months.map((m, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-[9.5px] font-bold text-slate-500 mb-1">Year</span>
                    <select
                      value={exportYear}
                      onChange={(e) => setExportYear(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 cursor-pointer focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Report Structure Specifications */}
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col gap-2.5 text-xs">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Info size={13} className="text-emerald-600" />
                  Report Specifications & Included Columns
                </span>
                <ul className="text-[11px] text-slate-650 space-y-1 font-medium list-disc list-inside">
                  <li><strong className="text-slate-800">Filtered Target:</strong> {exportEmployeeScope === 'all' ? `All ${totalEligibleEmployees.length} registered employees` : exportEmployeeScope === 'active' ? `${activeEmployeesCount} active employees` : `${inactiveEmployeesCount} inactive employees`}</li>
                  <li><strong className="text-slate-800">Sorted by:</strong> Department &rarr; Designation &rarr; Employee Name</li>
                  <li><strong className="text-slate-800">Required Columns:</strong> Employee Code, Employee Name, Department, Designation, Total Number of Overtime Shifts, Total Number of Overtime Hours, Date-wise (1 to 30/31) present or absent</li>
                  <li><strong className="text-slate-800">Color-coded Status:</strong> Green (P) for full overtime shifts (&ge;10.2h), Yellow for partial (&lt;85% shift hours), Red (A) for absent days</li>
                </ul>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTriggerExport}
                  disabled={isExporting}
                  className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Generating Report...</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Excel ({exportEmployeeScope === 'all' ? 'All Staff' : exportEmployeeScope === 'active' ? 'Active' : 'Inactive'} • {months[exportMonth - 1].slice(0, 3)} {exportYear})</span>
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
