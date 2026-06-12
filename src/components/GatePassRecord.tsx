/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Clock, Calendar as CalendarIcon, Plus, Info, History, Trash2, ClipboardList, Timer, Search, UserCheck, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Employee } from '../types';

interface GatePass {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  outTime: string; // "HH:MM"
  inTime: string; // "HH:MM"
  remarks: string;
  createdAt: string;
}

interface GatePassRecordProps {
  employees: Employee[];
  triggerAlert: (type: 'info' | 'success' | 'warn', msg: string) => void;
  viewOnly?: boolean;
  ledgerMonth: number; // 1-indexed (e.g., 5 is May)
  ledgerYear: number;
  setLedgerMonth?: (m: number) => void;
  setLedgerYear?: (y: number) => void;
}

export default function GatePassRecord({
  employees,
  triggerAlert,
  viewOnly = false,
  ledgerMonth,
  ledgerYear,
  setLedgerMonth,
  setLedgerYear
}: GatePassRecordProps) {
  // --- STATE FOR FORM ---
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [outTime, setOutTime] = useState<string>('12:00');
  const [inTime, setInTime] = useState<string>('13:00');
  const [remarks, setRemarks] = useState<string>('');
  const [isNoReturn, setIsNoReturn] = useState<boolean>(false);
  const [formDay, setFormDay] = useState<number>(() => new Date().getDate());
  const [formMonth, setFormMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed
  const [formYear, setFormYear] = useState<number>(() => new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // --- STATE FOR FILTER ---
  const [filterMonth, setFilterMonth] = useState<number>(-1); // Default to -1 (All Months)
  const [filterYear, setFilterYear] = useState<number>(ledgerYear);

  // --- STATE FOR SEARCHING ---
  const [empSearch, setEmpSearch] = useState<string>('');
  const [showSug, setShowSug] = useState<boolean>(false);

  // --- REAL-TIME GATE PASS RECORDS FROM FIRESTORE ---
  const [allGatePasses, setAllGatePasses] = useState<GatePass[]>([]);
  const [loadingPasses, setLoadingPasses] = useState<boolean>(true);

  // --- STATE FOR SORTING ---
  const [sortField, setSortField] = useState<'date' | 'employeeId' | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Real-time synchronization of all gate passes
  useEffect(() => {
    setLoadingPasses(true);
    const q = collection(db, 'gatePasses');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const passes: GatePass[] = [];
      snapshot.forEach((docSnap) => {
        passes.push(docSnap.data() as GatePass);
      });
      // Sort by createdAt descending
      passes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllGatePasses(passes);
      setLoadingPasses(false);
    }, (err) => {
      console.error("Failed to stream gate passes", err);
      setLoadingPasses(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync state when page-level ledger dropdown changes calendar month / year focus
  useEffect(() => {
    setFilterMonth(ledgerMonth - 1);
    setFilterYear(ledgerYear);
    // Also default the form recording inputs to match the active focused period
    setFormMonth(ledgerMonth - 1);
    setFormYear(ledgerYear);
  }, [ledgerMonth, ledgerYear]);

  // Ascending-ordered valid employee active list
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

  // Months array
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Helper days count
  const getDaysInMonth = (year: number, monthIdx: number) => {
    return new Date(year, monthIdx + 1, 0).getDate();
  };

  const formDaysInMonth = getDaysInMonth(formYear, formMonth);

  // Keep day in bound
  useEffect(() => {
    if (formDay > formDaysInMonth) {
      setFormDay(formDaysInMonth);
    }
  }, [formMonth, formYear, formDaysInMonth, formDay]);

  // Build key-string matching standard ISO data YYYY-MM-DD
  const formatIsoDate = (year: number, monthIdx: number, day: number) => {
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const selectedIsoDate = formatIsoDate(formYear, formMonth, formDay);

  // Filter Gate Pass entries based on active selected Month/Year
  const filteredrecordedPasses = useMemo(() => {
    // Deduplicate allGatePasses to prevent duplicate items from race conditions or cache updates
    const seen = new Set<string>();
    const uniquePasses = allGatePasses.filter(gp => {
      if (!gp || !gp.id) return false;
      if (seen.has(gp.id)) return false;
      seen.add(gp.id);
      return true;
    });

    return uniquePasses.filter(gp => {
      // gp.date is YYYY-MM-DD
      const dateParts = gp.date.split('-');
      if (dateParts.length === 3) {
        const yr = parseInt(dateParts[0], 10);
        const mo = parseInt(dateParts[1], 10) - 1; // 0-indexed
        const matchesYear = yr === filterYear;
        const matchesMonth = filterMonth === -1 || mo === filterMonth;
        return matchesYear && matchesMonth;
      }
      return false;
    });
  }, [allGatePasses, filterMonth, filterYear]);

  // Sort filtered Gate Pass entries based on active sort parameters
  const sortedRecordedPasses = useMemo(() => {
    const list = [...filteredrecordedPasses];
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
  }, [filteredrecordedPasses, sortField, sortDirection]);

  // Clean time formatting helper for display (e.g. "13:00" -> "01:00 PM")
  const formatTimeToShow = (timeStr: string) => {
    if (!timeStr) return '';
    if (timeStr === 'No Return') return 'No Return';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hrs = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12; // conversion of 0 to 12
    return `${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized users can record exit Gate Passes.');
      return;
    }

    if (!selectedEmpId) {
      triggerAlert('warn', 'Please select a registered employee.');
      return;
    }

    const selectedEmp = employees.find(emp => emp.id === selectedEmpId);
    if (!selectedEmp) {
      triggerAlert('warn', 'Employee profile not found in active database roster.');
      return;
    }

    if (!outTime || !inTime) {
      triggerAlert('warn', 'Please provide both OUT Time and IN Time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const passId = `GP_${Date.now()}_${selectedEmpId}`;
      const gatePassRef = doc(db, 'gatePasses', passId);

      const passPayload: GatePass = {
        id: passId,
        employeeId: selectedEmpId,
        employeeName: selectedEmp.name,
        date: selectedIsoDate,
        outTime: outTime,
        inTime: inTime,
        remarks: remarks.trim(),
        createdAt: new Date().toISOString()
      };

      await setDoc(gatePassRef, passPayload);

      triggerAlert('success', `Gate pass recorded successfully for ${selectedEmp.name} (${selectedEmpId}) on ${formDay} ${months[formMonth]} ${formYear}.`);
      
      // Reset inputs
      setRemarks('');
      setEmpSearch('');
      setSelectedEmpId('');
      setOutTime('12:00');
      setInTime('13:00');
      setIsNoReturn(false);
    } catch (err) {
      console.error('Error saving gate pass employee record', err);
      triggerAlert('warn', 'Failed to lock Gate Pass in database. Verify cloud security rules.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (passId: string, employeeName: string) => {
    if (viewOnly) {
      triggerAlert('info', 'Edit Access Denied. Only authorized users can delete records.');
      return;
    }

    if (confirm(`Are you sure you want to delete the Gate Pass record for ${employeeName}?`)) {
      try {
        await deleteDoc(doc(db, 'gatePasses', passId));
        triggerAlert('success', 'Gate pass record successfully removed.');
      } catch (err) {
        console.error('Error deleting gate pass', err);
        triggerAlert('warn', 'Failed to delete record. Please check database configuration.');
      }
    }
  };

  return (
    <div className="w-full flex flex-col font-sans text-slate-700 animate-fade-in pb-10" id="gate-pass-employee-record-panel">
      
      {/* 🧭 Header Details */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <ClipboardList className="text-amber-500 animate-pulse" size={24} />
            Gate Pass Employee Record
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
            Official record registry for authorized short-duration employee exit gate passes
          </p>
        </div>
        
        {/* Date Month Filter selection box */}
        <div className="bg-slate-100/70 border border-slate-200/50 rounded-2xl px-3.5 py-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-550 shadow-sm">
          <CalendarIcon size={15} className="text-amber-500 shrink-0" />
          <span className="shrink-0 font-bold uppercase tracking-wider text-[10px] text-slate-450">Active Display Period:</span>
          <select
            value={filterMonth}
            onChange={(e) => {
              const val = Number(e.target.value);
              setFilterMonth(val);
              if (val !== -1 && setLedgerMonth) {
                setLedgerMonth(val + 1);
              }
            }}
            className="bg-white border border-slate-200 rounded-xl py-1 px-2 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-sans"
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
            className="bg-white border border-slate-200 rounded-xl py-1 px-2 text-xs font-black text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-sans"
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Form and Log History Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* ==================== COLUMN 1: GATE PASS RECORDING FORM (5 Cols) ==================== */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Plus size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Record Gate Pass</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase text-left">Document employee checkout times below</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Employee selection with search */}
              <div className="space-y-2 relative">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Select Employee
                  </label>
                  <span className="text-[9.5px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase tracking-wider scale-90">Code Order</span>
                </div>
                
                {/* 🔍 Autocomplete Interactive Search Input */}
                <div className="relative">
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-slate-400 pointer-events-none">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search employee by name or ID..."
                      value={empSearch}
                      onChange={(e) => {
                        setEmpSearch(e.target.value);
                        setShowSug(true);
                      }}
                      onFocus={() => setShowSug(true)}
                      onBlur={() => setTimeout(() => setShowSug(false), 250)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-9 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                    />
                    {empSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmpSearch('');
                          setSelectedEmpId('');
                        }}
                        className="absolute right-3 text-slate-400 hover:text-slate-600 font-bold text-xs p-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Suggestions Popover */}
                  {showSug && (
                    <div className="absolute z-30 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                      {sortedEmployees
                        .filter(emp => {
                          const queryStr = empSearch.toLowerCase().trim();
                          if (!queryStr) return true;
                          return (emp.name || '').toLowerCase().includes(queryStr) || (emp.id || '').toLowerCase().includes(queryStr);
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
                            className={`w-full text-left px-4 py-2.5 text-xs font-bold flex justify-between items-center hover:bg-slate-50 ${
                              selectedEmpId === emp.id ? 'bg-amber-50 text-amber-700' : 'text-slate-700'
                            }`}
                          >
                            <span>{emp.name}</span>
                            <span className="font-mono bg-slate-100 text-slate-500 text-[10px] px-2 rounded-md font-bold">ID {emp.id}</span>
                          </button>
                        ))}
                      {sortedEmployees.filter(emp => {
                        const queryStr = empSearch.toLowerCase().trim();
                        if (!queryStr) return true;
                        return (emp.name || '').toLowerCase().includes(queryStr) || (emp.id || '').toLowerCase().includes(queryStr);
                      }).length === 0 && (
                        <div className="p-3 text-xs text-slate-400 text-center font-bold">No registered staff matches "{empSearch}"</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dropdown alternative */}
                <div className="flex items-center gap-2 pt-1 font-sans">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide shrink-0">Or use select:</span>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedEmpId(val);
                      if (val) {
                        const matched = sortedEmployees.find(x => x.id === val);
                        if (matched) {
                          setEmpSearch(`${matched.name} (${matched.id})`);
                        }
                      } else {
                        setEmpSearch('');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-[11px] font-bold text-slate-700 cursor-pointer focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Employee Profile --</option>
                    {sortedEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        Code {emp.id} - {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day / Month / Year of Gate Pass */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Day</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none font-sans"
                  >
                    {Array.from({ length: formDaysInMonth }, (_, idx) => idx + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Month</label>
                  <select
                    value={formMonth}
                    onChange={(e) => setFormMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-1 text-[11px] font-bold text-slate-700 focus:bg-white focus:outline-none font-sans"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>{m.slice(0, 3)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Year</label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-1 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none font-sans"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* OUT TIME & IN TIME option */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider text-left">
                    OUT TIME
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="time"
                      value={outTime}
                      onChange={(e) => setOutTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider text-left">
                    IN TIME
                  </label>
                  <div className="relative flex items-center">
                    {isNoReturn ? (
                      <div className="w-full bg-amber-50 border border-amber-200 rounded-xl py-2.5 px-3 text-xs font-black text-amber-800 flex items-center gap-1.5 cursor-not-allowed">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        No Return Today
                      </div>
                    ) : (
                      <input
                        type="time"
                        value={inTime}
                        onChange={(e) => setInTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-sans"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Not returning toggle (converting rest of shift to leave/half-day) */}
              <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col gap-2.5">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isNoReturn}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsNoReturn(checked);
                      if (checked) {
                        setInTime('No Return');
                        if (!remarks.trim()) {
                          setRemarks('Left early / remaining shift converted to leave (Half-Day)');
                        }
                      } else {
                        setInTime('13:00');
                        if (remarks === 'Left early / remaining shift converted to leave (Half-Day)') {
                          setRemarks('');
                        }
                      }
                    }}
                    className="mt-0.5 w-4 h-4 text-amber-500 bg-white border-slate-300 rounded focus:ring-amber-500 focus:ring-2 cursor-pointer checked:bg-amber-500"
                  />
                  <div className="text-xs">
                    <span className="font-extrabold text-slate-800 uppercase block tracking-wider text-[10px]">
                      Not returning today (Half-Day Leave)
                    </span>
                    <span className="text-[10px] text-slate-400 leading-normal block mt-0.5 font-bold">
                      Check this if the employee left early and will not return for today. The system logs their return as "No Return".
                    </span>
                  </div>
                </label>
                
                {isNoReturn && (
                  <div className="bg-amber-100/50 border border-amber-200/50 rounded-xl py-2 px-3 text-[10px] text-amber-800 leading-normal font-bold animate-fadeIn">
                    🚨 Marked as not returning for the rest of today's shift. This effectively logs a Half-Day Leave.
                  </div>
                )}
              </div>

              {/* Optional Explanation Remarks box */}
              <div>
                <label className="block mb-1.5 text-[11px] font-black uppercase text-slate-400 tracking-wider text-left">
                  Remarks / Reason (Optional)
                </label>
                <textarea
                  placeholder="e.g., Personal work, bank errand, medical checkpoint, offsite meetings..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4.5 rounded-xl font-black text-xs tracking-wider uppercase text-white shadow-md transition-all cursor-pointer ${
                  isSubmitting
                    ? 'bg-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/10'
                }`}
              >
                {isSubmitting ? 'Recording Registry...' : 'Record Gate Pass Entry'}
              </button>

            </form>
          </div>

        </div>

        {/* ==================== COLUMN 2: RECORDED GATE PASS ENTRIES MENU BOX (7 Cols) ==================== */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 select-none">
              <div className="flex items-center gap-2">
                <History className="text-slate-500" size={17} />
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider text-left">
                  Gate Passes log for {filterMonth === -1 ? 'All Months' : months[filterMonth]} {filterYear}
                </h4>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase font-mono bg-slate-100 px-2.5 py-0.5 rounded-lg shrink-0">
                {filteredrecordedPasses.length} logged
              </span>
            </div>

            {loadingPasses ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-20 text-slate-400">
                <Timer size={36} className="text-slate-200 stroke-1 mb-2 animate-spin" />
                <p className="text-xs font-bold uppercase tracking-wider">Syncing database stream...</p>
              </div>
            ) : filteredrecordedPasses.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-16 text-slate-400">
                <Timer size={36} className="text-slate-200 stroke-1 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">No Gate Passes recorded</p>
                <p className="text-[10px] text-slate-400 mt-1 uppercase max-w-xs leading-normal">Submit the gate pass form on the left to include a new checkout entry for this month-year</p>
              </div>
            ) : (
              <div className="overflow-x-auto text-[11px] font-sans">
              <table className="w-full text-left border-collapse select-text">
                <thead>
                  <tr className="border-b border-slate-150 text-[9px] font-black tracking-wider text-slate-400 uppercase">
                    <th 
                      className="py-2 pr-2 cursor-pointer hover:text-slate-700 transition-colors select-none"
                      onClick={() => {
                        if (sortField === 'date') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('date');
                          setSortDirection('asc');
                        }
                      }}
                      title="Sort by Date"
                    >
                      <span className="inline-flex items-center gap-1">
                        Date
                        {sortField === 'date' ? (
                          sortDirection === 'asc' ? <ArrowUp size={11} className="text-amber-500" /> : <ArrowDown size={11} className="text-amber-500" />
                        ) : (
                          <ArrowUpDown size={11} className="text-slate-300" />
                        )}
                      </span>
                    </th>
                    <th 
                      className="py-2 pr-2 cursor-pointer hover:text-slate-700 transition-colors select-none"
                      onClick={() => {
                        if (sortField === 'employeeId') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('employeeId');
                          setSortDirection('asc');
                        }
                      }}
                      title="Sort by Staff ID"
                    >
                      <span className="inline-flex items-center gap-1">
                        Staff ID
                        {sortField === 'employeeId' ? (
                          sortDirection === 'asc' ? <ArrowUp size={11} className="text-amber-500" /> : <ArrowDown size={11} className="text-amber-500" />
                        ) : (
                          <ArrowUpDown size={11} className="text-slate-300" />
                        )}
                      </span>
                    </th>
                    <th className="py-2 pr-2">Employee Name</th>
                    <th className="py-2 pr-2">OUT - IN TIME</th>
                    <th className="py-2 pr-2">Remarks</th>
                    {!viewOnly && <th className="py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {sortedRecordedPasses.map((r) => {
                      // Format date for readable view e.g. "29 May 2026"
                      const dateObj = new Date(r.date);
                      const formattedDate = isNaN(dateObj.getTime())
                        ? r.date
                        : `${dateObj.getDate()} ${months[dateObj.getMonth()].slice(0,3)} ${dateObj.getFullYear()}`;

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 font-mono font-bold text-slate-500 whitespace-nowrap uppercase text-[10px]" title={r.date}>
                            {formattedDate}
                          </td>
                          <td className="py-3 font-mono font-black text-slate-600 pr-2">{r.employeeId}</td>
                          <td className="py-3 font-extrabold text-slate-800 pr-2">{r.employeeName}</td>
                          <td className="py-3 pr-2 whitespace-nowrap">
                            {r.inTime === 'No Return' ? (
                              <span className="inline-flex items-center gap-1 font-extrabold bg-rose-50 text-rose-750 px-2.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider border border-rose-150 shadow-sm">
                                {formatTimeToShow(r.outTime)} → No Return (Half-Day)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono font-black bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-md text-[10px]">
                                {formatTimeToShow(r.outTime)} → {formatTimeToShow(r.inTime)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-slate-500 italic font-medium uppercase text-[10px] whitespace-normal break-words max-w-[280px]" title={r.remarks || '-'}>
                            {r.remarks || '-'}
                          </td>
                          {!viewOnly && (
                            <td className="py-3 text-right">
                              <button
                                onClick={() => handleDelete(r.id, r.employeeName)}
                                className="text-slate-305 hover:text-rose-600 transition-colors cursor-pointer p-1 rounded-lg hover:bg-rose-50"
                                title="Delete entry"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          )}
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
