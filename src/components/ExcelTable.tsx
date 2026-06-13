/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Employee, ComputedEmployee, FilterOptions } from '../types';
import { 
  Lock, 
  Search, 
  Plus, 
  Trash2, 
  Grid, 
  Filter, 
  ArrowUpDown, 
  FileDown, 
  FileUp, 
  RefreshCw, 
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Unlock,
  Undo2
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface CellInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onBlur'> {
  value: string | number;
  onBlur: (val: string) => void;
}

function CellInput({ value, onBlur, className, type = "text", ...props }: CellInputProps) {
  const [localVal, setLocalVal] = useState<string>(String(value));

  useEffect(() => {
    setLocalVal(String(value));
  }, [value]);

  const handleBlur = () => {
    onBlur(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      {...props}
      type={type}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
}

interface ExcelTableProps {
  employees: ComputedEmployee[];
  onUpdateEmployee: (id: string, updatedFields: Partial<Employee>, skipUndoPush?: boolean) => void;
  onAddEmployee: () => void;
  onDeleteEmployee: (id: string) => void;
  onResetData: () => void;
  onBulkUpdateSettings: (workingDays: number, workingHours: number) => void;
  onViewProfile?: (id: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onPushUndo: () => void;
  viewOnly?: boolean;
  ledgerMonth?: number;
  setLedgerMonth?: (m: number) => void;
  ledgerYear?: number;
  setLedgerYear?: (y: number) => void;
}

export default function ExcelTable({
  employees,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
  onResetData,
  onBulkUpdateSettings,
  onViewProfile,
  canUndo,
  onUndo,
  onPushUndo,
  viewOnly = false,
  ledgerMonth = 5,
  setLedgerMonth = () => {},
  ledgerYear = 2026,
  setLedgerYear = () => {}
}: ExcelTableProps) {
  // Search & Filter state
  const [filterOpts, setFilterOpts] = useState<FilterOptions>({
    searchQuery: '',
    minSalary: '',
    maxSalary: '',
    hasAbsenceOnly: false,
    highDeductionsOnly: false,
    sortBy: 'id',
    sortOrder: 'asc'
  });

  // Password sheet settings unlock state
  const [passwordInput, setPasswordInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Bulk overrides state
  const [bulkDays, setBulkDays] = useState(26);
  const [bulkHours, setBulkHours] = useState(9);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // Active help tooltip state
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Parse filters
  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    // 1. Search Query (id or name)
    if (filterOpts.searchQuery.trim()) {
      const q = filterOpts.searchQuery.toLowerCase();
      result = result.filter(emp => 
        (emp.id || '').toLowerCase().includes(q) || 
        (emp.name || '').toLowerCase().includes(q)
      );
    }

    // 2. Salary Filters
    if (filterOpts.minSalary) {
      const min = Number(filterOpts.minSalary);
      if (!isNaN(min)) {
        result = result.filter(emp => emp.grossSalary >= min);
      }
    }
    if (filterOpts.maxSalary) {
      const max = Number(filterOpts.maxSalary);
      if (!isNaN(max)) {
        result = result.filter(emp => emp.grossSalary <= max);
      }
    }

    // 3. Absence Status
    if (filterOpts.hasAbsenceOnly) {
      result = result.filter(emp => (emp.fullDaysAbsent > 0 || emp.absentHours > 0 || emp.absentMinutes > 0));
    }

    // 4. High Deductions (Total Deduction > 10% of base salary)
    if (filterOpts.highDeductionsOnly) {
      result = result.filter(emp => emp.totalDeduction > (emp.grossSalary * 0.1));
    }

    // 5. Sorting
    result.sort((a, b) => {
      // Always keep empty templates at the bottom of the ledger
      const isTempA = a.id.startsWith('EMP_TEMP_') || !a.name.trim();
      const isTempB = b.id.startsWith('EMP_TEMP_') || !b.name.trim();
      
      if (isTempA && !isTempB) return 1;
      if (!isTempA && isTempB) return -1;

      let valA: any = a[filterOpts.sortBy];
      let valB: any = b[filterOpts.sortBy];

      // Handle custom sorting keys
      if (filterOpts.sortBy === 'salary') {
        valA = a.monthlySalary;
        valB = b.monthlySalary;
      } else if (filterOpts.sortBy === 'deduction') {
        valA = a.totalDeduction;
        valB = b.totalDeduction;
      } else if (filterOpts.sortBy === 'finalPay') {
        valA = a.finalPayable;
        valB = b.finalPayable;
      }

      if (typeof valA === 'string') {
        const strA = valA.trim().toLowerCase();
        const strB = (valB as string).trim().toLowerCase();
        return filterOpts.sortOrder === 'asc' 
          ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' }) 
          : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        return filterOpts.sortOrder === 'asc' 
          ? (valA as number) - (valB as number) 
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [employees, filterOpts]);

  // Compute pagination bounds
  const totalItems = filteredEmployees.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedEmployees = useMemo(() => {
    // Correct range errors
    const verifiedPage = Math.min(currentPage, totalPages);
    const startIdx = (verifiedPage - 1) * pageSize;
    return filteredEmployees.slice(startIdx, startIdx + pageSize);
  }, [filteredEmployees, currentPage, pageSize, totalPages]);

  // Table summary sums (aggregated for filtered employees)
  const totals = useMemo(() => {
    let totalGross = 0;
    let totalDeductions = 0;
    let totalPayable = 0;
    let totalAdvance = 0;
    let totalFood = 0;

    filteredEmployees.forEach(emp => {
      totalGross += emp.grossSalary || 0;
      totalDeductions += emp.totalDeduction || 0;
      totalPayable += emp.finalPayable || 0;
      totalAdvance += emp.advancePayment || 0;
      totalFood += emp.foodBalance || 0;
    });

    return {
      gross: Math.round(totalGross * 100) / 100,
      deductions: Math.round(totalDeductions * 100) / 100,
      payable: Math.round(totalPayable * 100) / 100,
      advance: Math.round(totalAdvance * 100) / 100,
      food: Math.round(totalFood * 100) / 100
    };
  }, [filteredEmployees]);

  // Password Unlock Handler
  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'salary2024') {
      setIsUnlocked(true);
      setShowUnlockModal(false);
      setPasswordInput('');
      setUnlockError('');
    } else {
      setUnlockError('Incorrect password! HR spreadsheet locks remain active.');
    }
  };

  // Inline inputs validation handler
  const handleCellBlur = (id: string, field: keyof Employee, value: string, element?: HTMLInputElement) => {
    let parsedValue: string | number = value;

    if (field === 'id') {
      const newId = value.trim();
      if (!newId || newId === id) {
        if (element) element.value = id.startsWith('EMP_TEMP_') ? '' : id;
        return;
      }
      const idExists = employees.some(e => e.id.toLowerCase() === newId.toLowerCase());
      if (idExists) {
        alert(`Error: Employee ID "${newId}" already exists. Each employee must have a unique ID.`);
        if (element) element.value = id.startsWith('EMP_TEMP_') ? '' : id;
        return;
      }
      onUpdateEmployee(id, { id: newId });
      return;
    }

    if (field === 'name') {
      const trimmedName = value.trim();
      onUpdateEmployee(id, { name: trimmedName });
      if (!trimmedName && element) {
        element.value = '';
      }
      return;
    }

    if (field === 'department') {
      const trimmedVal = value.trim();
      onUpdateEmployee(id, { department: trimmedVal });
      return;
    }

    if (field === 'designation') {
      const trimmedVal = value.trim();
      onUpdateEmployee(id, { designation: trimmedVal, role: trimmedVal });
      return;
    }

    if (field === 'salaryType') {
      onUpdateEmployee(id, { salaryType: value as 'fixed' | 'daily' });
      return;
    }

    if (field === 'shift') {
      onUpdateEmployee(id, { shift: value as 'DAY' | 'NIGHT' });
      return;
    }

    if (field === 'sundayPaid') {
      onUpdateEmployee(id, { sundayPaid: value as 'Paid' | 'Not Paid' });
      return;
    }

    // numeric fields conversion
    const num = parseFloat(value);
    parsedValue = isNaN(num) ? 0 : num;

    // Boundary rules
    if (field === 'absentMinutes') {
      parsedValue = Math.max(0, Math.min(59, Math.round(parsedValue)));
    } else if (field === 'workingDays') {
      parsedValue = Math.max(0, Math.round(parsedValue));
    } else if (field === 'workingHours') {
      parsedValue = Math.max(0, parsedValue);
    } else if (field === 'fullDaysAbsent' || field === 'absentHours' || field === 'monthlySalary' || field === 'advancePayment' || field === 'foodBalance') {
      parsedValue = Math.max(0, parsedValue);
    }

    onUpdateEmployee(id, { [field]: parsedValue });
  };

  // Toggle sorting helper
  const triggerSort = (field: typeof filterOpts.sortBy) => {
    setFilterOpts(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Convert files: Export to real Excel
  const triggerExportExcel = () => {
    // Generate clean flat array for SheetJS to parse
    const dataToExport: any[] = employees.map((emp, index) => ({
      'S.No': index + 1,
      'Employee ID': emp.id,
      'Employee Name': emp.name,
      'Department': emp.department || '',
      'Designation': emp.designation || emp.role || '',
      'Shift': String(emp.shift || 'DAY'),
      'Salary Type': String(emp.salaryType || 'fixed'),
      'Sunday Paid Status': String(emp.sundayPaid || 'Not Paid'),
      'Shift Time': emp.shiftTime || '',
      'Contact Number': emp.phone || '',
      'Address': emp.address || '',
      'Monthly/Daily Rate Indicator': emp.salaryType === 'daily' ? 'Per-Day' : 'Monthly Fixed',
      'Monthly Salary (INR)': emp.monthlySalary,
      'Working Days in Month': emp.workingDays,
      'Daily Salary Rate (INR)': emp.dailyRate,
      'Working Hours per Day': emp.workingHours,
      'Hourly Salary Rate (INR)': emp.hourlyRate,
      'Full Days Absent': emp.fullDaysAbsent,
      'Absent Hours': emp.absentHours,
      'Absent Minutes': emp.absentMinutes,
      'Sunday OT Days Worked': emp.sundayOTDays || 0,
      'Sunday OT Amount (INR)': emp.sundayOTAmount || 0,
      'Deduction: Full Day (INR)': emp.deductionFullDay,
      'Deduction: Hourly (INR)': emp.deductionHourly,
      'Deduction: Partial Day (INR)': emp.deductionPartialDay || 0,
      'Advance Payment (INR)': emp.advancePayment || 0,
      'Food Balance (INR)': emp.foodBalance || 0,
      'Total Deduction (INR)': emp.totalDeduction,
      'Final Payable Salary (INR)': emp.finalPayable
    }));

    // Add calculations total row at the end
    const totalGross = employees.reduce((acc, current) => acc + current.grossSalary, 0);
    const totalDeds = employees.reduce((acc, current) => acc + current.totalDeduction, 0);
    const totalPays = employees.reduce((acc, current) => acc + current.finalPayable, 0);
    const totalAdvance = employees.reduce((acc, current) => acc + (current.advancePayment || 0), 0);
    const totalFood = employees.reduce((acc, current) => acc + (current.foodBalance || 0), 0);
    const totalPartialDeds = employees.reduce((acc, current) => acc + (current.deductionPartialDay || 0), 0);
    const totalSundayOTDays = employees.reduce((acc, current) => acc + (current.sundayOTDays || 0), 0);
    const totalSundayOTAmount = employees.reduce((acc, current) => acc + (current.sundayOTAmount || 0), 0);

    dataToExport.push({
      'S.No': '',
      'Employee ID': 'TOTAL ROWS: ' + employees.length,
      'Employee Name': 'Summary Ledger Sums',
      'Department': '',
      'Designation': '',
      'Shift': '',
      'Salary Type': '',
      'Sunday Paid Status': '',
      'Shift Time': '',
      'Contact Number': '',
      'Address': '',
      'Monthly/Daily Rate Indicator': '',
      'Monthly Salary (INR)': totalGross,
      'Working Days in Month': 0,
      'Daily Salary Rate (INR)': 0,
      'Working Hours per Day': 0,
      'Hourly Salary Rate (INR)': 0,
      'Full Days Absent': 0,
      'Absent Hours': 0,
      'Absent Minutes': 0,
      'Sunday OT Days Worked': totalSundayOTDays,
      'Sunday OT Amount (INR)': totalSundayOTAmount,
      'Deduction: Full Day (INR)': 0,
      'Deduction: Hourly (INR)': 0,
      'Deduction: Partial Day (INR)': totalPartialDeds,
      'Advance Payment (INR)': totalAdvance,
      'Food Balance (INR)': totalFood,
      'Total Deduction (INR)': totalDeds,
      'Final Payable Salary (INR)': totalPays
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Salary Calculator');
    
    // Auto columns sizing
    const maxKeys = Object.keys(dataToExport[0]);
    worksheet['!cols'] = maxKeys.map(() => ({ wch: 18 }));
    
    XLSX.writeFile(workbook, `HR_Salary_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // File import helper for .XLSX Excel files uploaded by the user
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onPushUndo();

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const parsedData = XLSX.utils.sheet_to_json<any>(worksheet);

      // Map parsed excel rows to our strict Employee interface
      const findFuzzyValue = (r: any, aliases: string[]) => {
        const rowKeys = Object.keys(r);
        for (const alias of aliases) {
          const matchKey = rowKeys.find(k => {
            const cleanKey = k.toLowerCase().replace(/[\s\._\-]/g, '');
            const cleanAlias = alias.toLowerCase().replace(/[\s\._\-]/g, '');
            return cleanKey === cleanAlias;
          });
          if (matchKey !== undefined) {
            return r[matchKey];
          }
        }
        return undefined;
      };

      let rowCounter = employees.length + 1;
      parsedData.forEach((row: any) => {
        // Find or generate ID with multi-alias backup
        const idVal = findFuzzyValue(row, ['Employee ID', 'id', 'ID', 'empId', 'code', 'employeeCode', 'EmployeeNo']);
        const rawId = idVal !== undefined ? idVal : `EMP-${String(rowCounter++).padStart(3, '0')}`;
        
        // Skip aggregate totals labels
        if (rawId.toString().includes('TOTAL') || rawId.toString().includes('Summary')) return;

        const name = String(findFuzzyValue(row, ['Employee Name', 'name', 'Name', 'FullName', 'StaffName']) || 'Imported Staff');
        const department = String(findFuzzyValue(row, ['Department', 'department', 'Dept', 'Dept.', 'Section', 'Division']) || '');
        const designation = String(findFuzzyValue(row, ['Designation', 'designation', 'Role', 'role', 'Post', 'Job Title']) || '');
        const rawShiftStr = String(findFuzzyValue(row, ['Shift', 'shift', 'Shift [DAY/NIGHT]']) || 'DAY').toUpperCase();
        const shift = rawShiftStr.includes('NIGHT') ? 'NIGHT' : 'DAY';
        const rawTypeStr = String(findFuzzyValue(row, ['Salary Type', 'salaryType', 'Type', 'SalaryBasis', 'Basis']) || 'fixed').toLowerCase();
        const salaryType = rawTypeStr.includes('daily') ? 'daily' : 'fixed';
        const monthlySalary = Number(findFuzzyValue(row, ['Monthly Salary (INR)', 'Monthly Salary', 'Rate', 'monthlySalary', 'Salary', 'salary']) || 0);
        const workingDays = Number(findFuzzyValue(row, ['Working Days in Month', 'workingDays', 'Days', 'Working Days']) || 26);
        const workingHours = Number(findFuzzyValue(row, ['Working Hours per Day', 'workingHours', 'Hours', 'Working Hours']) || 9);
        const fullDaysAbsent = Number(findFuzzyValue(row, ['Full Days Absent', 'fullDaysAbsent', 'Absent Days', 'Absent']) || 0);
        const absentHours = Number(findFuzzyValue(row, ['Absent Hours', 'absentHours', 'Total Absent Hours']) || 0);
        const absentMinutes = Number(findFuzzyValue(row, ['Absent Minutes', 'absentMinutes', 'Total Absent Minutes']) || 0);
        const advancePayment = Number(findFuzzyValue(row, ['Advance Payment (INR)', 'advancePayment', 'Advance', 'Advances', 'Advance Paid']) || 0);
        const foodBalance = Number(findFuzzyValue(row, ['Food Balance (INR)', 'foodBalance', 'Food Bal', 'Meals', 'Food Bill', 'Canteen']) || 0);

        onUpdateEmployee(rawId.toString(), {
          id: rawId.toString(),
          name,
          department,
          designation,
          role: designation || String(findFuzzyValue(row, ['role', 'Role']) || ''),
          shift,
          salaryType,
          monthlySalary,
          workingDays,
          workingHours,
          fullDaysAbsent,
          absentHours,
          absentMinutes,
          advancePayment,
          foodBalance
        }, true);
      });
    };
    reader.readAsArrayBuffer(file);
    alert('Import parsed successfully! Recalculated ledger dynamically.');
  };

  // Format currency value in Indian Rupee
  const formatINR = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg flex flex-col pt-4 overflow-hidden" id="sheet-ledger-container">
      
      {/* Title & Toolbars */}
      <div className="px-5 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 select-none">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5 uppercase">
              <Grid size={16} className="text-slate-600" />
              HR Interactive Calculation Spreadsheet
            </h4>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isUnlocked ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                {isUnlocked ? '🔓 Formula Overrides Unlocked' : '🔒 Formula Protected (salary2024)'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Click any blue cell to change inputs. Grey formula columns compute automatically. Enter <span className="font-mono text-slate-600 bg-slate-100 px-1 rounded font-bold">salary2024</span> below to grant formula adjustment overrides.
          </p>
        </div>

        {/* Toolbar Button actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month / Year Run Selection of Ledger */}
          <div className="flex items-center gap-1.5 bg-sky-50/70 border border-sky-100 px-2.5 py-1.5 rounded-xl mr-2 animate-fade-in">
            <span className="text-[10px] font-black uppercase text-sky-800 tracking-wider font-mono">Ledger Run:</span>
            <select
              value={ledgerMonth}
              onChange={(e) => setLedgerMonth(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg py-0.5 px-2 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-sky-400"
            >
              {[
                { v: 1, l: 'Jan' },
                { v: 2, l: 'Feb' },
                { v: 3, l: 'Mar' },
                { v: 4, l: 'Apr' },
                { v: 5, l: 'May' },
                { v: 6, l: 'Jun' },
                { v: 7, l: 'Jul' },
                { v: 8, l: 'Aug' },
                { v: 9, l: 'Sep' },
                { v: 10, l: 'Oct' },
                { v: 11, l: 'Nov' },
                { v: 12, l: 'Dec' },
              ].map(m => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </select>
            <select
              value={ledgerYear}
              onChange={(e) => setLedgerYear(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg py-0.5 px-2 text-xs font-bold text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-sky-400"
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Lock/Unlock Switch */}
          {!isUnlocked ? (
            <button 
              id="btn-unlock-formulas"
              onClick={() => {
                if (viewOnly) {
                  alert("Access Restricted. Sheet formula constant variables are locked for observers.");
                  return;
                }
                setShowUnlockModal(true);
              }}
              disabled={viewOnly}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                viewOnly 
                  ? 'border-slate-150 bg-slate-50 text-slate-350 cursor-not-allowed opacity-50' 
                  : 'border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-600'
              }`}
            >
              <Unlock size={14} />
              Unlock Constants Override
            </button>
          ) : (
            <button 
              id="btn-lock-formulas"
              onClick={() => setIsUnlocked(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              <Lock size={14} />
              Re-Lock Formulas
            </button>
          )}

          {/* Bulk Update Controls */}
          <button 
            id="btn-bulk-settings"
            onClick={() => {
              if (viewOnly) {
                alert("Access Restricted. Bulk settings constants cannot be overwritten in view-only observer mode.");
                return;
              }
              setShowBulkPanel(!showBulkPanel);
            }}
            disabled={viewOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold cursor-pointer rounded-lg transition-colors ${
              viewOnly
                ? 'border-slate-150 bg-slate-50 text-slate-350 cursor-not-allowed opacity-50'
                : showBulkPanel 
                  ? 'bg-slate-900 border-slate-900 text-white' 
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <RefreshCw size={13} />
            Bulk Settings
          </button>

          {/* Simple Undo Stack Button */}
          <button 
            id="btn-undo-action"
            onClick={onUndo}
            disabled={!canUndo || viewOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-all ${
              canUndo && !viewOnly
                ? 'bg-[#1abc9c]/20 hover:bg-[#1abc9c]/35 border-[#1abc9c]/30 text-teal-800 hover:shadow cursor-pointer' 
                : 'border-slate-150 bg-slate-50 text-slate-350 cursor-not-allowed opacity-50'
            }`}
            title={viewOnly ? "Undo disabled in read-only observer session" : "Undo last change (recover from accidental deletions or incorrect input updates)"}
          >
            <Undo2 size={13} className={canUndo && !viewOnly ? "text-[#16a085]" : ""} />
            <span>Undo ({canUndo && !viewOnly ? 'Last Change' : 'No changes yet'})</span>
          </button>

          {/* New Employee */}
          <button 
            id="btn-add-staff"
            onClick={() => {
              if (viewOnly) {
                alert("Access Restricted. Observer mode restricts database addition operations.");
                return;
              }
              onAddEmployee();
            }}
            disabled={viewOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              viewOnly
                ? 'bg-slate-300 text-slate-100 cursor-not-allowed opacity-50'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow'
            }`}
          >
            <Plus size={14} />
            Add Employee Card
          </button>

          {/* Reset button */}
          <button 
            id="btn-seed-restorer"
            onClick={() => {
              if (viewOnly) {
                alert("Access Restricted. Ledger database reset operations require administrator credentials.");
                return;
              }
              if (confirm('Are you sure you want to restore the ledger to clean baseline data (first 5 employees filled, remaining 155 as empty template)? Any current edits will be overwritten.')) {
                onResetData();
              }
            }}
            disabled={viewOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              viewOnly
                ? 'border-slate-150 bg-slate-50 text-slate-350 cursor-not-allowed opacity-50'
                : 'border-rose-200 text-rose-700 hover:bg-rose-50'
            }`}
            title="Reset ledger to baseline (first 5 filled, remaining 155 template rows)"
          >
            <RefreshCw size={13} />
            Reset to Baseline
          </button>
        </div>
      </div>

      {/* Bulk Update Settings Drawer Panel */}
      {showBulkPanel && (
        <div id="bulk-update-drawer" className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end transition-all animate-toggle animate-duration-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Company Working Days</label>
            <input 
              type="number" 
              value={bulkDays}
              onChange={(e) => setBulkDays(Math.max(1, Math.min(31, Number(e.target.value) || 26)))}
              className="w-full h-8 px-2 bg-white border border-slate-200 rounded text-xs text-slate-800"
              placeholder="e.g. 26"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Working Hours/Day</label>
            <input 
              type="number" 
              step="0.5"
              value={bulkHours}
              onChange={(e) => setBulkHours(Math.max(1, Math.min(24, Number(e.target.value) || 9)))}
              className="w-full h-8 px-2 bg-white border border-slate-200 rounded text-xs text-slate-800"
              placeholder="e.g. 9.0"
            />
          </div>
          <div>
            <button 
              id="btn-apply-bulk"
              onClick={() => {
                onBulkUpdateSettings(bulkDays, bulkHours);
                setShowBulkPanel(false);
              }}
              className="w-full h-8 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
            >
              Batch Apply To All Staff
            </button>
          </div>
          <div className="text-[10.5px] text-slate-400 pb-1.5 leading-tight">
            Apply setting constants directly to all current 160 rows.
          </div>
        </div>
      )}

      {/* Primary Filtering and Search Controls */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none">
        
        {/* Search controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              value={filterOpts.searchQuery}
              onChange={(e) => setFilterOpts(p => ({ ...p, searchQuery: e.target.value }))}
              placeholder="Search by Employee ID or Name..."
              className="h-8.5 pl-9 pr-4 w-60 md:w-72 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 px-1">
              <Filter size={13} />
              Filter leaves:
            </span>
            <button 
              id="filter-absence"
              onClick={() => setFilterOpts(p => ({ ...p, hasAbsenceOnly: !p.hasAbsenceOnly }))}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${filterOpts.hasAbsenceOnly ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              With Absences Only
            </button>
            <button 
              id="filter-high-ded"
              onClick={() => setFilterOpts(p => ({ ...p, highDeductionsOnly: !p.highDeductionsOnly }))}
              className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${filterOpts.highDeductionsOnly ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              High Deductions (&gt;10% gross)
            </button>
          </div>
        </div>

        {/* File Import / Exports utilities */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Ledger counts */}
          <span className="text-[11px] font-bold text-slate-500 mr-2 uppercase">
            Ledger Count: {totalItems} of {employees.length}
          </span>

          {/* Import XLSX */}
          <label className="flex items-center gap-1.5 h-8.5 px-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:shadow-xs">
            <FileUp size={14} className="text-slate-500" />
            <span>Upload .xlsx</span>
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleExcelImport}
              className="hidden" 
            />
          </label>

          {/* Export XLSX */}
          <button 
            id="btn-export-excel"
            onClick={triggerExportExcel}
            className="flex items-center gap-1.5 h-8.5 px-3 bg-slate-800 hover:bg-slate-900 hover:shadow text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            <FileDown size={14} />
            Download Excel Workbook (.xlsx)
          </button>
        </div>
      </div>

      {/* Spreadsheet grid container */}
      <div className="overflow-x-auto w-full max-w-full relative scrollbar-thin max-h-[580px]" id="excel-grid-viewport">
        <table className="w-full text-left border-collapse table-fixed select-text">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold tracking-wider text-center h-11 uppercase sticky top-0 z-10 shadow-xs">
              <th className="w-16 text-center px-1 border-r border-slate-200 bg-slate-50 font-bold sticky left-0 z-20 select-none">
                <span>S.No</span>
              </th>

              <th className="w-24 text-left px-3 border-r border-slate-200 bg-slate-50 font-bold sticky left-16 z-20">
                <div className="flex items-center justify-between">
                  <span>EMP ID</span>
                  <button onClick={() => triggerSort('id')} className="cursor-pointer text-slate-400 hover:text-slate-650 transition-colors">
                    <ArrowUpDown size={11} />
                  </button>
                </div>
              </th>

              <th className="w-48 text-left px-3 border-r border-slate-200 bg-slate-50 font-bold sticky left-40 z-20">
                <div className="flex items-center justify-between">
                  <span>Employee Name</span>
                  <button onClick={() => triggerSort('name')} className="cursor-pointer text-slate-400 hover:text-slate-650 transition-colors">
                    <ArrowUpDown size={11} />
                  </button>
                </div>
              </th>

              <th className="w-36 px-2.5 border-r border-slate-200 bg-slate-50 font-bold text-slate-500 text-[11px]">
                Department
              </th>

              <th className="w-36 px-2.5 border-r border-slate-200 bg-slate-50 font-bold text-slate-500 text-[11px]">
                Designation
              </th>

              <th className="w-32 px-2 border-r border-slate-200 bg-blue-50/50 font-bold text-blue-850 text-[11px] leading-tight">
                Sunday Paid?
              </th>

              <th className="w-28 px-2 border-r border-slate-200 bg-amber-50/40 font-bold text-amber-850 text-[11px]">
                Shift
              </th>

              <th className="w-[110px] px-2 border-r border-slate-200 bg-indigo-50/40 font-bold text-indigo-800 text-[11px] leading-tight">
                Basis
              </th>

              <th className="w-40 px-2.5 border-r border-slate-200 bg-slate-50 font-bold text-slate-500">
                <div className="flex items-center justify-between px-1">
                  <span>Salary / Rate (₹)</span>
                  <button onClick={() => triggerSort('salary')} className="cursor-pointer text-slate-400 hover:text-slate-650 transition-colors">
                    <ArrowUpDown size={11} />
                  </button>
                </div>
              </th>

              <th className="w-24 px-1 border-r border-slate-200 bg-teal-50/40 text-teal-850 font-bold text-wrap leading-tight" title="Imported automatically from attendance logs of the selected month run, and editable.">
                <div>Working Days</div>
                <span className="block text-[8px] font-black uppercase text-teal-600 tracking-widest leading-none mt-0.5">🔄 Synced</span>
              </th>

              <th className="w-28 px-2 border-r border-slate-200 bg-slate-50 text-slate-500 italic font-mono text-[10px]">
                Daily Rate (₹)
              </th>

              <th className="w-24 px-1 border-r border-slate-200 bg-slate-50 font-bold text-slate-500 leading-tight">
                Hrs / Day
              </th>

              <th className="w-28 px-2 border-r border-slate-200 bg-slate-50 text-slate-500 italic font-mono text-[10px]">
                Hourly Rate (₹)
              </th>

              <th className="w-24 px-1 border-r border-slate-200 bg-teal-50/40 text-teal-850 font-bold leading-tight" title="Imported automatically from attendance logs of the selected month run, and editable.">
                <div>Full Days Absent</div>
                <span className="block text-[8px] font-black uppercase text-teal-600 tracking-widest leading-none mt-0.5">🔄 Synced</span>
              </th>

              <th className="w-24 px-1 border-r border-slate-200 bg-slate-50 font-bold text-slate-500 leading-tight">
                Absent Hours
              </th>

              <th className="w-24 px-1 border-r border-slate-200 bg-slate-50 font-bold text-slate-500 leading-tight">
                Absent Mins
              </th>

              <th className="w-32 px-1 border-r border-slate-200 bg-slate-50 text-slate-500 italic font-mono text-[10px]">
                Deduction: Full Day
              </th>

              <th className="w-32 px-1 border-r border-slate-200 bg-slate-50 text-slate-500 italic font-mono text-[10px]">
                Deduction: Hourly
              </th>

              <th className="w-28 px-1.5 border-r border-slate-200 bg-sky-50 font-bold text-indigo-900 text-[10.5px] leading-tight select-none">
                Advance (₹)
              </th>

              <th className="w-28 px-1.5 border-r border-slate-200 bg-sky-50 font-bold text-indigo-900 text-[10.5px] leading-tight select-none">
                Food Bal. (₹)
              </th>

              <th className="w-32 px-1.5 border-r border-slate-200 bg-rose-50/50 font-bold text-rose-750">
                <div className="flex items-center justify-between px-1">
                  <span>Total Ded. (₹)</span>
                  <button onClick={() => triggerSort('deduction')} className="cursor-pointer text-rose-400 hover:text-rose-750 transition-colors">
                    <ArrowUpDown size={11} />
                  </button>
                </div>
              </th>

              <th className="w-36 px-1.5 bg-blue-50 font-bold text-blue-800">
                <div className="flex items-center justify-between px-1">
                  <span>Payable Sal. (₹)</span>
                  <button onClick={() => triggerSort('finalPay')} className="cursor-pointer text-blue-400 hover:text-blue-800 transition-colors">
                    <ArrowUpDown size={11} />
                  </button>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedEmployees.map((emp, index) => {
              // Conditional formatting evaluations
              const isHighAbsent = emp.fullDaysAbsent >= 3;
              const hasLeaves = emp.fullDaysAbsent > 0 || emp.absentHours > 0 || emp.absentMinutes > 0;
              const hasErrors = emp.hasErrors;

              // Calculate Serial Number (starting from 1)
              const verifiedPage = Math.min(currentPage, totalPages);
              const serialNo = (verifiedPage - 1) * pageSize + index + 1;

              return (
                <tr 
                  key={emp.id} 
                  id={`row-${emp.id}`}
                  className={`h-9 border-b border-slate-100 text-xs transition-colors align-middle text-center ${hasErrors ? 'bg-rose-55' : 'odd:bg-white even:bg-slate-50/30 hover:bg-blue-50/45 hover:odd:bg-blue-50/45'}`}
                >
                  <td className="sticky left-0 bg-slate-50 text-slate-500 font-mono font-bold text-center align-middle border-r border-slate-200 sticky-left-col z-5 px-1">
                    {serialNo}
                  </td>

                  <td className="sticky left-16 bg-sky-50 text-slate-800 text-center align-middle border-r border-slate-200 sticky-left-col z-5 px-1 pr-1.5 h-full">
                    <div className="flex items-center justify-between gap-1">
                      <CellInput 
                        type="text" 
                        value={emp.id.startsWith('EMP_TEMP_') ? '' : emp.id} 
                        onBlur={(val) => handleCellBlur(emp.id, 'id', val)}
                        disabled={viewOnly}
                        className="w-[calc(100%-35px)] h-7 border-0 px-1 bg-transparent text-center font-mono font-bold text-[11px] rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:shadow-xs uppercase disabled:text-slate-500 disabled:font-semibold"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        {onViewProfile && (
                          <button 
                            onClick={() => onViewProfile(emp.id)}
                            className="text-slate-400 hover:text-teal-600 transition-colors cursor-pointer duration-150 p-0.5"
                            title="View Employee Profile Dashboard"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                        )}
                        {!viewOnly && (
                          <button 
                            onClick={() => onDeleteEmployee(emp.id)}
                            className="text-slate-350 hover:text-rose-600 transition-colors opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer duration-150 p-0.5"
                            title="Remove Employee"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="sticky left-40 bg-sky-50 text-slate-800 text-left align-middle border-r border-slate-200 sticky-left-col z-5 px-1 pr-2">
                    <CellInput 
                      type="text" 
                      value={emp.name} 
                      onBlur={(val) => handleCellBlur(emp.id, 'name', val)}
                      disabled={viewOnly}
                      className="w-full h-7 border-0 px-2 bg-transparent text-left font-medium rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:shadow-xs uppercase disabled:text-slate-500"
                    />
                  </td>

                  <td className="bg-sky-50 text-slate-800 text-left align-middle border-r border-slate-150 px-1 pr-2">
                    <CellInput 
                      type="text" 
                      value={emp.department || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'department', val)}
                      disabled={viewOnly}
                      placeholder="e.g. Sales"
                      className="w-full h-7 border-0 px-2 bg-transparent text-left font-medium rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:shadow-xs disabled:text-slate-500"
                    />
                  </td>

                  <td className="bg-sky-50 text-slate-800 text-left align-middle border-r border-slate-150 px-1 pr-2">
                    <CellInput 
                      type="text" 
                      value={emp.designation || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'designation', val)}
                      disabled={viewOnly}
                      placeholder="e.g. Manager"
                      className="w-full h-7 border-0 px-2 bg-transparent text-left font-medium rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:shadow-xs disabled:text-slate-500"
                    />
                  </td>

                  <td className={`p-1 border-r border-slate-150 align-middle text-center ${emp.sundayPaid === 'Paid' ? 'bg-emerald-50/40' : 'bg-rose-50/20'}`}>
                    <select 
                      value={emp.sundayPaid || 'Not Paid'}
                      onChange={(e) => handleCellBlur(emp.id, 'sundayPaid', e.target.value)}
                      disabled={viewOnly}
                      className={`w-full h-7 border-0 bg-transparent text-center font-bold text-[10px] rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase py-0 ${emp.sundayPaid === 'Paid' ? 'text-emerald-800' : 'text-rose-700'}`}
                    >
                      <option value="Paid" className="text-emerald-800 font-bold">PAID</option>
                      <option value="Not Paid" className="text-rose-700 font-bold">NOT PAID</option>
                    </select>
                  </td>

                  <td className={`p-1 border-r border-slate-150 align-middle text-center ${emp.shift === 'NIGHT' ? 'bg-purple-50/40' : 'bg-amber-50/30'}`}>
                    <select 
                      value={emp.shift || 'DAY'}
                      onChange={(e) => handleCellBlur(emp.id, 'shift', e.target.value)}
                      disabled={viewOnly}
                      className={`w-full h-7 border-0 bg-transparent text-center font-bold text-[10px] rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase py-0 ${emp.shift === 'NIGHT' ? 'text-purple-800' : 'text-amber-850'}`}
                    >
                      <option value="DAY" className="text-amber-850 font-bold">DAY</option>
                      <option value="NIGHT" className="text-purple-800 font-bold">NIGHT</option>
                    </select>
                  </td>

                  <td className={`p-1 border-r border-slate-150 align-middle text-center ${emp.salaryType === 'daily' ? 'bg-emerald-50/50' : 'bg-indigo-50/40'}`}>
                    <select 
                      value={emp.salaryType || 'fixed'}
                      onChange={(e) => handleCellBlur(emp.id, 'salaryType', e.target.value)}
                      disabled={viewOnly}
                      className="w-full h-7 border-0 bg-transparent text-center font-bold text-[10px] rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer uppercase py-0"
                    >
                      <option value="fixed" className="text-indigo-850 font-bold">Fixed</option>
                      <option value="daily" className="text-emerald-850 font-bold">Daily</option>
                    </select>
                  </td>

                  <td className="bg-sky-50 text-right font-medium text-slate-800 px-1 border-r border-slate-150">
                    <div className="flex items-center bg-transparent justify-between">
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded-xs shrink-0 select-none ${
                        emp.salaryType === 'daily' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {emp.salaryType === 'daily' ? '₹/D' : '₹/M'}
                      </span>
                      <CellInput 
                        type="number" 
                        value={emp.monthlySalary || ''} 
                        onBlur={(val) => handleCellBlur(emp.id, 'monthlySalary', val)}
                        disabled={viewOnly}
                        placeholder="0"
                        min="0"
                        className="w-full h-7 border-0 px-1 bg-transparent text-right font-semibold rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                      />
                    </div>
                  </td>

                  <td className="bg-sky-50 px-1 border-r border-slate-150">
                    <CellInput 
                      type="number" 
                      value={emp.workingDays || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'workingDays', val)}
                      disabled={viewOnly}
                      placeholder="e.g. 26"
                      min="1"
                      max="31"
                      className="w-full h-7 border-0 px-1 bg-transparent text-center rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                    />
                  </td>

                  <td className="bg-slate-100 text-right font-mono text-slate-500 text-[11px] px-2.5 border-r border-slate-200 relative group select-none">
                    <span>{formatINR(emp.dailyRate).replace('INR', '')}</span>
                    <Lock size={8} className="absolute right-1 top-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>

                  <td className="bg-sky-50 px-1 border-r border-slate-150">
                    <CellInput 
                      type="number" 
                      step="0.5"
                      value={emp.workingHours || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'workingHours', val)}
                      disabled={viewOnly}
                      placeholder="e.g. 9"
                      min="1"
                      max="24"
                      className="w-full h-7 border-0 px-1 bg-transparent text-center rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                    />
                  </td>

                  <td className="bg-slate-100 text-right font-mono text-slate-500 text-[11px] px-2.5 border-r border-slate-200 relative group select-none">
                    <span>{formatINR(emp.hourlyRate).replace('INR', '')}</span>
                    <Lock size={8} className="absolute right-1 top-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>

                  <td className={`px-1 border-r border-slate-150 transition-all ${isHighAbsent ? 'bg-rose-100 border-rose-200' : 'bg-sky-50'}`}>
                    <CellInput 
                      type="number" 
                      value={emp.fullDaysAbsent || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'fullDaysAbsent', val)}
                      disabled={viewOnly}
                      placeholder="0"
                      min="0"
                      className={`w-full h-7 border-0 px-1 bg-transparent text-center rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-semibold ${isHighAbsent ? 'text-rose-800 font-bold' : 'text-slate-800'} disabled:text-slate-500`}
                    />
                  </td>

                  <td className={`bg-sky-50 px-1 border-r border-slate-150`}>
                    <CellInput 
                      type="number" 
                      value={emp.absentHours || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'absentHours', val)}
                      disabled={viewOnly}
                      placeholder="0"
                      min="0"
                      className="w-full h-7 border-0 px-1 bg-transparent text-center rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                    />
                  </td>

                  <td className="bg-amber-100/60 px-1 border-r border-slate-150">
                    <CellInput 
                      type="number" 
                      value={emp.absentMinutes || ''} 
                      onBlur={(val) => handleCellBlur(emp.id, 'absentMinutes', val)}
                      disabled={viewOnly}
                      placeholder="0"
                      min="0"
                      max="59"
                      className="w-full h-7 border-0 px-1 bg-transparent text-center text-amber-900 rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500 disabled:font-semibold"
                    />
                  </td>

                  <td className="bg-slate-100 text-right font-mono text-slate-600 text-[11px] px-2 border-r border-slate-200 relative group select-none">
                    <span className={emp.deductionFullDay > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                      {emp.deductionFullDay > 0 ? formatINR(emp.deductionFullDay).replace('INR', '') : '-'}
                    </span>
                    <Lock size={8} className="absolute right-1 top-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>

                  <td className="bg-slate-100 text-right font-mono text-slate-600 text-[11px] px-2 border-r border-slate-200 relative group select-none">
                    <span className={emp.deductionHourly > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                      {emp.deductionHourly > 0 ? formatINR(emp.deductionHourly).replace('INR', '') : '-'}
                    </span>
                    <Lock size={8} className="absolute right-1 top-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>

                  <td className="bg-sky-50 text-right font-medium text-slate-800 px-1 border-r border-slate-150">
                    <div className="flex items-center bg-transparent">
                      <span className="text-[10px] text-slate-400 pl-1 select-none">₹</span>
                      <CellInput 
                        type="number" 
                        value={emp.advancePayment || ''} 
                        onBlur={(val) => handleCellBlur(emp.id, 'advancePayment', val)}
                        disabled={viewOnly}
                        placeholder="0"
                        min="0"
                        className="w-full h-7 border-0 px-1 bg-transparent text-right font-semibold rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                      />
                    </div>
                  </td>

                  <td className="bg-sky-50 text-right font-medium text-slate-800 px-1 border-r border-slate-150">
                    <div className="flex items-center bg-transparent">
                      <span className="text-[10px] text-slate-400 pl-1 select-none">₹</span>
                      <CellInput 
                        type="number" 
                        value={emp.foodBalance || ''} 
                        onBlur={(val) => handleCellBlur(emp.id, 'foodBalance', val)}
                        disabled={viewOnly}
                        placeholder="0"
                        min="0"
                        className="w-full h-7 border-0 px-1 bg-transparent text-right font-semibold rounded-sm focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:text-slate-500"
                      />
                    </div>
                  </td>

                  <td className="bg-rose-50/50 text-right font-mono font-bold text-rose-700 text-[11px] px-2.5 border-r border-slate-200 select-none relative group">
                    <span className={emp.totalDeduction > 0 ? 'text-rose-700' : 'text-slate-400'}>
                      {emp.totalDeduction > 0 ? formatINR(emp.totalDeduction).replace('INR', '') : '-'}
                    </span>
                    <Lock size={8} className="absolute right-1 top-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>

                  <td className={`text-right font-mono font-bold text-[11px] px-2.5 transition-all select-none ${
                    hasLeaves 
                      ? isHighAbsent 
                        ? 'bg-rose-100 text-rose-800 border-l border-l-rose-350' 
                        : 'bg-amber-100 text-amber-800 border-l border-l-amber-350' 
                      : 'bg-emerald-100 text-emerald-800 border-l border-l-emerald-350'
                  }`}>
                    {formatINR(emp.finalPayable).replace('INR', '')}
                  </td>
                </tr>
              );
            })}

            {/* Zero state display */}
            {totalItems === 0 && (
              <tr>
                <td colSpan={22} className="h-44 text-center text-slate-400 text-xs">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <AlertTriangle size={24} className="text-slate-300" />
                    <span>No employee records found matching current query or search criteria.</span>
                    <button 
                      onClick={() => setFilterOpts({
                        searchQuery: '', minSalary: '', maxSalary: '', hasAbsenceOnly: false, highDeductionsOnly: false, sortBy: 'id', sortOrder: 'asc'
                      })}
                      className="text-xs text-blue-600 font-bold hover:underline"
                    >
                      Clear All Search Filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {/* Table Totals double underlined summary Row, sticky at bottom */}
          {totalItems > 0 && (
            <tfoot>
              <tr className="bg-slate-800 text-white font-bold text-[11.5px] tracking-wide text-center uppercase h-11 sticky bottom-0 z-10 border-t-2 border-slate-300 relative shadow-md">
                <td className="sticky left-0 bg-slate-900 px-3 text-left border-r border-slate-700 z-15 font-bold select-none h-full text-slate-200">
                  SUMS:
                </td>
                <td className="sticky left-16 bg-slate-900 px-3 text-left border-r border-slate-700 z-15 font-bold text-slate-200 font-mono text-[10px] select-none uppercase">
                  {totalItems} rows
                </td>
                <td className="sticky left-40 bg-slate-900 border-r border-slate-700 z-15 h-full"></td>
                <td className="bg-slate-800 border-r border-slate-700"></td>
                <td className="bg-slate-800 border-r border-slate-700"></td>
                <td className="bg-slate-800 border-r border-slate-700"></td>
                <td className="bg-slate-800 border-r border-slate-700"></td>
                <td className="bg-slate-800 border-r border-slate-700"></td>
                <td className="text-right p-2.5 border-r border-slate-700 font-mono text-sky-200 font-bold bg-slate-800 select-all">
                  {formatINR(totals.gross).replace('INR', '')}
                </td>
                <td colSpan={9} className="text-right px-4 text-slate-450 bg-slate-850 border-r border-slate-700 italic normal-case text-[10px] select-none font-medium">
                  Totals recalculated live. Double border underline.
                </td>
                <td className="text-right p-2.5 border-r border-slate-700 font-mono text-indigo-200 font-bold bg-slate-800 select-all">
                  {formatINR(totals.advance).replace('INR', '')}
                </td>
                <td className="text-right p-2.5 border-r border-slate-700 font-mono text-indigo-200 font-bold bg-slate-800 select-all">
                  {formatINR(totals.food).replace('INR', '')}
                </td>
                <td className="text-right p-2.5 border-r border-slate-700 font-mono font-bold text-rose-350 bg-slate-800 select-all">
                  {formatINR(totals.deductions).replace('INR', '')}
                </td>
                <td className="text-right p-2.5 font-mono text-[12px] font-extrabold text-emerald-300 bg-emerald-900/95 underline decoration-double decoration-emerald-400 decoration-2 select-all">
                  {formatINR(totals.payable).replace('INR', '')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination controls */}
      {totalItems > 0 && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4 select-none">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Show page depth:</span>
            <select 
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-8 px-2 bg-white border border-slate-200 rounded text-slate-700 outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="10">10 entries</option>
              <option value="15">15 entries</option>
              <option value="30">30 entries</option>
              <option value="50">50 entries</option>
              <option value="100">100 entries</option>
              <option value={employees.length}>All ({employees.length}) rows</option>
            </select>
            <span>
              • Showing <strong>{Math.min(filteredEmployees.length, (currentPage - 1) * pageSize + 1)}</strong> to{' '}
              <strong>{Math.min(filteredEmployees.length, currentPage * pageSize)}</strong> of{' '}
              <strong>{totalItems}</strong> matching rows
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            
            <div className="flex items-center text-xs text-slate-600">
              <span className="font-semibold text-slate-800 px-2">Page {currentPage} of {totalPages}</span>
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Password Sheet Settings unlock modal dialog */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-xl w-full max-w-sm p-6 relative animate-fadeIn animate-duration-150">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5 uppercase mb-2">
              <Unlock size={16} className="text-blue-600" />
              Sheet Formulas Access
            </h4>
            <p className="text-xs text-slate-500 leading-normal mb-4">
              Enter the worksheet password configured inside the Excel workbook to unlock global variable editing (Working days & business shifts constants).
            </p>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <input 
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter sheet formula lock password..."
                  required
                  autoFocus
                  className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:border-blue-400"
                />
                {unlockError && (
                  <p className="text-[10.5px] text-rose-500 mt-1.5 font-bold flex items-center gap-1">
                    <AlertTriangle size={11} />
                    {unlockError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 text-xs select-none">
                <button 
                  type="button"
                  onClick={() => {
                    setShowUnlockModal(false);
                    setPasswordInput('');
                    setUnlockError('');
                  }}
                  className="px-3.5 py-2 hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-lg font-bold cursor-pointer"
                >
                  Unlock Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
