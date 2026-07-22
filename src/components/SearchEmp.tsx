/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  Building2, 
  Briefcase, 
  Clock, 
  Coins, 
  User, 
  RotateCcw, 
  DollarSign, 
  SlidersHorizontal,
  ChevronRight,
  Calendar,
  UserCheck
} from 'lucide-react';
import { ComputedEmployee } from '../types';

interface SearchEmpProps {
  employees: ComputedEmployee[];
  onViewProfile: (id: string) => void;
  ledgerMonth?: number;
  ledgerYear?: number;
  setLedgerMonth?: (m: number) => void;
  setLedgerYear?: (y: number) => void;
}

export default function SearchEmp({ 
  employees, 
  onViewProfile,
  ledgerMonth,
  ledgerYear,
  setLedgerMonth,
  setLedgerYear
}: SearchEmpProps) {
  // Query States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActiveStatus, setSelectedActiveStatus] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [selectedShiftMode, setSelectedShiftMode] = useState('');
  const [selectedSalaryType, setSelectedSalaryType] = useState('');
  const [minAbsences, setMinAbsences] = useState<string>('');
  const [maxAbsences, setMaxAbsences] = useState<string>('');

  const [internalMonth, setInternalMonth] = useState(6);
  const [internalYear, setInternalYear] = useState(2026);
  
  const localLedgerMonth = ledgerMonth !== undefined ? ledgerMonth : internalMonth;
  const localLedgerYear = ledgerYear !== undefined ? ledgerYear : internalYear;
  
  const setLocalLedgerMonth = (m: number) => {
    setInternalMonth(m);
    if (setLedgerMonth) setLedgerMonth(m);
  };
  
  const setLocalLedgerYear = (y: number) => {
    setInternalYear(y);
    if (setLedgerYear) setLedgerYear(y);
  };

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // 1. Dynamic Dropdown lists extracted directly from current employees state 
  // This satisfies the "gets updated when changes are made on other pages" requirement
  const departments = useMemo(() => {
    const list = employees
      .map(emp => emp.department)
      .filter((dept): dept is string => typeof dept === 'string' && dept.trim() !== '');
    return Array.from(new Set(list)).sort();
  }, [employees]);

  const designations = useMemo(() => {
    const list = employees
      .map(emp => emp.designation)
      .filter((desg): desg is string => typeof desg === 'string' && desg.trim() !== '');
    return Array.from(new Set(list)).sort();
  }, [employees]);

  const shiftTimes = useMemo(() => {
    const list = employees
      .map(emp => emp.shiftTime)
      .filter((shift): shift is string => typeof shift === 'string' && shift.trim() !== '');
    return Array.from(new Set(list)).sort();
  }, [employees]);

  // Reset helper
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedActiveStatus('');
    setSelectedDept('');
    setSelectedDesignation('');
    setSelectedShift('');
    setSelectedShiftMode('');
    setSelectedSalaryType('');
    setMinAbsences('');
    setMaxAbsences('');
  };

  // 2. Perform Filtering Logic
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Exclude template rows or blank rows
      const isLive = emp.name && emp.name.trim() !== '' && !emp.id.toUpperCase().startsWith('EMP_TEMP_');
      if (!isLive) return false;

      // Search Query Match (by name or ID)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = emp.name.toLowerCase().includes(query);
        const matchesId = emp.id.toLowerCase().includes(query);
        if (!matchesName && !matchesId) return false;
      }

      // Active Status Match
      if (selectedActiveStatus) {
        const status = emp.activeStatus || 'ACTIVE';
        if (status !== selectedActiveStatus) {
          return false;
        }
      }

      // Department Match
      if (selectedDept && emp.department !== selectedDept) {
        return false;
      }

      // Designation Match
      if (selectedDesignation && emp.designation !== selectedDesignation) {
        return false;
      }

      // Shift Time Match
      if (selectedShift && emp.shiftTime !== selectedShift) {
        return false;
      }

      // Shift Mode Match
      if (selectedShiftMode && (emp.shift || 'DAY') !== selectedShiftMode) {
        return false;
      }

      // Salary Basis (Type) Match
      if (selectedSalaryType && emp.salaryType !== selectedSalaryType) {
        return false;
      }

      // Absences Filters
      // An employee has: fullDaysAbsent, absentHours, absentMinutes
      // Total equivalent days of absence (e.g. fullDaysAbsent + proportional hours based on 9h shift)
      const absDays = emp.fullDaysAbsent || 0;
      
      if (minAbsences !== '') {
        const minVal = parseFloat(minAbsences);
        if (!isNaN(minVal) && absDays < minVal) {
          return false;
        }
      }

      if (maxAbsences !== '') {
        const maxVal = parseFloat(maxAbsences);
        if (!isNaN(maxVal) && absDays > maxVal) {
          return false;
        }
      }

      return true;
    });
  }, [
    employees, 
    searchQuery, 
    selectedActiveStatus,
    selectedDept, 
    selectedDesignation, 
    selectedShift, 
    selectedShiftMode,
    selectedSalaryType, 
    minAbsences, 
    maxAbsences
  ]);

  // 3. Compute Stats for the matching subset
  const filteredMetrics = useMemo(() => {
    let baseSalarySum = 0;
    let totalDeductionSum = 0;
    let finalPayableSum = 0;
    let totalAbsencesCount = 0;

    filteredEmployees.forEach(emp => {
      baseSalarySum += emp.grossSalary || 0;
      totalDeductionSum += emp.totalDeduction || 0;
      finalPayableSum += emp.finalPayable || 0;
      totalAbsencesCount += emp.fullDaysAbsent || 0;
    });

    return {
      count: filteredEmployees.length,
      baseSalarySum,
      totalDeductionSum,
      finalPayableSum,
      totalAbsencesCount
    };
  }, [filteredEmployees]);

  // Count unique employees with absences in the current filtered subset
  const { countOfEmployeesWithAbsences, totalAbsencesSum } = useMemo(() => {
    let count = 0;
    let sum = 0;
    filteredEmployees.forEach(emp => {
      if (emp.fullDaysAbsent > 0) {
        count++;
        sum += emp.fullDaysAbsent;
      }
    });
    return { countOfEmployeesWithAbsences: count, totalAbsencesSum: sum };
  }, [filteredEmployees]);

  // INR Formatter helper
  const formatINR = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Determine if any filters are currently active/applied
  const hasActiveFilters = searchQuery !== '' ||
    selectedActiveStatus !== '' ||
    selectedDept !== '' ||
    selectedDesignation !== '' ||
    selectedShift !== '' ||
    selectedShiftMode !== '' ||
    selectedSalaryType !== '' ||
    minAbsences !== '' ||
    maxAbsences !== '';

  return (
    <div className="space-y-6">
      {/* Dynamic Header Block */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-150 rounded-3xl p-6.5 shadow-xs relative overflow-hidden select-none">
        <div className="relative z-10 md:max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/50 text-emerald-800 text-[10px] font-black uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Synced Search Engine
          </div>
          <h2 className="text-xl md:text-2xl font-black text-slate-850 tracking-tight uppercase leading-none">
            Query & Search Employees
          </h2>
          <p className="text-[11.5px] text-slate-400 mt-2 font-semibold leading-relaxed">
            Search our corporate roster records in real-time. Apply combined dropdown filters for structural departments, designated roles, standard shifts, salary types, or absenteeism limits to immediately extract precise salary and deduction aggregates.
          </p>
        </div>
      </div>

      {/* Grid of aggregated indicators for matching subset */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-150 rounded-2xl p-4.5 shadow-xs transition-all hover:border-slate-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">Matches Count</p>
              <h3 className="text-xl font-black text-slate-800 mt-1.5">{filteredMetrics.count} <span className="text-[11px] text-slate-400 font-bold">employees</span></h3>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-500 shrink-0">
              <User size={16} />
            </div>
          </div>
          <div className="text-[9px] text-slate-400 font-semibold mt-2.5">
            {hasActiveFilters ? 'Showing filtered subset count' : 'Showing entire corporate workforce'}
          </div>
        </div>

        <div className="bg-white border border-slate-150 rounded-2xl p-4.5 shadow-xs transition-all hover:border-slate-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">Gross Base Salary</p>
              <h3 className="text-xl font-black text-slate-850 mt-1.5">{formatINR(filteredMetrics.baseSalarySum)}</h3>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-500 shrink-0">
              <Coins size={16} />
            </div>
          </div>
          <div className="text-[9px] text-emerald-600 font-semibold mt-2.5">
            Cumulated rate values matching filters
          </div>
        </div>

        <div className="bg-white border border-slate-150 rounded-2xl p-4.5 shadow-xs transition-all hover:border-slate-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">Total Deductions</p>
              <h3 className="text-xl font-black text-rose-600 mt-1.5">{formatINR(filteredMetrics.totalDeductionSum)}</h3>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-55 border border-slate-150 flex items-center justify-center text-slate-500 shrink-0">
              <RotateCcw size={15} className="text-rose-500" />
            </div>
          </div>
          <div className="text-[9px] text-rose-500/80 font-semibold mt-2.5">
            Total attendance penalties in this set
          </div>
        </div>

        <div className="bg-lime-50/50 border border-emerald-100 rounded-2xl p-4.5 shadow-xs transition-all hover:border-emerald-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest leading-none">Net Payable Net</p>
              <h3 className="text-xl font-black text-emerald-700 mt-1.5">{formatINR(filteredMetrics.finalPayableSum)}</h3>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-700 shrink-0">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="text-[9px] text-emerald-800/80 font-semibold mt-2.5">
            Target cash disbursement requirement
          </div>
        </div>
      </div>

      {/* Combined Interactive Filter Panel */}
      <div className="bg-white border border-slate-150 rounded-3xl p-5.5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-500" />
            <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Multi-Criteria Filter Registry</h4>
          </div>
          {hasActiveFilters && (
            <button 
              onClick={handleResetFilters}
              className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-700 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-100 hover:bg-rose-50/50 cursor-pointer transition-colors"
            >
              <RotateCcw size={12} />
              Reset All Filters
            </button>
          )}
        </div>

        {/* Global Text Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={15} />
          </div>
          <input 
            type="text" 
            placeholder="Search by Employee ID or Full Name (e.g. 'Jaswinder', '55')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-3 rounded-2xl text-[12.5px] font-bold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
          />
        </div>

        {/* Dynamic Payroll Month & Year selector for Search & Analytics */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center bg-slate-50 border border-slate-150 rounded-2xl p-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100/50 flex items-center justify-center shrink-0">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">Active Analysis Period</p>
              <h5 className="text-xs font-black text-slate-850 mt-1 uppercase">
                {monthsList[(localLedgerMonth || 6) - 1]} {localLedgerYear || 2026}
              </h5>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Month:</label>
              <select
                value={localLedgerMonth}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setLocalLedgerMonth(m);
                }}
                className="bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs font-black text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              >
                {monthsList.map((mName, idx) => (
                  <option key={mName} value={idx + 1}>{mName}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 font-semibold">
              <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Year:</label>
              <select
                value={localLedgerYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setLocalLedgerYear(y);
                }}
                className="bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs font-black text-slate-700 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              >
                {[2025, 2026, 2027].map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <div className="h-4 w-px bg-slate-200 hidden md:block" />

            {/* Absentees Indicators */}
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Absentees:</span>
                <span className="bg-rose-50 border border-rose-100 text-rose-700 font-extrabold px-2.5 py-1 rounded-md text-[11px]">
                  {countOfEmployeesWithAbsences} employees ({totalAbsencesSum} absent days)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          
          {/* Active Status dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <UserCheck size={11} className="text-emerald-600" />
              Active Status
            </label>
            <div className="relative">
              <select
                value={selectedActiveStatus}
                onChange={(e) => setSelectedActiveStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Employees</option>
                <option value="ACTIVE">Active Employees Only</option>
                <option value="INACTIVE">Inactive Employees Only</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {/* 1. Department dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <Building2 size={11} />
              Department
            </label>
            <div className="relative">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Departments ({departments.length})</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {/* 2. Designation dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <Briefcase size={11} />
              Designation
            </label>
            <div className="relative">
              <select
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Roles ({designations.length})</option>
                {designations.map(desg => (
                  <option key={desg} value={desg}>{desg}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {/* 3. Shift-time dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <Clock size={11} />
              Shift-Time
            </label>
            <div className="relative">
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Shifts ({shiftTimes.length})</option>
                {shiftTimes.map(shift => (
                  <option key={shift} value={shift}>{shift}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {/* 5. Shift Mode dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <Clock size={11} className="text-amber-500" />
              Shift Mode [D/N]
            </label>
            <div className="relative">
              <select
                value={selectedShiftMode}
                onChange={(e) => setSelectedShiftMode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Shift Modes</option>
                <option value="DAY">DAY SHIFT ONLY</option>
                <option value="NIGHT">NIGHT SHIFT ONLY</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

          {/* 4. Salary Basis dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider flex items-center gap-1 select-none">
              <DollarSign size={11} />
              Salary Basis
            </label>
            <div className="relative">
              <select
                value={selectedSalaryType}
                onChange={(e) => setSelectedSalaryType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200.5 rounded-1.5xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer"
              >
                <option value="">All Basis Structures</option>
                <option value="fixed">Monthly Fixed</option>
                <option value="daily">Daily Wage / Rate</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          </div>

        </div>

        {/* Absences Ranges Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
          {/* Min Absences */}
          <div className="flex flex-col sm:flex-row items-baseline sm:items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider shrink-0 select-none">Min Days Absent:</span>
            <div className="flex items-center gap-1.5 w-full">
              <input 
                type="number" 
                placeholder="0"
                min="0"
                max="31"
                value={minAbsences}
                onChange={(e) => setMinAbsences(e.target.value)}
                className="w-full sm:w-28 bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-800 text-center focus:outline-hidden focus:bg-white focus:border-emerald-500"
              />
              <span className="text-[10.5px] font-bold text-slate-400">Days</span>
              {minAbsences !== '' && (
                <button onClick={() => setMinAbsences('')} className="p-1 cursor-pointer hover:text-rose-500">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Max Absences */}
          <div className="flex flex-col sm:flex-row items-baseline sm:items-center gap-2 sm:justify-end">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider shrink-0 select-none">Max Days Absent:</span>
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <input 
                type="number" 
                placeholder="31"
                min="0"
                max="31"
                value={maxAbsences}
                onChange={(e) => setMaxAbsences(e.target.value)}
                className="w-full sm:w-28 bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs font-black text-slate-800 text-center focus:outline-hidden focus:bg-white focus:border-emerald-500"
              />
              <span className="text-[10.5px] font-bold text-slate-400">Days</span>
              {maxAbsences !== '' && (
                <button onClick={() => setMaxAbsences('')} className="p-1 cursor-pointer hover:text-rose-500">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Results Table */}
      <div className="bg-white rounded-3xl border border-slate-110 shadow-xs overflow-hidden">
        <div className="px-5.5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <h4 className="text-xs font-black uppercase text-slate-850 tracking-wider">
              Workforce Match Query Index
            </h4>
          </div>
          <span className="text-[10px] font-extrabold text-slate-400 font-mono">
            {filteredEmployees.length} OF {employees.length} LIVE RECORDED
          </span>
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl mx-auto flex items-center justify-center">
              <Filter size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 text-center">No employee records match the filters</p>
              <p className="text-xs text-slate-400 font-semibold mt-1 max-w-sm mx-auto">
                No active records match your specified combination of department, designation, shift-times, and absences range. Try resetting filters or keyword searches.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="search-emp-filtered-table">
              <thead>
                <tr className="bg-slate-50/30 border-b border-slate-150 text-[10.5px] font-extrabold text-slate-500 tracking-wider uppercase select-none">
                  <th className="py-3 px-4.5 font-bold">Emp ID</th>
                  <th className="py-3 px-3 font-bold">Staff Full Name</th>
                  <th className="py-3 px-3 font-bold">Dept & Role</th>
                  <th className="py-3 px-3 font-bold">Shift & Basis</th>
                  <th className="py-3 px-3 text-right font-bold">Base Salary</th>
                  <th className="py-3 px-3 text-center font-bold">Absences</th>
                  <th className="py-3 px-3 text-right font-bold">Total Deduct</th>
                  <th className="py-3 px-3 text-right font-bold text-emerald-800">Net Payable</th>
                  <th className="py-3 px-4.5 text-center font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11.5px] font-bold text-slate-700">
                {filteredEmployees.map(emp => {
                  return (
                    <tr 
                      key={emp.id} 
                      className="hover:bg-slate-50/75 transition-colors cursor-pointer"
                      onClick={() => onViewProfile(emp.id)}
                    >
                      {/* ID */}
                      <td className="py-3.5 px-4.5 text-slate-800 font-extrabold font-mono text-[11px]">
                        {emp.id}
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6.5 h-6.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-extrabold flex items-center justify-center shrink-0 uppercase select-none">
                            {(emp.name || 'E').substring(0, 2)}
                          </div>
                          <span className="text-slate-800 font-black tracking-tight">{emp.name}</span>
                        </div>
                      </td>

                      {/* Dept & Role */}
                      <td className="py-3.5 px-3">
                        <div>
                          <p className="text-slate-700 leading-tight">{emp.department || '—'}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">{emp.designation || 'Staff'}</p>
                        </div>
                      </td>

                      {/* Shift & Basis */}
                      <td className="py-3.5 px-3">
                        <div>
                          <p className="text-slate-700 leading-tight flex items-center gap-1">
                            <Clock size={11} className="text-slate-300" />
                            {emp.shiftTime || 'Not Set'}
                          </p>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5 max-w-40">
                            <span className={`inline-block text-[8px] font-black uppercase px-1 pb-0.5 rounded-sm select-none ${
                              emp.activeStatus === 'INACTIVE' 
                                ? 'bg-rose-100 text-rose-800' 
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {emp.activeStatus || 'ACTIVE'}
                            </span>
                            <span className={`inline-block text-[8px] font-black uppercase px-1 pb-0.5 rounded-sm select-none ${
                              emp.shift === 'NIGHT' 
                                ? 'bg-purple-50 text-purple-700' 
                                : 'bg-amber-50 text-amber-750'
                            }`}>
                              {(emp.shift || 'DAY')} SHIFT
                            </span>
                            <span className={`inline-block text-[8px] font-black uppercase px-1 pb-0.5 rounded-sm select-none ${
                              emp.salaryType === 'daily' 
                                ? 'bg-rose-50 text-rose-700' 
                                : 'bg-emerald-50 text-emerald-750'
                            }`}>
                              {emp.salaryType === 'daily' ? 'Daily' : 'Fixed'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Base Salary */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-semibold text-slate-850">
                          {formatINR(emp.grossSalary || 0)}
                          <p className="text-[9px] text-slate-400 font-medium font-semibold leading-none mt-0.5">
                            {emp.salaryType === 'daily' ? 'Gross Base' : 'Monthly Rate'}
                          </p>
                        </div>
                      </td>

                      {/* Absences */}
                      <td className="py-3.5 px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md bg-stone-50 border border-slate-100 font-extrabold text-[10.5px]">
                          <span className={emp.fullDaysAbsent > 0 ? 'text-rose-500 font-black' : 'text-slate-650'}>
                            {emp.fullDaysAbsent}
                          </span>
                          <span className="text-[9.5px] text-slate-400">days</span>
                        </div>
                      </td>

                      {/* Deduct */}
                      <td className="py-3.5 px-3 text-right">
                        <span className={emp.totalDeduction > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-600'}>
                          {emp.totalDeduction > 0 ? `-${formatINR(emp.totalDeduction)}` : '₹0'}
                        </span>
                      </td>

                      {/* Final Net Payable */}
                      <td className="py-3.5 px-3 text-right">
                        <span className="text-emerald-750 font-black text-xs">
                          {formatINR(emp.finalPayable || 0)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => onViewProfile(emp.id)}
                          className="p-1 px-2 text-[10px] font-black uppercase text-slate-500 hover:text-emerald-600 rounded-lg hover:bg-slate-100 flex items-center gap-0.5 mx-auto cursor-pointer transition-all"
                          title="Inspect Profile"
                        >
                          Details
                          <ChevronRight size={12} />
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
  );
}
