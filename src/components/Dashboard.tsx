/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ComputedEmployee } from '../types';
import { 
  Users, 
  IndianRupee, 
  Percent, 
  AlertTriangle, 
  TrendingDown, 
  Layers,
  Award,
  Clock
} from 'lucide-react';

interface DashboardProps {
  employees: ComputedEmployee[];
}

export default function Dashboard({ employees }: DashboardProps) {
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

    liveEmployees.forEach(emp => {
      totalBaseSalary += emp.monthlySalary;
      totalDeductions += emp.totalDeduction;
      totalPayable += emp.finalPayable;
      totalFullDaysAbsent += emp.fullDaysAbsent;
      totalAbsentHours += emp.absentHours + (emp.absentMinutes / 60);
      if (emp.fullDaysAbsent >= 3) {
        highAbsenceCount++;
      }
    });

    const avgPayable = totalCount > 0 ? totalPayable / totalCount : 0;
    const avgBase = totalCount > 0 ? totalBaseSalary / totalCount : 0;
    const deductionPercentage = totalBaseSalary > 0 ? (totalDeductions / totalBaseSalary) * 100 : 0;

    // Salary brackets breakdown
    const brackets = {
      under25: 0,
      '25to50': 0,
      '50to80': 0,
      above80: 0
    };

    liveEmployees.forEach(emp => {
      if (emp.monthlySalary < 25000) brackets.under25++;
      else if (emp.monthlySalary <= 50000) brackets['25to50']++;
      else if (emp.monthlySalary <= 80000) brackets['50to80']++;
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
      totalDeductions,
      totalPayable,
      totalFullDaysAbsent,
      totalAbsentHours: Math.round(totalAbsentHours * 100) / 100,
      highAbsenceCount,
      avgPayable,
      deductionPercentage,
      brackets,
      outliers
    };
  }, [employees]);

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

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* KPI Overviews */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div id="stat-total-employees" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Headcount</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate">{stats.totalCount}</h3>
            <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 truncate">Active profiles in ledger</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div id="stat-total-payroll" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Net Payroll (Payable)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <IndianRupee size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate" title={formatINR(stats.totalPayable)}>
              {formatINR(stats.totalPayable)}
            </h3>
            <p className="text-[10.5px] text-emerald-600 font-bold mt-0.5 truncate" title={`Gross: ${formatINR(stats.totalBaseSalary)}`}>
              Gross: {formatINR(stats.totalBaseSalary)}
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div id="stat-total-deductions" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Deductions</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-rose-600 tracking-tight truncate" title={formatINR(stats.totalDeductions)}>
              {formatINR(stats.totalDeductions)}
            </h3>
            <p className="text-[10.5px] text-rose-500 font-bold mt-0.5 truncate" title={`Absence Rate: ${stats.deductionPercentage.toFixed(2)}% of Gross`}>
              Rate: {stats.deductionPercentage.toFixed(1)}% of Gross
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div id="stat-avg-payable" className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate font-semibold">Average Take-Home</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black text-slate-800 tracking-tight truncate" title={formatINR(stats.avgPayable)}>
              {formatINR(stats.avgPayable)}
            </h3>
            <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 truncate">
              Per-employee mean pay
            </p>
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
    </div>
  );
}
