/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { Clock, Calendar as CalendarIcon, Plus, Info, History, Trash2, Edit, Check, X, Search, Zap, Loader2, ArrowRight, UserCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Employee } from '../types';

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

  return (
    <div className="w-full flex flex-col font-sans text-slate-705 animate-fade-in pb-10" id="overtime-employee-logs-panel">
      
      {/* Page Header Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Zap className="text-emerald-500 animate-pulse" size={24} />
            Employee Overtime Logs
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Registry to log and search overtime profiles, triple shift consecutive hours, and active work patterns
          </p>
        </div>

        {/* Display Period Filter selectors */}
        <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl px-3.5 py-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-550 shadow-sm">
          <CalendarIcon size={15} className="text-emerald-500 shrink-0" />
          <span className="shrink-0 font-bold uppercase tracking-wider text-[10px] text-slate-450">Active Ledger Filter:</span>
          
          <select
            value={filterMonth}
            onChange={(e) => {
              const val = Number(e.target.value);
              setFilterMonth(val);
              if (val !== -1 && setLedgerMonth) {
                setLedgerMonth(val + 1);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl py-1 px-2.5 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
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
              if (setLedgerYear) {
                setLedgerYear(val);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl py-1 px-2.5 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <History className="text-slate-550 animate-pulse" size={17} />
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Recorded Overtime Logs History
                  </h4>
                </div>
                <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-2.5 py-0.5 rounded-full font-mono animate-fadeIn">
                  {filteredrecordedLogs.length} Records Found
                </span>
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
                      const dateObj = new Date(log.date);
                      const displayDateStr = !isNaN(dateObj.getTime())
                        ? `${dateObj.getDate()} ${months[dateObj.getMonth()].slice(0,3)} ${dateObj.getFullYear()}`
                        : log.date;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3 font-mono font-black text-slate-600">{log.employeeId}</td>
                          <td className="py-3 font-extrabold text-slate-800 whitespace-nowrap">{log.employeeName}</td>
                          <td className="py-3 font-mono font-bold text-slate-500 whitespace-nowrap uppercase text-[9.5px]">
                            {displayDateStr}
                          </td>
                          <td className="py-3 whitespace-nowrap text-slate-650">
                            <span className="font-bold flex items-center gap-1 text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded-lg border border-slate-200">
                              {log.arrTime} <ArrowRight size={8} className="text-slate-400" /> {log.outTime}
                            </span>
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

    </div>
  );
}
