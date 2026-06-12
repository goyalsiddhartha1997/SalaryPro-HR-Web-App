/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ComputedEmployee } from '../types';
import { 
  Users, 
  IndianRupee, 
  Percent, 
  AlertTriangle, 
  TrendingDown, 
  Layers,
  Award,
  Clock,
  X,
  Search,
  Info
} from 'lucide-react';

interface DashboardProps {
  employees: ComputedEmployee[];
  ledgerMonth?: number;
  ledgerYear?: number;
  setLedgerMonth?: (m: number) => void;
  setLedgerYear?: (y: number) => void;
}

export default function Dashboard({ 
  employees,
  ledgerMonth,
  ledgerYear,
  setLedgerMonth,
  setLedgerYear
}: DashboardProps) {
  const [modalType, setModalType] = useState<'payroll' | 'deductions' | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState<'all' | 'hourly_abs' | 'full_day_abs' | 'advances_food'>('all');

  // Memoize summaries for performance
  const stats = useMemo(() => {
    const liveEmployees = employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_'));
    const totalCount = liveEmployees.length;
    let totalBaseSalary = 0;
    let totalDeductions = 0;
    let totalPayable = 0;
    let totalFullDaysAbsent = 0;
    let totalAbsentHours = 0;
    let highAbsenceCount = 0; // Employees with >= 3 days absent
    let dayShiftCount = 0;
    let nightShiftCount = 0;
    let totalSundayOT = 0;
    let totalUnrecoveredDeductions = 0;

    let totalDeductionFullDay = 0;
    let totalDeductionHourly = 0;
    let totalDeductionPartialDay = 0;
    let totalAdvancePayment = 0;
    let totalFoodBalance = 0;

    const currentMonth = ledgerMonth || 6;
    const currentYear = ledgerYear || 2026;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    let totalSalaryAmount = 0;
    let totalDailyOwed = 0;

    liveEmployees.forEach(emp => {
      // Calculate Total Salary Amount (theoretical max assuming 100% attendance)
      if (emp.salaryType === 'daily') {
        totalSalaryAmount += (emp.monthlySalary || 0) * daysInMonth;
      } else {
        totalSalaryAmount += (emp.monthlySalary || 0);
      }

      totalDailyOwed += emp.dailyRate || 0;

      totalBaseSalary += emp.grossSalary;
      totalDeductions += emp.totalDeduction;
      totalPayable += emp.finalPayable;
      totalFullDaysAbsent += emp.fullDaysAbsent;
      totalAbsentHours += emp.absentHours + (emp.absentMinutes / 60);
      const sundayOT = emp.sundayOTAmount || 0;
      totalSundayOT += sundayOT;

      totalDeductionFullDay += emp.deductionFullDay || 0;
      totalDeductionHourly += emp.deductionHourly || 0;
      totalDeductionPartialDay += emp.deductionPartialDay || 0;
      totalAdvancePayment += emp.advancePayment || 0;
      totalFoodBalance += emp.foodBalance || 0;

      // Calculate deductions that could not be fully recovered because net payable is capped at 0
      const potentialPay = emp.grossSalary + sundayOT;
      const unrecovered = Math.max(0, emp.totalDeduction - potentialPay);
      totalUnrecoveredDeductions += unrecovered;

      if (emp.fullDaysAbsent >= 3) {
        highAbsenceCount++;
      }
      if (emp.shift === 'NIGHT') {
        nightShiftCount++;
      } else {
        dayShiftCount++;
      }
    });

    const totalGrossEarnings = totalBaseSalary + totalSundayOT;
    const totalDeductionsApplied = totalDeductions - totalUnrecoveredDeductions;

    const avgPayable = totalCount > 0 ? totalPayable / totalCount : 0;
    const avgBase = totalCount > 0 ? totalBaseSalary / totalCount : 0;
    const deductionPercentage = totalGrossEarnings > 0 ? (totalDeductionsApplied / totalGrossEarnings) * 100 : 0;

    // Salary brackets breakdown
    const brackets = {
      under25: 0,
      '25to50': 0,
      '50to80': 0,
      above80: 0
    };

    liveEmployees.forEach(emp => {
      const gSalary = emp.grossSalary;
      if (gSalary < 25000) brackets.under25++;
      else if (gSalary <= 50000) brackets['25to50']++;
      else if (gSalary <= 80000) brackets['50to80']++;
      else brackets.above80++;
    });

    // Top 5 employees with highest deductions for quick auditing
    const outliers = [...liveEmployees]
      .filter(e => e.totalDeduction > 0)
      .sort((a, b) => b.totalDeduction - a.totalDeduction)
      .slice(0, 5);

    return {
      totalCount,
      totalBaseSalary,
      totalSundayOT,
      totalGrossEarnings,
      totalDeductions,
      totalDeductionsApplied,
      totalUnrecoveredDeductions,
      totalPayable,
      totalFullDaysAbsent,
      totalAbsentHours: Math.round(totalAbsentHours * 100) / 100,
      highAbsenceCount,
      avgPayable,
      deductionPercentage,
      brackets,
      outliers,
      dayShiftCount,
      nightShiftCount,
      totalDeductionFullDay,
      totalDeductionHourly,
      totalDeductionPartialDay,
      totalAdvancePayment,
      totalFoodBalance,
      totalSalaryAmount,
      totalDailyOwed,
      daysInMonth
    };
  }, [employees, ledgerMonth, ledgerYear]);

  // Helper to format currency
  const formatINR = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // SVG Chart variables
  const maxBracketVal = Math.max(
    stats.brackets.under25,
    stats.brackets['25to50'],
    stats.brackets['50to80'],
    stats.brackets.above80,
    1 // avoid division by zero
  );

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* Dynamic Month/Year Reporting Period Filter for Corporate Workforce Analytics */}
      {setLedgerMonth && setLedgerYear && ledgerMonth !== undefined && ledgerYear !== undefined && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl gap-3 select-none">
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analysis Reporting Period</h4>
            <p className="text-[11px] text-slate-400 font-medium">Select a payroll month and year to view real-time corporate analytics</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={ledgerMonth}
              onChange={(e) => setLedgerMonth(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            >
              {monthsList.map((m, idx) => (
                <option key={m} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              value={ledgerYear}
              onChange={(e) => setLedgerYear(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            >
              {[2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* KPI Overviews */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Headcount */}
        <div id="stat-total-employees" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Headcount</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate">{stats.totalCount}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold select-none">
              <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded truncate">Day Shift: {stats.dayShiftCount}</span>
              <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded truncate">Night Shift: {stats.nightShiftCount}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Total Salary Amount (Assuming 100% Attendance) */}
        <div id="stat-total-salary-amount" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate font-semibold">Total Salary Amount</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate" title={formatINR(stats.totalSalaryAmount)}>
              {formatINR(stats.totalSalaryAmount)}
            </h3>
            <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 truncate">
              For full attendance ({stats.daysInMonth} days)
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold select-none">
              <span className="text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate" title="Total daily payroll liability for full attendance on a single day">
                Daily equivalent: {formatINR(stats.totalDailyOwed)} / day
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Net Payroll (Payable) */}
        <div 
          id="stat-total-payroll" 
          onClick={() => {
            setModalType('payroll');
            setModalSearch('');
          }}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/15 active:scale-[0.99] group/card relative"
          title="Click to view detailed Net Payroll breakup"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                Net Payroll (Payable)
              </span>
              <span className="inline-flex self-start text-[9px] font-extrabold text-emerald-700 bg-emerald-100/80 border border-emerald-250 px-2 py-0.5 rounded-lg shadow-2xs select-none group-hover/card:bg-emerald-500 group-hover/card:text-white group-hover/card:border-emerald-500 transition-all font-sans uppercase tracking-wider">
                View Breakup
              </span>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <IndianRupee size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate" title={formatINR(stats.totalPayable)}>
              {formatINR(stats.totalPayable)}
            </h3>
            <div className="mt-1 space-y-0.5 text-[10px]">
              <p className="text-[#059669] font-bold truncate" title={`Base Salary: ${formatINR(stats.totalBaseSalary)}`}>
                Gross Base: {formatINR(stats.totalBaseSalary)}
              </p>
              {stats.totalSundayOT > 0 && (
                <p className="text-emerald-700 font-bold truncate" title="Extra earnings from Sunday OT shifts">
                  + Sunday OT: {formatINR(stats.totalSundayOT)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Metric 4: Total Deductions */}
        <div 
          id="stat-total-deductions" 
          onClick={() => {
            setModalType('deductions');
            setModalSearch('');
          }}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0 cursor-pointer hover:border-rose-500 hover:bg-rose-50/15 active:scale-[0.99] group/card relative"
          title="Click to view detailed Deductions breakup"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                Total Deductions
              </span>
              <span className="inline-flex self-start text-[9px] font-extrabold text-rose-700 bg-rose-100/80 border border-rose-250 px-2 py-0.5 rounded-lg shadow-2xs select-none group-hover/card:bg-rose-500 group-hover/card:text-white group-hover/card:border-rose-500 transition-all font-sans uppercase tracking-wider">
                View Breakup
              </span>
            </div>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-rose-600 tracking-tight truncate" title={formatINR(stats.totalDeductions)}>
              {formatINR(stats.totalDeductions)}
            </h3>
            <div className="mt-1 space-y-0.5 text-[10px]">
              <p className="text-rose-600 font-bold truncate" title={`Actually recovered/deducted this month: ${formatINR(stats.totalDeductionsApplied)}`}>
                Applied Rate: {stats.deductionPercentage.toFixed(1)}% of Gross
              </p>
              {stats.totalUnrecoveredDeductions > 0 && (
                <p className="text-slate-450 font-normal truncate" title="Deductions not fully recovered this month because individual employee payable cannot fall below 0. These are carried over.">
                  Capped Deficit: {formatINR(stats.totalUnrecoveredDeductions)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Charts & High-Risk Alert panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart Panel - Salary Bracket Distribution */}
        <div id="panel-salary-distribution" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Layers size={16} className="text-blue-600" />
                Salary Cohorts (Headcount Breakdown)
              </h4>
              <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600 font-medium">Auto-scaling</span>
            </div>
            <p className="text-xs text-slate-500 mb-6 font-normal">
              Visualizes how staff counts cluster into different gross base salary bands.
            </p>
          </div>

          {/* SVG Bar Chart */}
          <div className="relative h-48 w-full mt-2">
            <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 font-mono select-none">
              <div className="border-b border-dashed border-slate-100 w-full pb-1">{(maxBracketVal).toFixed(0)}</div>
              <div className="border-b border-dashed border-slate-100 w-full pb-1">{(maxBracketVal * 0.66).toFixed(0)}</div>
              <div className="border-b border-dashed border-slate-100 w-full pb-1">{(maxBracketVal * 0.33).toFixed(0)}</div>
              <div className="w-full pb-1">0</div>
            </div>

            <div className="absolute inset-x-8 bottom-0 top-3 flex justify-around items-end">
              {/* Bar 1 */}
              <div className="flex flex-col items-center w-14 group">
                <div className="text-xs font-semibold text-slate-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white rounded px-1.5 py-0.5 absolute -translate-y-8 select-none z-10">
                  {stats.brackets.under25} Staff
                </div>
                <div 
                  className="w-8 ml-0.5 rounded-t-sm bg-blue-500 hover:bg-blue-600 transition-all duration-500 cursor-pointer shadow-xs"
                  style={{ height: `${(stats.brackets.under25 / maxBracketVal) * 100}%`, minHeight: '4px' }}
                />
                <span className="text-[10px] text-slate-500 font-medium text-center mt-2 whitespace-nowrap">&lt; 25K</span>
              </div>

              {/* Bar 2 */}
              <div className="flex flex-col items-center w-14 group">
                <div className="text-xs font-semibold text-slate-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white rounded px-1.5 py-0.5 absolute -translate-y-8 select-none z-10">
                  {stats.brackets['25to50']} Staff
                </div>
                <div 
                  className="w-8 ml-0.5 rounded-t-sm bg-indigo-500 hover:bg-indigo-600 transition-all duration-500 cursor-pointer shadow-xs"
                  style={{ height: `${(stats.brackets['25to50'] / maxBracketVal) * 100}%`, minHeight: '4px' }}
                />
                <span className="text-[10px] text-slate-500 font-medium text-center mt-2 whitespace-nowrap">25K - 50K</span>
              </div>

              {/* Bar 3 */}
              <div className="flex flex-col items-center w-14 group">
                <div className="text-xs font-semibold text-slate-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white rounded px-1.5 py-0.5 absolute -translate-y-8 select-none z-10">
                  {stats.brackets['50to80']} Staff
                </div>
                <div 
                  className="w-8 ml-0.5 rounded-t-sm bg-violet-500 hover:bg-violet-600 transition-all duration-500 cursor-pointer shadow-xs"
                  style={{ height: `${(stats.brackets['50to80'] / maxBracketVal) * 100}%`, minHeight: '4px' }}
                />
                <span className="text-[10px] text-slate-500 font-medium text-center mt-2 whitespace-nowrap">50K - 80K</span>
              </div>

              {/* Bar 4 */}
              <div className="flex flex-col items-center w-14 group">
                <div className="text-xs font-semibold text-slate-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white rounded px-1.5 py-0.5 absolute -translate-y-8 select-none z-10">
                  {stats.brackets.above80} Staff
                </div>
                <div 
                  className="w-8 ml-0.5 rounded-t-sm bg-purple-500 hover:bg-purple-600 transition-all duration-500 cursor-pointer shadow-xs"
                  style={{ height: `${(stats.brackets.above80 / maxBracketVal) * 100}%`, minHeight: '4px' }}
                />
                <span className="text-[10px] text-slate-500 font-medium text-center mt-2 whitespace-nowrap">80K+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Panel - High Absences / High Deductions Audit */}
        <div id="panel-absence-audit" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-5 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 mb-1 text-rose-700">
              <AlertTriangle size={16} />
              Deductions Audit Panel
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Top 5 severe monthly deductions for HR supervisor verification.
            </p>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-48 pr-1 mt-1">
            {stats.outliers.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-slate-400 text-xs text-center border-2 border-dashed border-slate-100 rounded-lg">
                <Award size={20} className="mb-1.5 text-slate-300" />
                No deductions recorded this month!
              </div>
            ) : (
              stats.outliers.map((emp) => {
                const totalHoursAbs = emp.absentHours + (emp.absentMinutes / 60);
                return (
                  <div key={emp.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 transition-all hover:bg-slate-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded">{emp.id}</span>
                        <p className="text-xs font-semibold text-slate-800 truncate">{emp.name}</p>
                      </div>
                      <div className="flex items-center gap-2.5 text-[10px] text-slate-500 mt-1 select-none">
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} /> {emp.fullDaysAbsent}d {totalHoursAbs > 0 ? `${totalHoursAbs.toFixed(1)}h` : ''} abs
                        </span>
                        <span>•</span>
                        <span>Base: {formatINR(emp.monthlySalary)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-rose-500">-{formatINR(emp.totalDeduction)}</span>
                      <p className="text-[9px] text-slate-400 font-medium select-none">Pay: {formatINR(emp.finalPayable)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {stats.highAbsenceCount > 0 && (
            <div className="mt-3.5 bg-amber-50 border border-amber-200/60 rounded-lg p-2.5 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[10.5px] text-amber-700 leading-normal">
                Observe: <strong className="font-bold">{stats.highAbsenceCount} employees</strong> have 3 or more full days of absence this ledger period. Please check leaves/holidays configuration.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Dynamic Breakdown Modal */}
      {modalType && (
        <div 
          onClick={() => setModalType(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6 transition-all duration-300"
          id="breakdown-modal-overlay"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden font-sans animation-fade-in"
            id="breakdown-modal-content"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${modalType === 'payroll' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {modalType === 'payroll' ? <IndianRupee size={22} /> : <TrendingDown size={22} />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    {modalType === 'payroll' ? 'Corporate Net Payroll Reconciliation' : 'Comprehensive Deductions Audit Sheet'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Ledger Period: {monthsList[(ledgerMonth || 6) - 1]} {ledgerYear || 2026}
                  </p>
                </div>
              </div>

              {/* Close Button & Switcher */}
              <div className="flex items-center gap-3">
                {/* Switcher Buttons inside modal header */}
                <span className="hidden sm:inline-flex bg-slate-200/60 p-1 rounded-xl text-xs font-semibold gap-1">
                  <button 
                    onClick={() => {
                      setModalType('payroll');
                      setModalSearch('');
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${modalType === 'payroll' ? 'bg-white shadow-xs text-slate-800 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Payable
                  </button>
                  <button 
                    onClick={() => {
                      setModalType('deductions');
                      setModalSearch('');
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${modalType === 'deductions' ? 'bg-white shadow-xs text-slate-800 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    Deductions
                  </button>
                </span>
                
                <button 
                  onClick={() => setModalType(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Stat Cards Row */}
              {modalType === 'payroll' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Headcount</span>
                    <span className="text-lg font-black text-slate-800 block mt-1">{stats.totalCount}</span>
                    <span className="text-[9px] text-slate-400">active employees</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gross Base Salary</span>
                    <span className="text-lg font-black text-slate-800 block mt-1">{formatINR(stats.totalBaseSalary)}</span>
                    <span className="text-[9px] text-slate-400">for entire roster</span>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sunday Premium OT</span>
                    <span className="text-lg font-black text-slate-800 block mt-1">{formatINR(stats.totalSundayOT)}</span>
                    <span className="text-[9px] text-emerald-600 font-semibold">+{((stats.totalSundayOT / (stats.totalBaseSalary || 1)) * 100).toFixed(1)}% extra</span>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded uppercase tracking-wider inline-block">Final Net Net</span>
                    <span className="text-lg font-black text-emerald-800 block mt-1">{formatINR(stats.totalPayable)}</span>
                    <span className="text-[9px] text-emerald-600 font-semibold opacity-90">fully cleared and payable</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Full Day Absence</span>
                    <span className="text-base font-black text-slate-800 block mt-1">{formatINR(stats.totalDeductionFullDay)}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Hourly Absences</span>
                    <span className="text-base font-black text-slate-800 block mt-1">{formatINR(stats.totalDeductionHourly + stats.totalDeductionPartialDay)}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Advance Paid</span>
                    <span className="text-base font-black text-slate-800 block mt-1">{formatINR(stats.totalAdvancePayment)}</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Canteen / Food Bill</span>
                    <span className="text-base font-black text-slate-800 block mt-1">{formatINR(stats.totalFoodBalance)}</span>
                  </div>
                  <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 col-span-2 md:col-span-1">
                    <span className="text-[9px] font-bold text-rose-700 uppercase tracking-wider block">Total Deductions</span>
                    <span className="text-base font-black text-rose-800 block mt-1">{formatINR(stats.totalDeductionsApplied)}</span>
                  </div>
                </div>
              )}

              {/* Informative reconcile helper */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4.5 flex gap-3 text-slate-650 text-xs items-start">
                <Info size={16} className={`shrink-0 mt-0.5 ${modalType === 'payroll' ? 'text-emerald-600' : 'text-slate-500'}`} />
                <div>
                  {modalType === 'payroll' ? (
                    <p className="leading-relaxed">
                      <strong>Reconciliation Logic:</strong> Net Payable equals `Gross Base Salary` + `Sunday OT Pay` minus `Applied Deductions`. If an employee's total accumulated monthly deductions exceed their total monthly earnings, their net payable of that month is capped at 0, resulting in a capped unrecovered deficit of <strong>{formatINR(stats.totalUnrecoveredDeductions)}</strong> which is deferred.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      <strong>Deductions Audit:</strong> Total individual computed deductions are <strong>{formatINR(stats.totalDeductions)}</strong>. Out of this, <strong>{formatINR(stats.totalDeductionsApplied)}</strong> was applied/recovered this ledger month, and <strong>{formatINR(stats.totalUnrecoveredDeductions)}</strong> was capped to prevent net employee pay from plunging into negative balances.
                    </p>
                  )}
                </div>
              </div>

              {/* Employees List Section */}
              <div className="space-y-3">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Individual Breakdown Sheet
                    </h4>
                    {modalType === 'deductions' && (
                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-0.5 rounded-xl border border-slate-150">
                        <button 
                          onClick={() => setAuditFilter('all')}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${auditFilter === 'all' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          All ({employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_')).length})
                        </button>
                        <button 
                          onClick={() => setAuditFilter('hourly_abs')}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${auditFilter === 'hourly_abs' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Hourly Absences ({employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_')).filter(emp => (emp.deductionHourly || 0) + (emp.deductionPartialDay || 0) > 0).length})
                        </button>
                        <button 
                          onClick={() => setAuditFilter('full_day_abs')}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${auditFilter === 'full_day_abs' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Full-Day Absences ({employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_')).filter(emp => emp.fullDaysAbsent > 0).length})
                        </button>
                        <button 
                          onClick={() => setAuditFilter('advances_food')}
                          className={`px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${auditFilter === 'advances_food' ? 'bg-indigo-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          Advances & Food ({employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_')).filter(emp => (emp.advancePayment || 0) + (emp.foodBalance || 0) > 0).length})
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Search bar inside popup */}
                  <div className="relative w-full md:w-64">
                    <span className="absolute left-3 top-2.5 text-slate-400">
                      <Search size={14} />
                    </span>
                    <input 
                      type="text"
                      placeholder="Search name, ID or role..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                    />
                    {modalSearch && (
                      <button 
                        onClick={() => setModalSearch('')}
                        className="absolute right-3 top-2 text-xs font-bold text-slate-400 hover:text-slate-605 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>                {/* Table Header/Container */}
                <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs">
                      {modalType === 'payroll' ? (
                        <thead>
                          <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 select-none">
                            <th className="p-3">Employee</th>
                            <th className="p-3 text-right">Gross Base</th>
                            <th className="p-3 text-right">Sunday OT</th>
                            <th className="p-3 text-right text-rose-600">Deductions</th>
                            <th className="p-3 text-right text-emerald-700">Net Payable</th>
                          </tr>
                        </thead>
                      ) : (
                        <thead>
                          <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 select-none">
                            <th className="p-3">Employee</th>
                            <th className="p-3 text-right">Full-Day Ded.</th>
                            <th className="p-3 text-right">Hourly Ded.</th>
                            <th className="p-3 text-right">Advance Salary</th>
                            <th className="p-3 text-right">Canteen/Food</th>
                            <th className="p-3 text-right text-rose-700">Total Deduct</th>
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {(() => {
                          const live = employees.filter(emp => (emp.name || '').trim() !== '' && !emp.id.startsWith('EMP_TEMP_'));
                          let filtered = modalSearch.trim() === '' ? live : live.filter(emp => 
                            (emp.name || '').toLowerCase().includes(modalSearch.toLowerCase()) || 
                            (emp.id || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
                            (emp.role || emp.designation || '').toLowerCase().includes(modalSearch.toLowerCase())
                          );

                          if (modalType === 'deductions' && auditFilter !== 'all') {
                            if (auditFilter === 'hourly_abs') {
                              filtered = filtered.filter(emp => (emp.deductionHourly || 0) + (emp.deductionPartialDay || 0) > 0);
                            } else if (auditFilter === 'full_day_abs') {
                              filtered = filtered.filter(emp => emp.fullDaysAbsent > 0);
                            } else if (auditFilter === 'advances_food') {
                              filtered = filtered.filter(emp => (emp.advancePayment || 0) + (emp.foodBalance || 0) > 0);
                            }
                          }

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={modalType === 'payroll' ? 5 : 6} className="p-8 text-center text-slate-400 font-medium">
                                  No employees found matching "{modalSearch}"
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map(emp => {
                            const empAbsencesDed = (emp.deductionFullDay || 0) + (emp.deductionHourly || 0) + (emp.deductionPartialDay || 0);
                            return (
                              <tr key={emp.id} className="border-b border-dashed border-slate-100 hover:bg-slate-50/70 transition-all font-sans">
                                <td className="p-3 flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-150 px-1.5 py-0.5 rounded shrink-0">{emp.id}</span>
                                  <div className="min-w-0">
                                    <p className="font-bold text-slate-800 truncate">{emp.name}</p>
                                    <p className="text-[9.5px] text-slate-400 font-medium truncate uppercase">{emp.salaryType} • {emp.role || emp.designation || 'Staff'}</p>
                                  </div>
                                </td>
                                {modalType === 'payroll' ? (
                                  <>
                                    <td className="p-3 text-right font-medium text-slate-700">{formatINR(emp.grossSalary)}</td>
                                    <td className="p-3 text-right text-slate-600">
                                      {emp.sundayOTAmount > 0 ? (
                                        <span className="text-emerald-700 font-bold font-mono">+{formatINR(emp.sundayOTAmount)}</span>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3 text-right text-rose-600 font-medium">
                                      {emp.totalDeduction > 0 ? `-${formatINR(emp.totalDeduction)}` : '-'}
                                    </td>
                                    <td className="p-3 text-right font-black text-emerald-800 bg-emerald-500/5 font-mono">
                                      {formatINR(emp.finalPayable)}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-3 text-right">
                                      {emp.deductionFullDay > 0 ? (
                                        <div className="text-right">
                                          <span className="font-bold text-slate-700 font-mono">-{formatINR(emp.deductionFullDay)}</span>
                                          <p className="text-[9px] text-slate-400 font-bold font-sans">{emp.fullDaysAbsent} day{emp.fullDaysAbsent > 1 ? 's' : ''} abs</p>
                                        </div>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3 text-right">
                                      {((emp.deductionHourly || 0) + (emp.deductionPartialDay || 0)) > 0 ? (
                                        <div className="text-right" title={`Hourly: ${emp.absentHours}h ${emp.absentMinutes}m\nPartial working days deductions: ${emp.deductionPartialDay || 0}`}>
                                          <span className="font-bold text-slate-700 font-mono">-{formatINR(Math.round((emp.deductionHourly || 0) + (emp.deductionPartialDay || 0)))}</span>
                                          <p className="text-[9px] text-slate-400 font-medium font-sans">
                                            {emp.absentHours > 0 || emp.absentMinutes > 0 ? `${emp.absentHours}h ${emp.absentMinutes}m` : ''}
                                            {emp.deductionPartialDay > 0 ? ` + partial` : ''}
                                          </p>
                                          <p className="text-[8.5px] text-indigo-500 font-bold font-mono">rate: {formatINR(emp.hourlyRate)}/hr</p>
                                        </div>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3 text-right text-amber-700 font-medium">
                                      {emp.advancePayment > 0 ? (
                                        <span className="font-mono">-{formatINR(emp.advancePayment)}</span>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3 text-right text-indigo-700 font-medium">
                                      {emp.foodBalance > 0 ? (
                                        <span className="font-mono">-{formatINR(emp.foodBalance)}</span>
                                      ) : '-'}
                                    </td>
                                    <td className="p-3 text-right font-black text-rose-700 bg-rose-500/5 font-mono">
                                      -{formatINR(emp.totalDeduction)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10.5px] text-slate-400 font-medium font-sans">
              <span className="font-mono">SalaryPro Enterprise Analytics Suite v2</span>
              <button 
                onClick={() => setModalType(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 cursor-pointer transition-all hover:shadow-sm"
              >
                Close Breakup Sheet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
